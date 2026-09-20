import { randomUUID } from "node:crypto";
import { userSchema } from "@ims/contracts";
import type { TransactionRunner } from "../apps/api/src/database.js";
import { stockService } from "../apps/api/src/stock-service.js";
import { purchaseService } from "../apps/api/src/purchase-service.js";
import { transferService } from "../apps/api/src/transfer-service.js";

const marker = "98b41117-c058-426c-9901-e27e4b57b801";

// Explicit opt-in only. All fixtures and their marker commit together on a fresh ledger.
export async function seedDemo(transaction: TransactionRunner) {
  return transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(8301801)");
    if ((await db.query("SELECT 1 FROM stock_requests WHERE id = $1", [marker])).rowCount) return false;
    const existing = await db.query(`SELECT EXISTS(SELECT 1 FROM stock_movements) OR EXISTS(SELECT 1 FROM stock_balances)
      OR EXISTS(SELECT 1 FROM purchase_orders) OR EXISTS(SELECT 1 FROM transfers) AS present`);
    if (existing.rows[0].present) throw new Error("Demo seeding requires an empty ledger with no balances, purchases, or transfers. Existing work is preserved.");
    const account = await db.query(`SELECT id, email, name, role, store_id AS "storeId", null AS "storeName" FROM users
      WHERE email = 'admin@uba.example' AND role = 'ADMIN' AND is_active`);
    if (!account.rows[0]) throw new Error("Provision the fictional accounts before seeding the demo.");
    const admin = userSchema.parse(account.rows[0]);
    const products = new Map((await db.query<{ id: number; sku: string }>("SELECT id, sku FROM products")).rows.map((row) => [row.sku, row.id]));
    const stores = new Map((await db.query<{ id: number; code: string }>("SELECT id, code FROM stores")).rows.map((row) => [row.code, row.id]));
    function product(sku: string) { const id = products.get(sku); if (!id) throw new Error(`Missing fictional product ${sku}.`); return id; }
    function store(code: string) { const id = stores.get(code); if (!id) throw new Error(`Missing fictional location ${code}.`); return id; }
    const within: TransactionRunner = (work) => work(db);
    const stock = stockService(within); const purchases = purchaseService(within); const transfers = transferService(within);
    // Lagos has no clock changes: stepping back 24 hours preserves the local time of day.
    const seededAt = Date.now();
    const at = (daysAgo: number) => new Date(seededAt - daysAgo * 86400000).toISOString();
    // Only this initial fictional seed assigns historical dates. Normal operations never rewrite history.
    async function dateMovements(requestId: string, daysAgo: number) {
      await db.query("UPDATE stock_movements SET created_at = $2 WHERE request_id = $1", [requestId, at(daysAgo)]);
      await db.query("UPDATE stock_requests SET created_at = $2 WHERE id = $1", [requestId, at(daysAgo)]);
    }
    for (const [location, quantities] of [["LAGOS", [30, 24, 120, 18, 40]], ["IBADAN", [18, 16, 80, 12, 25]], ["DEPOT", [100, 80, 400, 90, 160]]] as const) {
      for (const [index, sku] of ["RICE-001", "BEANS-001", "WATER-001", "JUICE-001", "SOAP-001"].entries()) {
        const requestId = location === "LAGOS" && index === 0 ? marker : randomUUID();
        await stock.change(admin, { requestId, productId: product(sku), storeId: store(location), kind: "OPENING", quantity: quantities[index]!, note: "Fictional demo opening balance" });
        await dateMovements(requestId, 13);
        await stock.reorder(admin, product(sku), store(location), location === "DEPOT" ? 40 : sku === "WATER-001" ? 50 : 15);
      }
    }
    for (let day = 12; day >= 0; day--) {
      for (const [sku, quantity] of [["WATER-001", 4], ["RICE-001", 1], ["JUICE-001", 1]] as const) {
        const requestId = randomUUID();
        await stock.change(admin, { requestId, productId: product(sku), storeId: store("LAGOS"), kind: "SALE", quantity, note: "Fictional daily sales" });
        await dateMovements(requestId, day);
      }
    }
    const adjustment = randomUUID();
    await stock.change(admin, { requestId: adjustment, productId: product("SOAP-001"), storeId: store("IBADAN"), kind: "ADJUSTMENT", quantity: -2, note: "Fictional stock count: two damaged bars" });
    await dateMovements(adjustment, 0);
    const supplier = (await db.query<{ id: number }>("SELECT id FROM suppliers WHERE name = 'Sunrise Pantry Supply'")).rows[0];
    if (!supplier) throw new Error("Seed fictional suppliers first.");
    for (const partial of [false, true]) {
      const order = await purchases.create(admin, { supplierId: supplier.id, storeId: store("DEPOT"), notes: partial ? "Fictional delivery awaiting its remaining cartons" : "Fictional completed delivery",
        lines: [{ productId: product(partial ? "JUICE-001" : "RICE-001"), orderedQty: 20, unitCost: partial ? "950.00" : "15000.00" }] });
      await purchases.transition(admin, order.id, "ORDER");
      const requestId = randomUUID();
      await purchases.receive(admin, order.id, { requestId, lines: [{ lineId: order.lines[0]!.id, quantity: partial ? 8 : 20 }] });
      await dateMovements(requestId, 0);
      await db.query("UPDATE purchase_orders SET created_at = $2, ordered_at = $2, closed_at = CASE WHEN status = 'RECEIVED' THEN $2::timestamptz ELSE NULL END WHERE id = $1", [order.id, at(0)]);
    }
    for (const state of ["RECEIVED", "IN_TRANSIT", "PENDING"] as const) {
      const transfer = await transfers.create(admin, { sourceId: store("DEPOT"), destinationId: store(state === "RECEIVED" ? "LAGOS" : "IBADAN"), notes: `Fictional ${state.toLowerCase().replace("_", " ")} replenishment`,
        lines: [{ productId: product("WATER-001"), quantity: 24 }, { productId: product("SOAP-001"), quantity: 10 }] });
      if (state !== "PENDING") {
        const dispatch = randomUUID(); await transfers.move(admin, transfer.id, "DISPATCH", dispatch); await dateMovements(dispatch, 0);
      }
      if (state === "RECEIVED") { const receipt = randomUUID(); await transfers.move(admin, transfer.id, "RECEIVE", receipt); await dateMovements(receipt, 0); }
      await db.query(`UPDATE transfers SET created_at = $2, dispatched_at = CASE WHEN status <> 'PENDING' THEN $3::timestamptz ELSE NULL END,
        received_at = CASE WHEN status = 'RECEIVED' THEN $4::timestamptz ELSE NULL END WHERE id = $1`, [transfer.id, at(0), at(0), at(0)]);
    }
    return true;
  });
}
