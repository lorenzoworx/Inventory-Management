import { Pool, type Client } from "pg";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { type Role } from "@ims/contracts";
import { createApp } from "../../apps/api/src/app.js";
import { migrateDatabase, seedDatabase } from "../../db/catalog.js";
import { connectTestDatabase, testDatabaseUrl, testTransaction } from "../test-database.js";
import { seedTestAccounts, testEmail, testPassword, testSessionSecret } from "../auth-fixtures.js";

const PgStore = connectPgSimple(session);
let pool: Pool;
const stores: InstanceType<typeof PgStore>[] = [];
let client: Client;
let app: ReturnType<typeof createApp>;
let lagos: number;
let ibadan: number;
let productId: number;
let categoryId: number;
const sessionIds = new Set<string>();

function rememberCookie(response: request.Response) {
  const cookie = response.headers["set-cookie"]?.[0] as string | undefined;
  if (cookie) {
    const value = decodeURIComponent(cookie.split(";")[0]!.split("=").slice(1).join("="));
    if (value.startsWith("s:")) sessionIds.add(value.slice(2, value.lastIndexOf(".")));
  }
  return cookie?.split(";")[0];
}
function makeApp(secureCookies = false, loginLimit = 10, trustProxy = false) {
  const store = new PgStore({ pool, tableName: "web_sessions", createTableIfMissing: false, pruneSessionInterval: false });
  stores.push(store);
  return createApp({ db: client, transaction: testTransaction(client), auth: { store, secret: testSessionSecret, secureCookies, loginLimit }, trustProxy });
}
async function login(role: Role, target = app) {
  const agent = request.agent(target);
  const anonymous = await agent.get("/api/auth/session").expect(200);
  rememberCookie(anonymous);
  const response = await agent.post("/api/auth/login").set("x-csrf-token", anonymous.body.csrfToken)
    .send({ email: testEmail(role), password: testPassword }).expect(200);
  const cookie = rememberCookie(response)!;
  return { agent, csrf: response.body.csrfToken as string, cookie, response, anonymous };
}

beforeAll(async () => {
  client = await connectTestDatabase();
  await migrateDatabase(testDatabaseUrl()); await seedDatabase(testDatabaseUrl()); await seedTestAccounts(client);
  pool = new Pool({ connectionString: testDatabaseUrl() });
  const stores = await client.query<{ id: number; code: string }>("SELECT id, code FROM stores");
  lagos = stores.rows.find((row) => row.code === "LAGOS")!.id;
  ibadan = stores.rows.find((row) => row.code === "IBADAN")!.id;
  const product = await client.query<{ id: number; category_id: number }>("SELECT id, category_id FROM products WHERE sku = 'RICE-001'");
  productId = product.rows[0]!.id; categoryId = product.rows[0]!.category_id;
});
beforeEach(async () => { await client.query("BEGIN"); app = makeApp(); });
afterEach(async () => {
  await client?.query("ROLLBACK");
  if (sessionIds.size) await pool.query("DELETE FROM web_sessions WHERE sid = ANY($1::text[])", [[...sessionIds]]);
  sessionIds.clear();
  for (const store of stores) store.close();
  stores.length = 0;
});
afterAll(async () => { await pool?.end(); await client?.end(); });

