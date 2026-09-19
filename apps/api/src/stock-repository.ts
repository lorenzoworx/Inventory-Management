import type { StockChange, StockChangeResult, StockItem } from "@ims/contracts";
import type { Database } from "./database.js";

export function stockRepository(db: Database) {
  return {
    async storeExists(id: number) { return (await db.query("SELECT id FROM stores WHERE id = $1", [id])).rowCount === 1; },
    async product(id: number) { return (await db.query<{ is_active: boolean }>("SELECT is_active FROM products WHERE id = $1 FOR SHARE", [id])).rows[0]; },
    async claim(input: StockChange, userId: number) {
      const claimed = await db.query("INSERT INTO stock_requests (id, user_id, payload) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING RETURNING id", [input.requestId, userId, input]);
      if (claimed.rowCount === 1) return { claimed: true as const };
      // A competing insert waits for the first transaction, so its committed result is now visible.
      const previous = await db.query<{ matches: boolean; result: StockChangeResult }>("SELECT user_id = $2 AND payload = $3::jsonb AS matches, result FROM stock_requests WHERE id = $1", [input.requestId, userId, input]);
      return { claimed: false as const, previous: previous.rows[0]! };
    },
    async lockBalance(productId: number, storeId: number) {
      await db.query("INSERT INTO stock_balances (product_id, store_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [productId, storeId]);
      await db.query("SELECT quantity FROM stock_balances WHERE product_id = $1 AND store_id = $2 FOR UPDATE", [productId, storeId]);
    },
    async hasMovements(productId: number, storeId: number) {
      return (await db.query("SELECT id FROM stock_movements WHERE product_id = $1 AND store_id = $2 LIMIT 1", [productId, storeId])).rowCount === 1;
    },
    async changeBalance(productId: number, storeId: number, delta: number) {
      const changed = await db.query<{ quantity: number }>(`UPDATE stock_balances SET quantity = (quantity::bigint + $3)::integer
        WHERE product_id = $1 AND store_id = $2 AND quantity::bigint + $3 BETWEEN 0 AND 2147483647 RETURNING quantity`, [productId, storeId, delta]);
      return changed.rows[0]?.quantity;
    },
    async movement(input: StockChange, delta: number, balance: number, userId: number) {
      const row = await db.query<{ id: number }>(`INSERT INTO stock_movements (product_id, store_id, kind, quantity, balance_after, note, actor_id, request_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, [input.productId, input.storeId, input.kind, delta, balance, input.note, userId, input.requestId]);
      return row.rows[0]!.id;
    },
    async finish(requestId: string, result: StockChangeResult) { await db.query("UPDATE stock_requests SET result = $2 WHERE id = $1", [requestId, result]); },
    async reorder(productId: number, storeId: number, reorderPoint: number) {
      await db.query(`INSERT INTO stock_balances (product_id, store_id, reorder_point) VALUES ($1, $2, $3)
        ON CONFLICT (product_id, store_id) DO UPDATE SET reorder_point = EXCLUDED.reorder_point`, [productId, storeId, reorderPoint]);
    },
    async list(storeId: number, q: string, page: number, pageSize: number) {
      const from = `FROM products p LEFT JOIN stock_balances b ON b.product_id = p.id AND b.store_id = $1
        WHERE ($2 = '' OR strpos(lower(p.name), lower($2)) > 0 OR strpos(lower(p.sku), lower($2)) > 0)
        AND (p.is_active OR coalesce(b.quantity, 0) > 0)`;
      const count = await db.query<{ total: number }>(`SELECT count(*)::integer AS total ${from}`, [storeId, q]);
      const rows = await db.query<StockItem>(`SELECT p.id AS "productId", p.sku, p.name, p.unit, p.is_active AS "isActive",
        coalesce(b.quantity, 0) AS quantity, coalesce(b.reorder_point, 0) AS "reorderPoint",
        EXISTS (SELECT 1 FROM stock_movements m WHERE m.product_id = p.id AND m.store_id = $1) AS "hasMovements"
        ${from} ORDER BY lower(p.name), p.id LIMIT $3 OFFSET $4`, [storeId, q, pageSize, (page - 1) * pageSize]);
      return { items: rows.rows, total: count.rows[0]!.total, page, pageSize };
    },
    async history(storeId: number, q: string, page: number, pageSize: number, productId?: number, kind?: string) {
      const filters = [storeId, q, productId ?? null, kind ?? null];
      const from = `FROM stock_movements m JOIN products p ON p.id = m.product_id JOIN users u ON u.id = m.actor_id
        WHERE m.store_id = $1 AND ($2 = '' OR strpos(lower(p.name), lower($2)) > 0 OR strpos(lower(p.sku), lower($2)) > 0 OR strpos(lower(m.note), lower($2)) > 0)
        AND ($3::integer IS NULL OR m.product_id = $3) AND ($4::text IS NULL OR m.kind = $4)`;
      const count = await db.query<{ total: number }>(`SELECT count(*)::integer AS total ${from}`, filters);
      const rows = await db.query(`SELECT m.id, p.id AS "productId", p.sku, p.name, m.kind, m.quantity,
        m.balance_after AS "balanceAfter", m.note, u.name AS "actorName", m.created_at AS "createdAt"
        ${from} ORDER BY m.id DESC LIMIT $5 OFFSET $6`, [...filters, pageSize, (page - 1) * pageSize]);
      return { items: rows.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })), total: count.rows[0]!.total, page, pageSize };
    }
  };
}
