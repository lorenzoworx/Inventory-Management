import type { Transfer, TransferInput, TransferQuery, TransferStatus } from "@ims/contracts";
import type { Database } from "./database.js";

type Header = Omit<Transfer, "lines">;
type HeaderRow = Omit<Header, "createdAt" | "dispatchedAt" | "receivedAt"> & { createdAt: Date; dispatchedAt: Date | null; receivedAt: Date | null };
const columns = `t.id, t.number, t.source_id AS "sourceId", s.name AS "sourceName", t.destination_id AS "destinationId", d.name AS "destinationName",
  t.status, t.notes, t.created_at AS "createdAt", t.dispatched_at AS "dispatchedAt", t.received_at AS "receivedAt",
  (SELECT sum(l.quantity)::integer FROM transfer_lines l WHERE l.transfer_id = t.id) AS "totalUnits"`;
const joins = "FROM transfers t JOIN stores s ON s.id = t.source_id JOIN stores d ON d.id = t.destination_id";
function header(row: HeaderRow): Header { return { ...row, createdAt: row.createdAt.toISOString(), dispatchedAt: row.dispatchedAt?.toISOString() ?? null, receivedAt: row.receivedAt?.toISOString() ?? null }; }

export function transferRepository(db: Database) {
  return {
    async get(id: number, lock: "SHARE" | "UPDATE"): Promise<Transfer | undefined> {
      const result = await db.query<HeaderRow>(`SELECT ${columns} ${joins} WHERE t.id = $1 FOR ${lock} OF t`, [id]);
      if (!result.rows[0]) return undefined;
      const lines = await db.query<Transfer["lines"][number]>(`SELECT l.id, l.product_id AS "productId", p.sku, p.name, l.quantity
        FROM transfer_lines l JOIN products p ON p.id = l.product_id WHERE l.transfer_id = $1 ORDER BY l.product_id`, [id]);
      return { ...header(result.rows[0]), lines: lines.rows };
    },
    async list(query: TransferQuery, storeId: number | null) {
      const parameters = [storeId, query.status ?? null, query.q];
      const from = `${joins} WHERE ($1::integer IS NULL OR t.source_id = $1 OR t.destination_id = $1)
        AND ($2::text IS NULL OR t.status = $2) AND ($3 = '' OR strpos(lower(t.number), lower($3)) > 0 OR strpos(lower(s.name), lower($3)) > 0 OR strpos(lower(d.name), lower($3)) > 0)`;
      const count = await db.query<{ total: number }>(`SELECT count(*)::integer AS total ${from}`, parameters);
      const rows = await db.query<HeaderRow>(`SELECT ${columns} ${from} ORDER BY t.id DESC LIMIT $4 OFFSET $5`, [...parameters, query.pageSize, (query.page - 1) * query.pageSize]);
      return { items: rows.rows.map(header), total: count.rows[0]!.total, page: query.page, pageSize: query.pageSize };
    },
    async destinations(page: number, pageSize: number) {
      // Directory metadata only: choosing a destination does not grant access to its stock or purchases.
      const count = await db.query<{ total: number }>("SELECT count(*)::integer AS total FROM stores");
      const rows = await db.query("SELECT id, code, name, kind FROM stores ORDER BY name, id LIMIT $1 OFFSET $2", [pageSize, (page - 1) * pageSize]);
      return { items: rows.rows, total: count.rows[0]!.total, page, pageSize };
    },
    async create(input: TransferInput, userId: number) {
      const row = await db.query<{ id: number }>("INSERT INTO transfers (source_id, destination_id, notes, created_by) VALUES ($1, $2, $3, $4) RETURNING id", [input.sourceId, input.destinationId, input.notes, userId]);
      const id = row.rows[0]!.id;
      for (const line of input.lines) await db.query("INSERT INTO transfer_lines (transfer_id, product_id, quantity) VALUES ($1, $2, $3)", [id, line.productId, line.quantity]);
      return id;
    },
    async transition(id: number, status: TransferStatus) {
      await db.query(`UPDATE transfers SET status = $2,
        dispatched_at = CASE WHEN $2 = 'IN_TRANSIT' THEN clock_timestamp() ELSE dispatched_at END,
        received_at = CASE WHEN $2 = 'RECEIVED' THEN clock_timestamp() ELSE received_at END WHERE id = $1`, [id, status]);
    }
  };
}
