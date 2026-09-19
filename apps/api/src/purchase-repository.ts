import type { PurchaseInput, PurchaseOrder, PurchaseQuery, PurchaseStatus, Supplier, SupplierInput } from "@ims/contracts";
import type { Database } from "./database.js";

const supplierColumns = 'id, name, email, phone, address, is_active AS "isActive"';
export function supplierRepository(db: Database) {
  return {
    async get(id: number, lock = false) {
      return (await db.query<Supplier>(`SELECT ${supplierColumns} FROM suppliers WHERE id = $1 ${lock ? "FOR SHARE" : ""}`, [id])).rows[0];
    },
    async list(q: string, status: string, page: number, pageSize: number) {
      const where = "FROM suppliers WHERE ($1 = '' OR strpos(lower(name), lower($1)) > 0) AND ($2 = 'all' OR is_active = ($2 = 'active'))";
      const count = await db.query<{ total: number }>(`SELECT count(*)::integer AS total ${where}`, [q, status]);
      const rows = await db.query<Supplier>(`SELECT ${supplierColumns} ${where} ORDER BY lower(name), id LIMIT $3 OFFSET $4`, [q, status, pageSize, (page - 1) * pageSize]);
      return { items: rows.rows, total: count.rows[0]!.total, page, pageSize };
    },
    async create(input: SupplierInput) {
      return (await db.query<Supplier>(`INSERT INTO suppliers (name, email, phone, address) VALUES ($1, $2, $3, $4) RETURNING ${supplierColumns}`, [input.name, input.email, input.phone, input.address])).rows[0]!;
    },
    async update(id: number, input: SupplierInput) {
      return (await db.query<Supplier>(`UPDATE suppliers SET name = $2, email = $3, phone = $4, address = $5 WHERE id = $1 RETURNING ${supplierColumns}`, [id, input.name, input.email, input.phone, input.address])).rows[0];
    },
    async status(id: number, isActive: boolean) {
      return (await db.query<Supplier>(`UPDATE suppliers SET is_active = $2 WHERE id = $1 RETURNING ${supplierColumns}`, [id, isActive])).rows[0];
    }
  };
}

type Header = Omit<PurchaseOrder, "lines">;
type HeaderRow = Omit<Header, "createdAt" | "orderedAt" | "closedAt"> & { createdAt: Date; orderedAt: Date | null; closedAt: Date | null };
const columns = `o.id, o.number, o.supplier_id AS "supplierId", s.name AS "supplierName", o.store_id AS "storeId", t.name AS "storeName",
  o.status, o.notes, o.created_at AS "createdAt", o.ordered_at AS "orderedAt", o.closed_at AS "closedAt",
  (SELECT coalesce(sum(l.ordered_qty::numeric * l.unit_cost), 0)::numeric(24,2)::text FROM purchase_order_lines l WHERE l.order_id = o.id) AS total`;
const joins = "FROM purchase_orders o JOIN suppliers s ON s.id = o.supplier_id JOIN stores t ON t.id = o.store_id";
function header(row: HeaderRow): Header { return { ...row, createdAt: row.createdAt.toISOString(), orderedAt: row.orderedAt?.toISOString() ?? null, closedAt: row.closedAt?.toISOString() ?? null }; }

export function purchaseRepository(db: Database) {
  return {
    async get(id: number, lock: "UPDATE" | "SHARE" = "SHARE"): Promise<PurchaseOrder | undefined> {
      // Lock the document before reading its lines so status and quantities describe one state.
      const result = await db.query<HeaderRow>(`SELECT ${columns} ${joins} WHERE o.id = $1 FOR ${lock} OF o`, [id]);
      if (!result.rows[0]) return undefined;
      const lines = await db.query<PurchaseOrder["lines"][number]>(`SELECT l.id, l.product_id AS "productId", p.sku, p.name,
        l.ordered_qty AS "orderedQty", l.received_qty AS "receivedQty", l.unit_cost AS "unitCost"
        FROM purchase_order_lines l JOIN products p ON p.id = l.product_id WHERE l.order_id = $1 ORDER BY l.product_id`, [id]);
      return { ...header(result.rows[0]), lines: lines.rows };
    },
    async list(query: PurchaseQuery, scopedStoreId: number | null) {
      const parameters = [scopedStoreId, query.status ?? null, query.q];
      const where = `${joins} WHERE ($1::integer IS NULL OR o.store_id = $1) AND ($2::text IS NULL OR o.status = $2)
        AND ($3 = '' OR strpos(lower(o.number), lower($3)) > 0 OR strpos(lower(s.name), lower($3)) > 0)`;
      const count = await db.query<{ total: number }>(`SELECT count(*)::integer AS total ${where}`, parameters);
      const rows = await db.query<HeaderRow>(`SELECT ${columns} ${where} ORDER BY o.id DESC LIMIT $4 OFFSET $5`, [...parameters, query.pageSize, (query.page - 1) * query.pageSize]);
      return { items: rows.rows.map(header), total: count.rows[0]!.total, page: query.page, pageSize: query.pageSize };
    },
    async create(input: PurchaseInput, userId: number) {
      const row = await db.query<{ id: number }>("INSERT INTO purchase_orders (supplier_id, store_id, notes, created_by) VALUES ($1, $2, $3, $4) RETURNING id", [input.supplierId, input.storeId, input.notes, userId]);
      const id = row.rows[0]!.id;
      for (const line of input.lines) await db.query("INSERT INTO purchase_order_lines (order_id, product_id, ordered_qty, unit_cost) VALUES ($1, $2, $3, $4)", [id, line.productId, line.orderedQty, line.unitCost]);
      return id;
    },
    async transition(id: number, status: PurchaseStatus) {
      await db.query(`UPDATE purchase_orders SET status = $2,
        ordered_at = CASE WHEN $2 = 'ORDERED' THEN clock_timestamp() ELSE ordered_at END,
        closed_at = CASE WHEN $2 IN ('RECEIVED', 'CANCELLED') THEN clock_timestamp() ELSE NULL END WHERE id = $1`, [id, status]);
    },
    async receive(lineId: number, quantity: number) {
      const changed = await db.query("UPDATE purchase_order_lines SET received_qty = received_qty + $2 WHERE id = $1 AND received_qty + $2 <= ordered_qty RETURNING id", [lineId, quantity]);
      return changed.rowCount === 1;
    }
  };
}
