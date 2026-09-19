import { randomUUID } from "node:crypto";
import type { User } from "@ims/contracts";
import type { Database } from "../apps/api/src/database.js";
import { stockService } from "../apps/api/src/stock-service.js";

// The caller uses a guarded test database connection and wraps this fixture in a transaction.
export async function createTransferFixture(db: Database) {
  const tag = randomUUID();
  const products: { id: number; name: string; sku: string }[] = [];
  for (const suffix of ["A", "B"]) products.push((await db.query<{ id: number; name: string; sku: string }>("INSERT INTO products (sku, name, cost_price, sell_price, category_id) SELECT $1, $2, 10, 12, id FROM categories WHERE name = 'Pantry' RETURNING id, name, sku", [`TR-${suffix}-${tag}`, `Transfer item ${suffix} ${tag.slice(0, 8)}`])).rows[0]!);
  const stores = (await db.query<{ id: number; code: string }>("SELECT id, code FROM stores")).rows;
  const lagos = stores.find((store) => store.code === "LAGOS")!.id;
  const ibadan = stores.find((store) => store.code === "IBADAN")!.id;
  const depot = stores.find((store) => store.code === "DEPOT")!.id;
  const admin = (await db.query<User>("SELECT id, email, name, role, store_id AS \"storeId\", NULL AS \"storeName\" FROM users WHERE email = 'test-admin@uba.example'")).rows[0]!;
  for (const storeId of [lagos, ibadan]) for (const product of products) await stockService((work) => work(db)).change(admin, { requestId: randomUUID(), productId: product.id, storeId, kind: "OPENING", quantity: 20, note: "Transfer test fixture" });
  return { tag, products, lagos, ibadan, depot };
}
export type TransferFixture = Awaited<ReturnType<typeof createTransferFixture>>;
export async function removeTransferFixture(db: Database, fixture: TransferFixture) {
  const ids = fixture.products.map((product) => product.id);
  await db.query("DELETE FROM stock_movements WHERE product_id = ANY($1::int[])", [ids]);
  const transfers = "SELECT transfer_id FROM transfer_lines WHERE product_id = ANY($1::int[])";
  await db.query(`DELETE FROM stock_requests WHERE payload->>'productId' = ANY($2::text[]) OR payload->>'transferId' IN (SELECT transfer_id::text FROM transfer_lines WHERE product_id = ANY($1::int[]))`, [ids, ids.map(String)]);
  const created = (await db.query<{ transfer_id: number }>(transfers, [ids])).rows.map((row) => row.transfer_id);
  await db.query("DELETE FROM transfer_lines WHERE transfer_id = ANY($1::int[])", [created]);
  await db.query("DELETE FROM transfers WHERE id = ANY($1::int[])", [created]);
  await db.query("DELETE FROM stock_balances WHERE product_id = ANY($1::int[])", [ids]);
  await db.query("DELETE FROM products WHERE id = ANY($1::int[])", [ids]);
}
