import { randomUUID } from "node:crypto";
import type { Database } from "../apps/api/src/database.js";

export async function createPurchaseFixture(db: Database) {
  const tag = randomUUID();
  const supplier = (await db.query<{ id: number }>("INSERT INTO suppliers (name) VALUES ($1) RETURNING id", [`Purchase fixture ${tag}`])).rows[0]!.id;
  const products: { id: number; sku: string; name: string }[] = [];
  for (const suffix of ["A", "B"]) {
    const row = await db.query<{ id: number; sku: string; name: string }>("INSERT INTO products (sku, name, cost_price, sell_price, category_id) SELECT $1, $2, 10.25, 15, id FROM categories WHERE name = 'Pantry' RETURNING id, sku, name", [`PO-${suffix}-${tag}`, `Purchase item ${suffix} ${tag.slice(0, 8)}`]);
    products.push(row.rows[0]!);
  }
  const stores = (await db.query<{ id: number; code: string }>("SELECT id, code FROM stores")).rows;
  return { tag, supplier, products, lagos: stores.find((store) => store.code === "LAGOS")!.id, ibadan: stores.find((store) => store.code === "IBADAN")!.id };
}
export type PurchaseFixture = Awaited<ReturnType<typeof createPurchaseFixture>>;

// Call on a guarded test connection, inside a transaction. Preserve unrelated test fixtures.
export async function removePurchaseFixture(db: Database, fixture: PurchaseFixture) {
  const productIds = fixture.products.map((product) => product.id);
  await db.query("DELETE FROM stock_movements WHERE product_id = ANY($1::int[])", [productIds]);
  await db.query("DELETE FROM stock_requests WHERE payload->>'orderId' IN (SELECT id::text FROM purchase_orders WHERE supplier_id = $1)", [fixture.supplier]);
  await db.query("DELETE FROM purchase_order_lines WHERE order_id IN (SELECT id FROM purchase_orders WHERE supplier_id = $1)", [fixture.supplier]);
  await db.query("DELETE FROM purchase_orders WHERE supplier_id = $1", [fixture.supplier]);
  await db.query("DELETE FROM stock_balances WHERE product_id = ANY($1::int[])", [productIds]);
  await db.query("DELETE FROM products WHERE id = ANY($1::int[])", [productIds]);
  await db.query("DELETE FROM suppliers WHERE id = $1", [fixture.supplier]);
}
