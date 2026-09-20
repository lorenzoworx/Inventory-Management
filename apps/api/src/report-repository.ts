import type { MovementReportQuery, ReportQuery } from "@ims/contracts";
import type { Database } from "./database.js";

// SQL owns the arithmetic. Text casts preserve decimal and bigint precision in JSON.
const movementMeasures = {
  opening: "CASE WHEN m.kind = 'OPENING' THEN m.quantity ELSE 0 END",
  sales: "CASE WHEN m.kind = 'SALE' THEN -m.quantity::bigint ELSE 0 END",
  purchases: "CASE WHEN m.kind = 'PURCHASE' THEN m.quantity ELSE 0 END",
  adjustmentIn: "CASE WHEN m.kind = 'ADJUSTMENT' AND m.quantity > 0 THEN m.quantity ELSE 0 END",
  adjustmentOut: "CASE WHEN m.kind = 'ADJUSTMENT' AND m.quantity < 0 THEN -m.quantity::bigint ELSE 0 END",
  transferIn: "CASE WHEN m.kind = 'TRANSFER_IN' THEN m.quantity ELSE 0 END",
  transferOut: "CASE WHEN m.kind = 'TRANSFER_OUT' THEN -m.quantity::bigint ELSE 0 END",
  incoming: "CASE WHEN m.quantity > 0 THEN m.quantity ELSE 0 END",
  outgoing: "CASE WHEN m.quantity < 0 THEN -m.quantity::bigint ELSE 0 END",
  net: "m.quantity"
};
const dailyMeasures = Object.entries(movementMeasures).map(([key, expression]) => `coalesce(sum(${expression}), 0)::text AS "${key}"`).join(", ");
const totalMeasures = [...Object.keys(movementMeasures), "movementCount"].map((key) => `coalesce(sum("${key}"::numeric), 0)::text AS "${key}"`).join(", ");

export function reportRepository(db: Database) {
  return {
    async valuation(query: ReportQuery, storeId: number | null) {
      const result = await db.query(`WITH records AS (
        SELECT p.id AS "productId", p.sku, p.name, p.unit, p.is_active AS "isActive", s.id AS "storeId", s.name AS "storeName",
          b.quantity, p.cost_price::text AS "costPrice", (b.quantity::numeric * p.cost_price)::text AS value
        FROM stock_balances b JOIN products p ON p.id = b.product_id JOIN stores s ON s.id = b.store_id
        WHERE ($1::integer IS NULL OR b.store_id = $1) AND b.quantity > 0
          AND ($2 = '' OR strpos(lower(p.name), lower($2)) > 0 OR strpos(lower(p.sku), lower($2)) > 0)
      ), page AS (SELECT * FROM records ORDER BY lower("storeName"), "storeId", lower(name), "productId" LIMIT $3 OFFSET $4)
      SELECT (SELECT count(*)::integer FROM records) AS total,
        (SELECT coalesce(sum(quantity), 0)::text FROM records) AS "totalQuantity",
        (SELECT coalesce(sum(value::numeric), 0)::numeric(40,2)::text FROM records) AS "totalValue",
        coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY lower("storeName"), "storeId", lower(name), "productId") FROM page), '[]'::jsonb) AS items,
        statement_timestamp() AS "generatedAt"`, [storeId, query.q, query.pageSize, (query.page - 1) * query.pageSize]);
      const row = result.rows[0]!;
      return { ...row, page: query.page, pageSize: query.pageSize, generatedAt: row.generatedAt.toISOString() };
    },
    async lowStock(query: ReportQuery, storeId: number | null) {
      const result = await db.query(`WITH records AS (
        SELECT p.id AS "productId", p.sku, p.name, p.unit, s.id AS "storeId", s.name AS "storeName",
          coalesce(b.quantity, 0) AS quantity, coalesce(b.reorder_point, 0) AS "reorderPoint"
        FROM stores s CROSS JOIN products p LEFT JOIN stock_balances b ON b.product_id = p.id AND b.store_id = s.id
        WHERE ($1::integer IS NULL OR s.id = $1) AND p.is_active
          AND coalesce(b.quantity, 0) <= coalesce(b.reorder_point, 0)
          AND ($2 = '' OR strpos(lower(p.name), lower($2)) > 0 OR strpos(lower(p.sku), lower($2)) > 0)
      ), page AS (SELECT * FROM records ORDER BY quantity, lower("storeName"), "storeId", lower(name), "productId" LIMIT $3 OFFSET $4)
      SELECT (SELECT count(*)::integer FROM records) AS total,
        (SELECT count(*)::integer FROM records WHERE quantity = 0) AS "outOfStock",
        coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY quantity, lower("storeName"), "storeId", lower(name), "productId") FROM page), '[]'::jsonb) AS items,
        statement_timestamp() AS "generatedAt"`, [storeId, query.q, query.pageSize, (query.page - 1) * query.pageSize]);
      const row = result.rows[0]!;
      return { ...row, page: query.page, pageSize: query.pageSize, generatedAt: row.generatedAt.toISOString() };
    },
    async movements(query: MovementReportQuery, storeId: number | null) {
      const result = await db.query(`WITH bounds AS (
        SELECT coalesce($2::date, (statement_timestamp() AT TIME ZONE 'Africa/Lagos')::date) AS last_day
      ), movements AS (
        SELECT m.* FROM stock_movements m JOIN products p ON p.id = m.product_id CROSS JOIN bounds b
        WHERE ($1::integer IS NULL OR m.store_id = $1)
          AND m.created_at >= ((b.last_day - 13)::timestamp AT TIME ZONE 'Africa/Lagos')
          AND m.created_at < ((b.last_day + 1)::timestamp AT TIME ZONE 'Africa/Lagos')
          AND ($3 = '' OR strpos(lower(p.name), lower($3)) > 0 OR strpos(lower(p.sku), lower($3)) > 0)
      ), dates AS (SELECT last_day - 13 + i AS day FROM bounds CROSS JOIN generate_series(0, 13) AS i),
      daily AS (
        SELECT d.day::text AS date, ${dailyMeasures}, count(m.id)::text AS "movementCount"
        FROM dates d LEFT JOIN movements m ON (m.created_at AT TIME ZONE 'Africa/Lagos')::date = d.day GROUP BY d.day
      ), totals AS (SELECT ${totalMeasures} FROM daily)
      SELECT (SELECT (last_day - 13)::text FROM bounds) AS "startDate", (SELECT last_day::text FROM bounds) AS "endDate",
        'Africa/Lagos' AS "timeZone", (SELECT jsonb_agg(to_jsonb(daily) ORDER BY date) FROM daily) AS days,
        (SELECT to_jsonb(totals) FROM totals) AS totals, statement_timestamp() AS "generatedAt"`, [storeId, query.endDate ?? null, query.q]);
      const row = result.rows[0]!;
      return { ...row, generatedAt: row.generatedAt.toISOString() };
    }
  };
}
