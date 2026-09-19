import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import session from "express-session";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { transferSchema, transferActionResultSchema, type Role } from "@ims/contracts";
import { createApp } from "../../apps/api/src/app.js";
import { transactions } from "../../apps/api/src/database.js";
import { assertTransferAction } from "../../apps/api/src/transfer-service.js";
import { migrateDatabase, seedDatabase } from "../../db/catalog.js";
import { connectTestDatabase, testDatabaseUrl } from "../test-database.js";
import { seedTestAccounts, testEmail, testPassword, testSessionSecret } from "../auth-fixtures.js";
import { createTransferFixture, removeTransferFixture, type TransferFixture } from "../transfer-fixtures.js";

let pool: Pool; let app: ReturnType<typeof createApp>; let agent: ReturnType<typeof request.agent>; let csrf: string; let fixture: TransferFixture;
const ledger = await readFile(new URL("../../db/verify-ledger.sql", import.meta.url), "utf8");
async function signIn(role: Role) {
  const account = request.agent(app); const anonymous = await account.get("/api/auth/session").expect(200);
  const login = await account.post("/api/auth/login").set("x-csrf-token", anonymous.body.csrfToken).send({ email: testEmail(role), password: testPassword }).expect(200);
  return { account, token: login.body.csrfToken as string };
}
function post(path: string, body: object = {}) { return agent.post(path).set("x-csrf-token", csrf).send(body); }
function input(sourceId = fixture.lagos, destinationId = fixture.ibadan, quantity = 5) { return { sourceId, destinationId, notes: fixture.tag, lines: fixture.products.map((product) => ({ productId: product.id, quantity })) }; }
async function create(sourceId = fixture.lagos, destinationId = fixture.ibadan, quantity = 5) { return transferSchema.parse((await post("/api/transfers", input(sourceId, destinationId, quantity)).expect(201)).body); }
function move(id: number, action: "dispatch" | "receive", requestId = randomUUID()) { return post(`/api/transfers/${id}/${action}`, { requestId }); }
async function snapshot(id: number) {
  return { transfer: transferSchema.parse((await agent.get(`/api/transfers/${id}`).expect(200)).body),
    balances: (await pool.query("SELECT store_id, product_id, quantity FROM stock_balances WHERE product_id = ANY($1::int[]) ORDER BY store_id, product_id", [fixture.products.map((product) => product.id)])).rows,
    movements: (await pool.query("SELECT store_id, product_id, kind, quantity FROM stock_movements WHERE product_id = ANY($1::int[]) ORDER BY id", [fixture.products.map((product) => product.id)])).rows };
}
beforeAll(async () => {
  const guard = await connectTestDatabase(); try { await migrateDatabase(testDatabaseUrl()); await seedDatabase(testDatabaseUrl()); await seedTestAccounts(guard); } finally { await guard.end(); }
  pool = new Pool({ connectionString: testDatabaseUrl(), max: 8 });
  app = createApp({ db: pool, transaction: transactions(pool), auth: { store: new session.MemoryStore(), secret: testSessionSecret, secureCookies: false } });
});
beforeEach(async () => { fixture = await transactions(pool)(createTransferFixture); const login = await signIn("ADMIN"); agent = login.account; csrf = login.token; });
afterEach(async () => { await transactions(pool)((db) => removeTransferFixture(db, fixture)); });
afterAll(async () => { await pool.end(); });

it("keeps pending stock at source, separates stock in transit, and credits only the destination on receipt", async () => {
  const transfer = await create(); const before = await snapshot(transfer.id);
  expect(before.transfer.status).toBe("PENDING"); expect(before.movements).toHaveLength(4);
  await move(transfer.id, "receive").expect(409);
  const dispatch = transferActionResultSchema.parse((await move(transfer.id, "dispatch").expect(201)).body);
  expect(dispatch.status).toBe("IN_TRANSIT"); expect(dispatch.movements.every((movement) => movement.quantity === -5)).toBe(true);
  const transit = await snapshot(transfer.id);
  expect(transit.balances.filter((row) => row.store_id === fixture.lagos).map((row) => row.quantity)).toEqual([15, 15]);
  expect(transit.balances.filter((row) => row.store_id === fixture.ibadan).map((row) => row.quantity)).toEqual([20, 20]);
  await post(`/api/transfers/${transfer.id}/cancel`).expect(409);
  await move(transfer.id, "receive").expect(201);
  const received = await snapshot(transfer.id); expect(received.transfer.status).toBe("RECEIVED"); expect(received.transfer.receivedAt).not.toBeNull();
  expect(received.balances.filter((row) => row.store_id === fixture.ibadan).map((row) => row.quantity)).toEqual([25, 25]);
  expect((await pool.query(ledger)).rows).toEqual([]);
  const history = await agent.get("/api/movements").query({ storeId: fixture.lagos, productId: fixture.products[0]!.id, kind: "TRANSFER_OUT" }).expect(200);
  expect(history.body.items).toHaveLength(1); expect(history.body.items[0].note).toContain(transfer.number);
});

