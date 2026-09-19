import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import session from "express-session";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { stockChangeResultSchema, type Role } from "@ims/contracts";
import { createApp } from "../../apps/api/src/app.js";
import { transactions } from "../../apps/api/src/database.js";
import { migrateDatabase, seedDatabase } from "../../db/catalog.js";
import { connectTestDatabase, testDatabaseUrl } from "../test-database.js";
import { seedTestAccounts, testEmail, testPassword, testSessionSecret } from "../auth-fixtures.js";

let pool: Pool;
let app: ReturnType<typeof createApp>;
let agent: ReturnType<typeof request.agent>;
let csrf: string;
let productId: number;
let lagos: number;
let ibadan: number;
const verifySql = await readFile(new URL("../../db/verify-ledger.sql", import.meta.url), "utf8");

async function signIn(role: Role) {
  const account = request.agent(app);
  const anonymous = await account.get("/api/auth/session").expect(200);
  const login = await account.post("/api/auth/login").set("x-csrf-token", anonymous.body.csrfToken).send({ email: testEmail(role), password: testPassword }).expect(200);
  return { account, token: login.body.csrfToken as string };
}
function entry(kind = "OPENING", quantity = 10, storeId = lagos) {
  return { requestId: randomUUID(), productId, storeId, kind, quantity, note: "Stock integration fixture" };
}
function post(input: object) { return agent.post("/api/stock/changes").set("x-csrf-token", csrf).send(input); }
async function snapshot() {
  const balance = await pool.query("SELECT quantity, reorder_point FROM stock_balances WHERE product_id = $1 AND store_id = $2", [productId, lagos]);
  const movements = await pool.query("SELECT quantity, balance_after FROM stock_movements WHERE product_id = $1 AND store_id = $2 ORDER BY id", [productId, lagos]);
  const requests = await pool.query("SELECT id FROM stock_requests WHERE payload->>'productId' = $1 ORDER BY id", [String(productId)]);
  return { balances: balance.rows, movements: movements.rows, requests: requests.rows };
}

beforeAll(async () => {
  const guard = await connectTestDatabase();
  try { await migrateDatabase(testDatabaseUrl()); await seedDatabase(testDatabaseUrl()); await seedTestAccounts(guard); }
  finally { await guard.end(); }
  pool = new Pool({ connectionString: testDatabaseUrl(), max: 8 });
  app = createApp({ db: pool, transaction: transactions(pool), auth: { store: new session.MemoryStore(), secret: testSessionSecret, secureCookies: false } });
  const stores = await pool.query<{ id: number; code: string }>("SELECT id, code FROM stores");
  lagos = stores.rows.find((store) => store.code === "LAGOS")!.id;
  ibadan = stores.rows.find((store) => store.code === "IBADAN")!.id;
});
beforeEach(async () => {
  const created = await pool.query<{ id: number }>("INSERT INTO products (sku, name, cost_price, sell_price, category_id) SELECT $1, 'Stock test item', 10, 12, id FROM categories WHERE name = 'Pantry' RETURNING id", [`STOCK-${randomUUID()}`]);
  productId = created.rows[0]!.id;
  const login = await signIn("ADMIN"); agent = login.account; csrf = login.token;
});
afterEach(async () => {
  await transactions(pool)(async (db) => {
    await db.query("DELETE FROM stock_movements WHERE product_id = $1", [productId]);
    await db.query("DELETE FROM stock_requests WHERE payload->>'productId' = $1", [String(productId)]);
    await db.query("DELETE FROM stock_balances WHERE product_id = $1", [productId]);
    await db.query("DELETE FROM products WHERE id = $1", [productId]);
  });
});
afterAll(async () => { await pool?.end(); });

it("keeps separate store balances, signed history, and a matching ledger", async () => {
  const opening = await post(entry()).expect(201);
  expect(stockChangeResultSchema.parse(opening.body)).toMatchObject({ productId, storeId: lagos, quantity: 10, balance: 10, replayed: false });
  await post(entry("OPENING", 20, ibadan)).expect(201);
  await post(entry("SALE", 3)).expect(201);
  await post(entry("ADJUSTMENT", -2)).expect(201);
  const state = await snapshot();
  expect(state.balances).toEqual([{ quantity: 5, reorder_point: 0 }]);
  expect(state.movements).toEqual([{ quantity: 10, balance_after: 10 }, { quantity: -3, balance_after: 7 }, { quantity: -2, balance_after: 5 }]);
  const other = await pool.query("SELECT quantity FROM stock_balances WHERE product_id = $1 AND store_id = $2", [productId, ibadan]);
  expect(other.rows[0].quantity).toBe(20);
  expect((await pool.query(verifySql)).rows).toEqual([]);
  const history = await agent.get("/api/movements").query({ storeId: lagos, productId, q: "integration", pageSize: 2 }).expect(200);
  expect(history.body.total).toBe(3); expect(history.body.items).toHaveLength(2);
  expect(history.body.items[0]).toMatchObject({ kind: "ADJUSTMENT", quantity: -2, actorName: "Test admin" });
});

