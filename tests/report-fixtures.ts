import { randomUUID } from "node:crypto";
import type { User } from "@ims/contracts";
import type { Database } from "../apps/api/src/database.js";
import { stockService } from "../apps/api/src/stock-service.js";

// Caller owns a transaction on a guarded test database connection.
export async function createReportFixture(db: Database, historical = true) {
  const tag = randomUUID();
  const products: { id: number; name: string; sku: string }[] = [];
  for (const [suffix, cost] of [["A", "0.10"], ["B", "20.25"], ["Inactive", "999.99"], ["Unstocked", "5.00"]]) {
    products.push((await db.query<{ id: number; name: string; sku: string }>("INSERT INTO products (sku, name, cost_price, sell_price, category_id) SELECT $1, $2, $3, 0, id FROM categories WHERE name = 'Pantry' RETURNING id, name, sku", [`REPORT-${suffix}-${tag}`, `Report ${suffix} ${tag.slice(0, 8)}`, cost])).rows[0]!);
  }
  const stores = (await db.query<{ id: number; code: string }>("SELECT id, code FROM stores")).rows;
  const lagos = stores.find((store) => store.code === "LAGOS")!.id;
  const ibadan = stores.find((store) => store.code === "IBADAN")!.id;
  const depot = stores.find((store) => store.code === "DEPOT")!.id;
  const admin = (await db.query<User>("SELECT id, email, name, role, store_id AS \"storeId\", NULL AS \"storeName\" FROM users WHERE email = 'test-admin@uba.example'")).rows[0]!;
  const stock = stockService((work) => work(db));
  const entries = [
    [0, lagos, "OPENING", 10, "2026-09-06T23:00:00Z"],
    [0, lagos, "SALE", 3, "2026-09-20T22:59:59.999999Z"],
    [0, lagos, "ADJUSTMENT", 2, "2026-09-06T22:59:59.999999Z"],
    [0, lagos, "ADJUSTMENT", -1, "2026-09-20T23:00:00Z"],
    [1, lagos, "OPENING", 4, "2026-09-07T11:00:00Z"],
    [1, lagos, "SALE", 1, "2026-09-07T12:00:00Z"],
    [1, lagos, "ADJUSTMENT", 1, "2026-09-08T12:00:00Z"],
    [0, ibadan, "OPENING", 5, "2026-09-09T11:00:00Z"],
    [2, lagos, "OPENING", 2, "2026-09-10T11:00:00Z"]
  ] as const;
  for (const [index, storeId, kind, quantity, createdAt] of entries) {
    const result = await stock.change(admin, { requestId: randomUUID(), productId: products[index]!.id, storeId, kind, quantity, note: "Report fixture entry" });
    // Fixture-only timestamp edits exercise exact historical boundaries, including PostgreSQL microseconds.
    if (historical) await db.query("UPDATE stock_movements SET created_at = $2 WHERE id = $1", [result.movementId, createdAt]);
  }
  await stock.reorder(admin, products[0]!.id, lagos, 8);
  await stock.reorder(admin, products[1]!.id, lagos, 5);
  await db.query("UPDATE products SET is_active = false WHERE id = $1", [products[2]!.id]);
  return { tag, products, lagos, ibadan, depot, admin };
}
export type ReportFixture = Awaited<ReturnType<typeof createReportFixture>>;
export async function removeReportFixture(db: Database, fixture: ReportFixture) {
  const ids = fixture.products.map((product) => product.id);
  const orders = (await db.query<{ order_id: number }>("SELECT DISTINCT order_id FROM purchase_order_lines WHERE product_id = ANY($1::int[])", [ids])).rows.map((row) => row.order_id);
  const transfers = (await db.query<{ transfer_id: number }>("SELECT DISTINCT transfer_id FROM transfer_lines WHERE product_id = ANY($1::int[])", [ids])).rows.map((row) => row.transfer_id);
  await db.query("DELETE FROM stock_movements WHERE product_id = ANY($1::int[])", [ids]);
  await db.query("DELETE FROM stock_requests WHERE payload->>'productId' = ANY($1::text[]) OR payload->>'orderId' = ANY($2::text[]) OR payload->>'transferId' = ANY($3::text[])", [ids.map(String), orders.map(String), transfers.map(String)]);
  await db.query("DELETE FROM purchase_order_lines WHERE order_id = ANY($1::int[])", [orders]);
  await db.query("DELETE FROM purchase_orders WHERE id = ANY($1::int[])", [orders]);
  await db.query("DELETE FROM transfer_lines WHERE transfer_id = ANY($1::int[])", [transfers]);
  await db.query("DELETE FROM transfers WHERE id = ANY($1::int[])", [transfers]);
  await db.query("DELETE FROM stock_balances WHERE product_id = ANY($1::int[])", [ids]);
  await db.query("DELETE FROM products WHERE id = ANY($1::int[])", [ids]);
}
