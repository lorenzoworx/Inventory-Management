import type { Client } from "pg";
import session from "express-session";
import request from "supertest";
import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from "vitest";
import { createApp } from "../../apps/api/src/app.js";
import { migrateDatabase, seedDatabase } from "../../db/catalog.js";
import { connectTestDatabase, testDatabaseUrl, testTransaction } from "../test-database.js";
import { seedTestAccounts, testEmail, testPassword, testSessionSecret } from "../auth-fixtures.js";

let db: Client;
let store: session.MemoryStore;
function app(publicDemo = true, brokenDb = false) {
  return createApp({ db: brokenDb ? { query: async () => { throw new Error("private-connection-details"); } } : db, transaction: testTransaction(db),
    auth: { store, secret: testSessionSecret, secureCookies: false, publicDemo } });
}
beforeAll(async () => { db = await connectTestDatabase(); await migrateDatabase(testDatabaseUrl()); await seedDatabase(testDatabaseUrl()); await seedTestAccounts(db); });
beforeEach(async () => { await db.query("BEGIN"); store = new session.MemoryStore(); });
afterEach(async () => { await db.query("ROLLBACK"); store.clear(); });
afterAll(async () => { await db.end(); });

it("distinguishes process health from database readiness without exposing database errors", async () => {
  await request(app()).get("/api/ready").expect(200, { status: "ready" });
  await request(app(true, true)).get("/api/health").expect(200);
  const response = await request(app(true, true)).get("/api/ready").expect(503);
  expect(response.body.error.code).toBe("NOT_READY"); expect(JSON.stringify(response.body)).not.toContain("private-connection");
});

it("advertises the public demo only when configured and supplies browser security headers", async () => {
  const response = await request(app()).get("/api/demo").expect(200, { enabled: true });
  await request(app(false)).get("/api/demo").expect(200, { enabled: false });
  expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response.headers["x-content-type-options"]).toBe("nosniff");
  expect(response.headers["cache-control"]).toBe("no-store");
});

it("allows viewers to sign in and out while refusing operational logins", async () => {
  const agent = request.agent(app());
  let csrf = (await agent.get("/api/auth/session")).body.csrfToken;
  for (const role of ["ADMIN", "MANAGER", "STAFF"] as const) await agent.post("/api/auth/login").set("x-csrf-token", csrf).send({ email: testEmail(role), password: testPassword }).expect(403);
  const login = await agent.post("/api/auth/login").set("x-csrf-token", csrf).send({ email: testEmail("VIEWER"), password: testPassword }).expect(200);
  csrf = login.body.csrfToken;
  await agent.get("/api/products").expect(200);
  await agent.post("/api/categories").set("x-csrf-token", csrf).send({ name: "Forbidden" }).expect(403);
  await agent.post("/api/auth/logout").set("x-csrf-token", csrf).expect(200);
});

it("blocks a previously issued administrator session after public-demo mode is enabled", async () => {
  const agent = request.agent(app(false));
  const anonymous = await agent.get("/api/auth/session");
  const login = await agent.post("/api/auth/login").set("x-csrf-token", anonymous.body.csrfToken).send({ email: testEmail("ADMIN"), password: testPassword }).expect(200);
  const cookie = (login.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  const response = await request(app()).post("/api/categories").set("Cookie", cookie).set("x-csrf-token", login.body.csrfToken).send({ name: "Forbidden" }).expect(403);
  expect(response.body.error.code).toBe("DEMO_READ_ONLY");
});
