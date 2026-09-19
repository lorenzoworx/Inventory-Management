import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import session from "express-session";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { purchaseSchema, purchaseReceiptResultSchema, type PurchaseOrder, type Role } from "@ims/contracts";
import { createApp } from "../../apps/api/src/app.js";
import { transactions } from "../../apps/api/src/database.js";
import { assertPurchaseAction } from "../../apps/api/src/purchase-service.js";
import { migrateDatabase, seedDatabase } from "../../db/catalog.js";
import { connectTestDatabase, testDatabaseUrl } from "../test-database.js";
import { seedTestAccounts, testEmail, testPassword, testSessionSecret } from "../auth-fixtures.js";
import { createPurchaseFixture, removePurchaseFixture, type PurchaseFixture } from "../purchase-fixtures.js";

let pool: Pool;
let app: ReturnType<typeof createApp>;
let agent: ReturnType<typeof request.agent>;
let csrf: string;
let fixture: PurchaseFixture;
const ledger = await readFile(new URL("../../db/verify-ledger.sql", import.meta.url), "utf8");
async function signIn(role: Role) {
  const account = request.agent(app);
  const anonymous = await account.get("/api/auth/session").expect(200);
  const login = await account.post("/api/auth/login").set("x-csrf-token", anonymous.body.csrfToken).send({ email: testEmail(role), password: testPassword }).expect(200);
  return { account, token: login.body.csrfToken as string };
}
function input(storeId = fixture.lagos) { return { supplierId: fixture.supplier, storeId, notes: "Test purchase", lines: fixture.products.map((product) => ({ productId: product.id, orderedQty: 10, unitCost: "10.25" })) }; }
function post(url: string, body: object = {}) { return agent.post(url).set("x-csrf-token", csrf).send(body); }
async function draft(storeId = fixture.lagos) { return purchaseSchema.parse((await post("/api/purchase-orders", input(storeId)).expect(201)).body); }
async function ordered(storeId = fixture.lagos) { const order = await draft(storeId); return purchaseSchema.parse((await post(`/api/purchase-orders/${order.id}/order`).expect(200)).body); }
function receipt(order: PurchaseOrder, quantity = 10) { return { requestId: randomUUID(), lines: order.lines.map((line) => ({ lineId: line.id, quantity })) }; }
function receive(order: PurchaseOrder, body = receipt(order)) { return post(`/api/purchase-orders/${order.id}/receive`, body); }
async function state(order: PurchaseOrder) {
  return { order: purchaseSchema.parse((await agent.get(`/api/purchase-orders/${order.id}`).expect(200)).body),
    balances: (await pool.query("SELECT product_id, quantity FROM stock_balances WHERE product_id = ANY($1::int[]) ORDER BY product_id", [fixture.products.map((product) => product.id)])).rows,
    movements: (await pool.query("SELECT product_id, quantity FROM stock_movements WHERE product_id = ANY($1::int[]) ORDER BY id", [fixture.products.map((product) => product.id)])).rows };
}
beforeAll(async () => {
  const guard = await connectTestDatabase();
  try { await migrateDatabase(testDatabaseUrl()); await seedDatabase(testDatabaseUrl()); await seedTestAccounts(guard); } finally { await guard.end(); }
  pool = new Pool({ connectionString: testDatabaseUrl(), max: 8 });
  app = createApp({ db: pool, transaction: transactions(pool), auth: { store: new session.MemoryStore(), secret: testSessionSecret, secureCookies: false } });
});
beforeEach(async () => { fixture = await createPurchaseFixture(pool); const login = await signIn("ADMIN"); agent = login.account; csrf = login.token; });
afterEach(async () => { await transactions(pool)((db) => removePurchaseFixture(db, fixture)); });
afterAll(async () => { await pool.end(); });