it("serializes concurrent sales so two requests cannot oversell ten units", async () => {
  await post(entry()).expect(201);
  const responses = await Promise.all([post(entry("SALE", 7)), post(entry("SALE", 7))]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  const state = await snapshot();
  expect(state.balances[0].quantity).toBe(3); expect(state.movements).toHaveLength(2); expect(state.requests).toHaveLength(2);
  expect((await pool.query(verifySql)).rows).toEqual([]);
});

it("posts a concurrently repeated request once and rejects reuse with different input", async () => {
  await post(entry()).expect(201);
  const sale = entry("SALE", 4);
  const responses = await Promise.all([post(sale), post(sale)]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
  expect(responses[0].body.movementId).toBe(responses[1].body.movementId);
  const replay = await post(sale).expect(200); expect(replay.body.replayed).toBe(true);
  await post({ ...sale, quantity: 5 }).expect(409);
  const state = await snapshot(); expect(state.balances[0].quantity).toBe(6); expect(state.movements).toHaveLength(2);
});

it("allows opening only before any history, including concurrent openings", async () => {
  const responses = await Promise.all([post(entry()), post(entry())]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  await post(entry("SALE", 10)).expect(201);
  const repeat = await post(entry()).expect(409); expect(repeat.body.error.code).toBe("ALREADY_OPENED");
});

it("rolls back a failed movement insert after the balance update", async () => {
  await post(entry()).expect(201);
  const before = await snapshot();
  await pool.query(`CREATE FUNCTION ims_test_reject_movement() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Forced test ledger failure'; END; $$;
    CREATE TRIGGER ims_test_reject_movement BEFORE INSERT ON stock_movements
    FOR EACH ROW WHEN (NEW.note = 'integration-rollback-failure') EXECUTE FUNCTION ims_test_reject_movement();`);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try { await post({ ...entry("SALE", 2), note: "integration-rollback-failure" }).expect(500); }
  finally {
    log.mockRestore();
    await pool.query("DROP TRIGGER ims_test_reject_movement ON stock_movements; DROP FUNCTION ims_test_reject_movement();");
  }
  expect(await snapshot()).toEqual(before);
});

it.each([
  ["zero", { quantity: 0 }], ["fraction", { quantity: 1.5 }], ["negative opening", { quantity: -1 }],
  ["negative sale", { kind: "SALE", quantity: -1 }], ["missing adjustment reason", { kind: "ADJUSTMENT", note: "" }],
  ["non-UUID", { requestId: "bad" }], ["oversized change", { quantity: 1000001 }]
])("rejects %s without writing any stock record", async (_label, overrides) => {
  await post({ ...entry(), ...overrides }).expect(400);
  expect(await snapshot()).toEqual({ balances: [], movements: [], requests: [] });
});

it("rejects negative results and preserves both balances and history", async () => {
  await post(entry()).expect(201);
  const before = await snapshot();
  await post(entry("ADJUSTMENT", -11)).expect(409);
  expect(await snapshot()).toEqual(before);
});

it("enforces viewer, staff, manager, and store permissions on every stock operation", async () => {
  await request(app).get(`/api/stock?storeId=${lagos}`).expect(401);
  await request(app).post("/api/stock/changes").send(entry()).expect(401);
  await post(entry()).expect(201);
  for (const role of ["VIEWER", "STAFF", "MANAGER"] as const) {
    const { account, token } = await signIn(role);
    await account.get(`/api/stock?storeId=${lagos}`).expect(200);
    await account.post("/api/stock/changes").set("x-csrf-token", token).send(entry("SALE", 1)).expect(role === "VIEWER" ? 403 : 201);
    await account.post("/api/stock/changes").set("x-csrf-token", token).send(entry("ADJUSTMENT", 1)).expect(role === "MANAGER" ? 201 : 403);
    await account.put("/api/stock/reorder").set("x-csrf-token", token).send({ productId, storeId: lagos, reorderPoint: 4 }).expect(role === "MANAGER" ? 200 : 403);
    if (role !== "VIEWER") {
      await account.get(`/api/stock?storeId=${ibadan}`).expect(403);
      await account.get(`/api/movements?storeId=${ibadan}`).expect(403);
      await account.post("/api/stock/changes").set("x-csrf-token", token).send(entry("SALE", 1, ibadan)).expect(403);
    }
  }
});

it("changes reorder settings without changing quantity or history", async () => {
  await post(entry()).expect(201);
  const before = await snapshot();
  await agent.put("/api/stock/reorder").set("x-csrf-token", csrf).send({ productId, storeId: lagos, reorderPoint: 8 }).expect(200);
  const after = await snapshot();
  expect(after.movements).toEqual(before.movements); expect(after.balances).toEqual([{ quantity: 10, reorder_point: 8 }]);
  await agent.put("/api/stock/reorder").set("x-csrf-token", csrf).send({ productId, storeId: lagos, reorderPoint: -1 }).expect(400);
});

it("keeps deactivated products with stock visible and permits corrective adjustments", async () => {
  const original = entry(); await post(original).expect(201);
  await pool.query("UPDATE products SET is_active = false WHERE id = $1", [productId]);
  await post(original).expect(200);
  await post(entry("SALE", 1)).expect(409);
  await post(entry("ADJUSTMENT", -1)).expect(201);
  const list = await agent.get("/api/stock").query({ storeId: lagos, q: "Stock test item" }).expect(200);
  expect(list.body.items).toContainEqual(expect.objectContaining({ productId, isActive: false, quantity: 9 }));
  const history = await agent.get("/api/movements").query({ storeId: lagos, productId, kind: "OPENING" }).expect(200);
  expect(history.body.total).toBe(1);
});

it("detects a balance/history mismatch with the verification query", async () => {
  await post(entry()).expect(201);
  await pool.query("UPDATE stock_balances SET quantity = 999 WHERE product_id = $1 AND store_id = $2", [productId, lagos]);
  expect((await pool.query(verifySql)).rows).toContainEqual({ product_id: productId, store_id: lagos, balance: 999, movement_total: "10" });
});