it("replays concurrent duplicate dispatch and receipt requests without double posting", async () => {
  const transfer = await create(); const dispatchId = randomUUID(); const receiptId = randomUUID();
  for (const [action, id] of [["dispatch", dispatchId], ["receive", receiptId]] as const) {
    const results = await Promise.all([move(transfer.id, action, id), move(transfer.id, action, id)]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 201]);
    expect(results[0]!.body.movements).toEqual(results[1]!.body.movements);
  }
  const replay = await move(transfer.id, "dispatch", dispatchId).expect(200); expect(replay.body.status).toBe("IN_TRANSIT");
  expect((await snapshot(transfer.id)).transfer.status).toBe("RECEIVED");
  await move(transfer.id, "receive", dispatchId).expect(409);
});

it("rejects distinct concurrent actions that would post either side twice", async () => {
  const transfer = await create();
  for (const action of ["dispatch", "receive"] as const) {
    const responses = await Promise.all([move(transfer.id, action), move(transfer.id, action)]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  }
  expect((await snapshot(transfer.id)).movements).toHaveLength(8);
});

it("prevents concurrent transfers from overselling their shared source", async () => {
  const [first, second] = await Promise.all([create(fixture.lagos, fixture.ibadan, 15), create(fixture.lagos, fixture.depot, 15)]);
  expect(first.number).not.toBe(second.number);
  const responses = await Promise.all([move(first.id, "dispatch"), move(second.id, "dispatch")]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  expect((await snapshot(first.id)).balances.filter((row) => row.store_id === fixture.lagos).map((row) => row.quantity)).toEqual([5, 5]);
});

it("rolls back earlier lines when a later dispatch line has insufficient stock", async () => {
  const body = input(); body.lines[1]!.quantity = 21;
  const transfer = transferSchema.parse((await post("/api/transfers", body).expect(201)).body); const before = await snapshot(transfer.id); const requestId = randomUUID();
  await move(transfer.id, "dispatch", requestId).expect(409);
  expect(await snapshot(transfer.id)).toEqual(before);
  expect((await pool.query("SELECT id FROM stock_requests WHERE id = $1", [requestId])).rowCount).toBe(0);
});

it("rolls back a whole destination receipt when the second movement fails", async () => {
  const transfer = await create(); await move(transfer.id, "dispatch").expect(201); const before = await snapshot(transfer.id); const requestId = randomUUID();
  await pool.query(`CREATE FUNCTION ims_test_fail_transfer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Forced transfer failure'; END; $$;
    CREATE TRIGGER ims_test_fail_transfer BEFORE INSERT ON stock_movements FOR EACH ROW
    WHEN (NEW.transfer_line_id = ${transfer.lines[1]!.id} AND NEW.kind = 'TRANSFER_IN') EXECUTE FUNCTION ims_test_fail_transfer();`);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try { await move(transfer.id, "receive", requestId).expect(500); }
  finally { log.mockRestore(); await pool.query("DROP TRIGGER ims_test_fail_transfer ON stock_movements; DROP FUNCTION ims_test_fail_transfer();"); }
  expect(await snapshot(transfer.id)).toEqual(before);
  await move(transfer.id, "receive", requestId).expect(201);
});

it("locks cancellation against dispatch and never cancels stock already in transit", async () => {
  const transfer = await create();
  const [cancel, dispatch] = await Promise.all([post(`/api/transfers/${transfer.id}/cancel`), move(transfer.id, "dispatch")]);
  const final = await snapshot(transfer.id);
  if (cancel.status === 200) { expect(dispatch.status).toBe(409); expect(final.transfer.status).toBe("CANCELLED"); expect(final.movements).toHaveLength(4); }
  else { expect(cancel.status).toBe(409); expect(dispatch.status).toBe(201); expect(final.transfer.status).toBe("IN_TRANSIT"); }
});

it("checks the actual source for dispatch and actual destination for receiving", async () => {
  const outbound = await create(); const inbound = await create(fixture.ibadan, fixture.lagos); const unrelated = await create(fixture.ibadan, fixture.depot);
  await request(app).get("/api/transfers").expect(401);
  await request(app).get("/api/transfers/destinations").expect(401);
  await agent.post(`/api/transfers/${outbound.id}/dispatch`).send({ requestId: randomUUID() }).expect(403);
  const { account, token } = await signIn("STAFF");
  const action = (id: number, verb: string) => account.post(`/api/transfers/${id}/${verb}`).set("x-csrf-token", token).send({ requestId: randomUUID() });
  await account.post("/api/transfers").set("x-csrf-token", token).send(input()).expect(403);
  await account.get(`/api/transfers/${outbound.id}`).expect(200); await account.get(`/api/transfers/${inbound.id}`).expect(200); await account.get(`/api/transfers/${unrelated.id}`).expect(403);
  await action(outbound.id, "cancel").expect(403); await action(inbound.id, "dispatch").expect(403);
  await action(outbound.id, "dispatch").expect(201); await action(outbound.id, "receive").expect(403);
  await move(inbound.id, "dispatch").expect(201); await action(inbound.id, "receive").expect(201);
  const list = await account.get("/api/transfers").expect(200);
  expect(list.body.items.every((row: { sourceId: number; destinationId: number }) => row.sourceId === fixture.lagos || row.destinationId === fixture.lagos)).toBe(true);
  await account.get(`/api/transfers?storeId=${fixture.ibadan}`).expect(403);
  const destinations = await account.get("/api/transfers/destinations?pageSize=100").expect(200); expect(destinations.body.items).toHaveLength(3);
  await account.get(`/api/stock?storeId=${fixture.ibadan}`).expect(403);
});

it("allows managers to create/cancel only from their source and keeps viewers read-only", async () => {
  const transfer = await create(fixture.ibadan, fixture.lagos);
  for (const role of ["MANAGER", "VIEWER"] as const) {
    const { account, token } = await signIn(role);
    await account.get(`/api/transfers/${transfer.id}`).expect(200);
    await account.post("/api/transfers").set("x-csrf-token", token).send(input()).expect(role === "MANAGER" ? 201 : 403);
    await account.post("/api/transfers").set("x-csrf-token", token).send(input(fixture.ibadan, fixture.lagos)).expect(403);
    await account.post(`/api/transfers/${transfer.id}/cancel`).set("x-csrf-token", token).send({}).expect(403);
    if (role === "VIEWER") for (const action of ["dispatch", "receive"]) await account.post(`/api/transfers/${transfer.id}/${action}`).set("x-csrf-token", token).send({ requestId: randomUUID() }).expect(403);
  }
});

it.each([0, -1, 1.5, 1000001])("rejects invalid transfer quantities: %s", async (quantity) => { await post("/api/transfers", input(fixture.lagos, fixture.ibadan, quantity)).expect(400); });
it("rejects same-store transfers, duplicate lines, missing records, and forged direct movements", async () => {
  await post("/api/transfers", input(fixture.lagos, fixture.lagos)).expect(400);
  await post("/api/transfers", { ...input(), lines: [input().lines[0], input().lines[0]] }).expect(400);
  await post("/api/transfers", { ...input(), lines: [] }).expect(400);
  await post("/api/transfers", input(fixture.lagos, 2147483647)).expect(400);
  await post("/api/transfers", { ...input(), lines: [{ productId: 2147483647, quantity: 1 }] }).expect(400);
  await post("/api/stock/changes", { requestId: randomUUID(), productId: fixture.products[0]!.id, storeId: fixture.lagos, kind: "TRANSFER_IN", quantity: 5 }).expect(400);
  const transfer = await create(); await post(`/api/transfers/${transfer.id}/dispatch`, { requestId: "bad" }).expect(400);
});

it("allows an existing transfer to finish after deactivation and rejects new inactive-product transfers", async () => {
  const transfer = await create();
  await pool.query("UPDATE products SET is_active = false WHERE id = $1", [fixture.products[0]!.id]);
  await post("/api/transfers", input()).expect(409);
  await move(transfer.id, "dispatch").expect(201); await move(transfer.id, "receive").expect(201);
});

it("rejects reused action IDs for another user or another transfer", async () => {
  const first = await create(); const second = await create(); const requestId = randomUUID();
  await move(first.id, "dispatch", requestId).expect(201); await move(second.id, "dispatch", requestId).expect(409);
  const { account, token } = await signIn("STAFF");
  await account.post(`/api/transfers/${first.id}/dispatch`).set("x-csrf-token", token).send({ requestId }).expect(409);
});

it("expresses the transfer lifecycle independently of HTTP", () => {
  expect(() => assertTransferAction("PENDING", "DISPATCH")).not.toThrow();
  expect(() => assertTransferAction("PENDING", "CANCEL")).not.toThrow();
  expect(() => assertTransferAction("IN_TRANSIT", "RECEIVE")).not.toThrow();
  expect(() => assertTransferAction("IN_TRANSIT", "CANCEL")).toThrow();
  expect(() => assertTransferAction("RECEIVED", "DISPATCH")).toThrow();
});