it("creates, orders, partially receives, and completes an order with matching ledger totals", async () => {
  const order = await draft();
  expect(order).toMatchObject({ status: "DRAFT", total: "205.00", orderedAt: null, closedAt: null });
  await receive(order).expect(409);
  await post(`/api/purchase-orders/${order.id}/order`).expect(200);
  const partialInput = { requestId: randomUUID(), lines: [{ lineId: order.lines[0]!.id, quantity: 4 }] };
  const partial = purchaseReceiptResultSchema.parse((await receive(order, partialInput).expect(201)).body);
  expect(partial.status).toBe("PARTIALLY_RECEIVED"); expect(partial.movements[0]!.balance).toBe(4);
  await post(`/api/purchase-orders/${order.id}/cancel`).expect(409);
  const rest = { requestId: randomUUID(), lines: [{ lineId: order.lines[0]!.id, quantity: 6 }, { lineId: order.lines[1]!.id, quantity: 10 }] };
  await receive(order, rest).expect(201);
  const final = await state(order);
  expect(final.order.status).toBe("RECEIVED"); expect(final.order.closedAt).not.toBeNull();
  expect(final.balances.map((row) => row.quantity)).toEqual([10, 10]); expect(final.movements).toHaveLength(3);
  expect((await pool.query(ledger)).rows).toEqual([]);
  const replay = await receive(order, partialInput).expect(200);
  expect(replay.body).toMatchObject({ replayed: true, status: "PARTIALLY_RECEIVED" });
  expect((await state(order)).order.status).toBe("RECEIVED");
  const history = await agent.get("/api/movements").query({ storeId: fixture.lagos, productId: fixture.products[0]!.id, kind: "PURCHASE" }).expect(200);
  expect(history.body.items).toHaveLength(2); expect(history.body.items[0].note).toContain(order.number);
});