it("requires login for catalog and location reads and writes", async () => {
  for (const path of ["/api/products", `/api/products/${productId}`, "/api/categories", "/api/stores", `/api/stores/${lagos}`]) {
    const response = await request(app).get(path).expect(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  }
  await request(app).post("/api/products").send({}).expect(401);
});

it("rotates the session on login and stores identity in PostgreSQL without leaking password hashes", async () => {
  const { agent, response, anonymous, cookie } = await login("ADMIN");
  expect(response.body.user).toMatchObject({ email: testEmail("ADMIN"), role: "ADMIN", storeId: null });
  expect(response.body.user).not.toHaveProperty("password_hash");
  expect(response.body.user).not.toHaveProperty("password");
  expect(response.body.csrfToken).not.toBe(anonymous.body.csrfToken);
  expect(cookie).not.toBe(anonymous.headers["set-cookie"]?.[0]?.split(";")[0]);
  expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  expect(response.headers["set-cookie"]?.[0]).toContain("SameSite=Lax");
  const sessions = await pool.query("SELECT sess FROM web_sessions WHERE (sess->>'userId')::integer = $1", [response.body.user.id]);
  expect(sessions.rows.some((row) => row.sess.csrfToken === response.body.csrfToken)).toBe(true);
  await agent.get("/api/products").expect(200);
  // A newly created application instance restores the session from the same store.
  const restored = await request(makeApp()).get("/api/auth/session").set("Cookie", cookie).expect(200);
  expect(restored.body.user.id).toBe(response.body.user.id);
});

it.each(["VIEWER", "MANAGER", "STAFF"] as const)("rejects all catalog writes by %s, including guessed record IDs", async (role) => {
  const { agent, csrf } = await login(role);
  await agent.get("/api/products").expect(200);
  const input = { sku: "FORBIDDEN", name: "Forbidden", barcode: null, unit: "each", categoryId, costPrice: "1.00", sellPrice: "2.00" };
  for (const [method, path, body] of [
    ["post", "/api/products", input], ["put", `/api/products/${productId}`, input],
    ["patch", `/api/products/${productId}/status`, { isActive: false }],
    ["post", "/api/categories", { name: "Forbidden" }], ["put", `/api/categories/${categoryId}`, { name: "Forbidden" }]
  ] as const) {
    const response = await agent[method](path).set("x-csrf-token", csrf).send(body).expect(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  }
  const count = await client.query("SELECT count(*)::integer AS count FROM products WHERE sku = 'FORBIDDEN'");
  expect(count.rows[0].count).toBe(0);
});

it.each(["MANAGER", "STAFF"] as const)("scopes %s to the assigned store and rejects a cross-store record", async (role) => {
  const { agent } = await login(role);
  const list = await agent.get("/api/stores").expect(200);
  expect(list.body.items.map((row: { id: number }) => row.id)).toEqual([lagos]);
  await agent.get(`/api/stores/${lagos}`).expect(200);
  await agent.get(`/api/stores/${ibadan}`).expect(403);
  await agent.get("/api/stores/2147483647").expect(404);
});

it.each(["ADMIN", "VIEWER"] as const)("permits %s to read every location", async (role) => {
  const { agent } = await login(role);
  const list = await agent.get("/api/stores").expect(200);
  expect(list.body.items).toHaveLength(3);
  await agent.get(`/api/stores/${ibadan}`).expect(200);
  const page = await agent.get("/api/stores?pageSize=1").expect(200);
  expect(page.body.items).toHaveLength(1);
  await agent.get("/api/stores?pageSize=101").expect(400);
});

it("requires a session-bound CSRF token for login and every catalog write", async () => {
  await request(app).post("/api/auth/login").send({ email: testEmail("ADMIN"), password: testPassword }).expect(403);
  const { agent, csrf, anonymous } = await login("ADMIN");
  for (const token of [undefined, "invalid", "é".repeat(64), anonymous.body.csrfToken]) {
    const write = agent.post("/api/categories").send({ name: "No CSRF" });
    if (token) write.set("x-csrf-token", token);
    const response = await write.expect(403);
    expect(response.body.error.code).toBe("CSRF_INVALID");
  }
  await agent.post("/api/categories").set("x-csrf-token", csrf).send({ name: "Valid CSRF" }).expect(201);
  await agent.post("/api/auth/logout").expect(403);
});

it("destroys the stored session on logout; the old cookie cannot authenticate", async () => {
  const { agent, csrf, cookie } = await login("ADMIN");
  await agent.post("/api/auth/logout").set("x-csrf-token", csrf).expect(200, { ok: true });
  await request(app).get("/api/products").set("Cookie", cookie).expect(401);
});

it("rechecks active status, role, and store assignment on each request", async () => {
  const { agent, csrf } = await login("ADMIN");
  await client.query("UPDATE users SET role = 'MANAGER', store_id = $1 WHERE email = $2", [ibadan, testEmail("ADMIN")]);
  await agent.post("/api/categories").set("x-csrf-token", csrf).send({ name: "No longer admin" }).expect(403);
  await agent.get(`/api/stores/${lagos}`).expect(403);
  await agent.get(`/api/stores/${ibadan}`).expect(200);
  await client.query("UPDATE users SET is_active = false WHERE email = $1", [testEmail("ADMIN")]);
  await agent.get("/api/products").expect(401);
});

it("returns the same invalid-credentials response for bad passwords, unknown users, and inactive accounts", async () => {
  const agent = request.agent(app);
  const anonymous = await agent.get("/api/auth/session").expect(200); rememberCookie(anonymous);
  const csrf = anonymous.body.csrfToken;
  const wrong = await agent.post("/api/auth/login").set("x-csrf-token", csrf).send({ email: testEmail("ADMIN"), password: "incorrect" }).expect(401);
  const unknown = await agent.post("/api/auth/login").set("x-csrf-token", csrf).send({ email: "missing@uba.example", password: "incorrect" }).expect(401);
  await client.query("UPDATE users SET is_active = false WHERE email = $1", [testEmail("ADMIN")]);
  const inactive = await agent.post("/api/auth/login").set("x-csrf-token", csrf).send({ email: testEmail("ADMIN"), password: testPassword }).expect(401);
  expect(wrong.body).toEqual(unknown.body); expect(inactive.body).toEqual(wrong.body);
  await agent.post("/api/auth/login").set("x-csrf-token", csrf).send({ email: testEmail("ADMIN"), password: "é".repeat(37) }).expect(400);
});

it("throttles repeated failed login attempts", async () => {
  const agent = request.agent(makeApp(false, 2));
  const anonymous = await agent.get("/api/auth/session").expect(200); rememberCookie(anonymous);
  for (let attempt = 0; attempt < 2; attempt++) await agent.post("/api/auth/login").set("x-csrf-token", anonymous.body.csrfToken).send({ email: testEmail("ADMIN"), password: "wrong" }).expect(401);
  const blocked = await agent.post("/api/auth/login").set("x-csrf-token", anonymous.body.csrfToken).send({ email: testEmail("ADMIN"), password: testPassword }).expect(429);
  expect(blocked.body.error.code).toBe("RATE_LIMITED"); expect(blocked.headers["retry-after"]).toBeTruthy();
});

it("sets Secure cookies behind an explicitly trusted HTTPS proxy", async () => {
  const response = await request(makeApp(true, 10, true)).get("/api/auth/session").set("X-Forwarded-Proto", "https").expect(200);
  rememberCookie(response);
  expect(response.headers["set-cookie"]?.[0]).toContain("Secure");
});