it("serializes repeated receipts and returns the original result", async () => {
  const order = await ordered(); const body = receipt(order);
  const responses = await Promise.all([receive(order, body), receive(order, { ...body, lines: [...body.lines].reverse() })]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
  expect(responses[0]!.body.movements).toEqual(responses[1]!.body.movements);
  expect((await state(order)).movements).toHaveLength(2);
  await receive(order, { ...body, lines: [{ lineId: order.lines[0]!.id, quantity: 1 }] }).expect(409);
});

it("prevents two different requests from receiving the same remaining units twice", async () => {
  const order = await ordered();
  const responses = await Promise.all([receive(order), receive(order)]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  expect((await state(order)).balances.map((row) => row.quantity)).toEqual([10, 10]);
});

it("accepts concurrent partial receipts only up to the outstanding quantities", async () => {
  const order = await ordered();
  const responses = await Promise.all([receive(order, receipt(order, 4)), receive(order, receipt(order, 6))]);
  expect(responses.map((response) => response.status)).toEqual([201, 201]);
  expect((await state(order)).order.status).toBe("RECEIVED");
});

it("locks cancellation against receipt so a cancelled order never gains stock", async () => {
  const order = await ordered();
  const [cancel, received] = await Promise.all([post(`/api/purchase-orders/${order.id}/cancel`), receive(order)]);
  const final = await state(order);
  if (cancel.status === 200) { expect(received.status).toBe(409); expect(final.movements).toHaveLength(0); expect(final.order.status).toBe("CANCELLED"); }
  else { expect(cancel.status).toBe(409); expect(received.status).toBe(201); expect(final.order.status).toBe("RECEIVED"); }
});

it("uses unique sequence numbers for concurrent drafts and locks competing order transitions", async () => {
  const orders = await Promise.all([draft(), draft(), draft()]);
  expect(new Set(orders.map((order) => order.number)).size).toBe(3);
  const responses = await Promise.all([post(`/api/purchase-orders/${orders[0]!.id}/order`), post(`/api/purchase-orders/${orders[0]!.id}/order`)]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  for (const order of orders) await post(`/api/purchase-orders/${order.id}/cancel`).expect(200);
});

it("rolls back every receipt line, movement, balance, and request ID when a later movement fails", async () => {
  const order = await ordered(); const before = await state(order); const body = receipt(order);
  await pool.query(`CREATE FUNCTION ims_test_fail_purchase() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Forced purchase failure'; END; $$;
    CREATE TRIGGER ims_test_fail_purchase BEFORE INSERT ON stock_movements FOR EACH ROW
    WHEN (NEW.purchase_order_line_id = ${order.lines[1]!.id}) EXECUTE FUNCTION ims_test_fail_purchase();`);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try { await receive(order, body).expect(500); }
  finally { log.mockRestore(); await pool.query("DROP TRIGGER ims_test_fail_purchase ON stock_movements; DROP FUNCTION ims_test_fail_purchase();"); }
  expect(await state(order)).toEqual(before);
  expect((await pool.query("SELECT id FROM stock_requests WHERE id = $1", [body.requestId])).rowCount).toBe(0);
  await receive(order, body).expect(201);
});

it("rejects unknown lines and over-receipt without posting earlier lines", async () => {
  const order = await ordered(); const other = await ordered(); const before = await state(order);
  await receive(order, { requestId: randomUUID(), lines: [{ lineId: order.lines[0]!.id, quantity: 1 }, { lineId: other.lines[0]!.id, quantity: 1 }] }).expect(400);
  await receive(order, { requestId: randomUUID(), lines: [{ lineId: order.lines[0]!.id, quantity: 1 }, { lineId: order.lines[1]!.id, quantity: 11 }] }).expect(409);
  expect(await state(order)).toEqual(before);
});

it.each([0, -1, 1.5, 1000001])("rejects invalid order and receipt quantities: %s", async (quantity) => {
  const invalid = input(); invalid.lines[0]!.orderedQty = quantity;
  await post("/api/purchase-orders", invalid).expect(400);
  const order = await ordered(); await receive(order, receipt(order, quantity)).expect(400);
  expect((await state(order)).movements).toHaveLength(0);
});

it("rejects duplicate lines, empty orders, bad costs, and forged direct purchase movements", async () => {
  const body = input(); await post("/api/purchase-orders", { ...body, lines: [body.lines[0], body.lines[0]] }).expect(400);
  await post("/api/purchase-orders", { ...body, lines: [] }).expect(400);
  await post("/api/purchase-orders", { ...body, lines: [{ ...body.lines[0], unitCost: 10.25 }] }).expect(400);
  await post("/api/purchase-orders", { ...body, lines: [{ ...body.lines[0], unitCost: "-1" }] }).expect(400);
  const order = await ordered(); const line = { lineId: order.lines[0]!.id, quantity: 1 };
  await receive(order, { requestId: randomUUID(), lines: [line, line] }).expect(400);
  await post("/api/stock/changes", { requestId: randomUUID(), productId: fixture.products[0]!.id, storeId: fixture.lagos, kind: "PURCHASE", quantity: 1 }).expect(400);
});

it("enforces authentication, role, and the actual order's location for all actions", async () => {
  const local = await ordered(); const remote = await ordered(fixture.ibadan);
  await request(app).get("/api/purchase-orders").expect(401);
  await request(app).post(`/api/purchase-orders/${local.id}/receive`).send(receipt(local)).expect(401);
  await agent.post(`/api/purchase-orders/${local.id}/receive`).send(receipt(local)).expect(403);
  for (const role of ["VIEWER", "STAFF", "MANAGER"] as const) {
    const { account, token } = await signIn(role);
    const write = (path: string, body = {}) => account.post(path).set("x-csrf-token", token).send(body);
    await account.get(`/api/purchase-orders/${local.id}`).expect(200);
    await write("/api/purchase-orders", input()).expect(role === "MANAGER" ? 201 : 403);
    await write(`/api/purchase-orders/${local.id}/receive`, receipt(local, 1)).expect(role === "VIEWER" ? 403 : 201);
    await write("/api/suppliers", { name: "Forbidden", email: null, phone: null, address: null }).expect(403);
    if (role !== "VIEWER") {
      await account.get(`/api/purchase-orders/${remote.id}`).expect(403);
      await account.get("/api/purchase-orders").query({ storeId: fixture.ibadan }).expect(403);
      for (const action of ["order", "cancel", "receive"]) await write(`/api/purchase-orders/${remote.id}/${action}`, receipt(remote)).expect(403);
      const list = await account.get("/api/purchase-orders").expect(200);
      expect(list.body.items.every((order: PurchaseOrder) => order.storeId === fixture.lagos)).toBe(true);
    } else { await account.get(`/api/purchase-orders/${remote.id}`).expect(200); await write(`/api/purchase-orders/${local.id}/cancel`).expect(403); }
    if (role === "STAFF") {
      await write(`/api/purchase-orders/${local.id}/order`).expect(403);
      await write(`/api/purchase-orders/${local.id}/cancel`).expect(403);
    }
  }
});

it("preserves agreed costs and allows existing deliveries after supplier/product deactivation", async () => {
  const order = await ordered();
  await pool.query("UPDATE products SET is_active = false, cost_price = 99 WHERE id = $1", [fixture.products[0]!.id]);
  await post("/api/purchase-orders", input()).expect(409);
  await pool.query("UPDATE suppliers SET is_active = false WHERE id = $1", [fixture.supplier]);
  await post("/api/purchase-orders", input()).expect(409);
  await receive(order).expect(201);
  expect((await state(order)).order.lines[0]!.unitCost).toBe("10.25");
});

it("maintains supplier contacts, unique names, deactivation and bounded searches", async () => {
  const path = `/api/suppliers/${fixture.supplier}`;
  const details = { name: `Updated ${fixture.tag}`, email: "orders@fixture.example", phone: null, address: "Fictional address" };
  await agent.put(path).set("x-csrf-token", csrf).send(details).expect(200);
  await post("/api/suppliers", details).expect(409);
  await post("/api/suppliers", { ...details, email: "invalid" }).expect(400);
  await agent.patch(`${path}/status`).set("x-csrf-token", csrf).send({ isActive: false }).expect(200);
  const found = await agent.get("/api/suppliers").query({ status: "inactive", q: fixture.tag, pageSize: 1 }).expect(200);
  expect(found.body.items[0]).toMatchObject({ id: fixture.supplier, isActive: false });
  await agent.get("/api/suppliers?pageSize=101").expect(400);
  await agent.get("/api/purchase-orders?page=0").expect(400);
});

it("keeps opposite input line orders safe when two purchases receive into the same balances", async () => {
  const first = await ordered(); const second = await ordered(); const reversed = receipt(second); reversed.lines.reverse();
  const results = await Promise.all([receive(first), receive(second, reversed)]);
  expect(results.map((result) => result.status)).toEqual([201, 201]);
  expect((await state(first)).balances.map((row) => row.quantity)).toEqual([20, 20]);
});

it("encodes the cancellation rule independently from HTTP and rejects cancellation with any received line", () => {
  expect(() => assertPurchaseAction("DRAFT", "CANCEL", [0, 0])).not.toThrow();
  expect(() => assertPurchaseAction("ORDERED", "CANCEL", [0, 1])).toThrow("no receipts");
  expect(() => assertPurchaseAction("PARTIALLY_RECEIVED", "CANCEL", [1, 0])).toThrow();
  expect(() => assertPurchaseAction("RECEIVED", "RECEIVE", [10])).toThrow();
  expect(() => assertPurchaseAction("CANCELLED", "ORDER", [0])).toThrow();
});

it("binds receipt IDs to their user and order, including after completion", async () => {
  const order = await ordered(); const body = receipt(order);
  await receive(order, body).expect(201);
  const { account, token } = await signIn("STAFF");
  const stolen = await account.post(`/api/purchase-orders/${order.id}/receive`).set("x-csrf-token", token).send(body).expect(409);
  expect(stolen.body.error.code).toBe("REQUEST_ID_REUSED");
  const other = await ordered(); const differentOrder = receipt(other); differentOrder.requestId = body.requestId;
  const conflict = await receive(other, differentOrder).expect(409);
  expect(conflict.body.error.code).toBe("REQUEST_ID_REUSED");
  expect((await state(other)).order.status).toBe("ORDERED");
});

it("rejects missing catalog references and rechecks active products before ordering", async () => {
  await post("/api/purchase-orders", { ...input(), supplierId: 2147483647 }).expect(400);
  await post("/api/purchase-orders", { ...input(), lines: [{ productId: 2147483647, orderedQty: 1, unitCost: "1.00" }] }).expect(400);
  const order = await draft();
  await pool.query("UPDATE products SET is_active = false WHERE id = $1", [fixture.products[0]!.id]);
  await post(`/api/purchase-orders/${order.id}/order`).expect(409);
  expect((await state(order)).order.status).toBe("DRAFT");
  await post(`/api/purchase-orders/${order.id}/cancel`).expect(200);
});

it("keeps destination balances separate and enforces line constraints in PostgreSQL", async () => {
  const order = await ordered(fixture.ibadan);
  await receive(order).expect(201);
  const balances = await pool.query("SELECT DISTINCT store_id FROM stock_balances WHERE product_id = ANY($1::int[])", [fixture.products.map((product) => product.id)]);
  expect(balances.rows).toEqual([{ store_id: fixture.ibadan }]);
  await expect(pool.query("UPDATE purchase_order_lines SET received_qty = 11 WHERE id = $1", [order.lines[0]!.id])).rejects.toMatchObject({ code: "23514" });
  await expect(pool.query("INSERT INTO purchase_order_lines (order_id, product_id, ordered_qty, unit_cost) VALUES ($1, $2, 1, 1)", [order.id, order.lines[0]!.productId])).rejects.toMatchObject({ code: "23505" });
});
