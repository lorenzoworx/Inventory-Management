import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import session from "express-session";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { lowStockReportSchema, movementReportSchema, valuationReportSchema, type Role } from "@ims/contracts";
import { createApp } from "../../apps/api/src/app.js";
import { transactions } from "../../apps/api/src/database.js";
import { reportRepository } from "../../apps/api/src/report-repository.js";
import { stockService } from "../../apps/api/src/stock-service.js";
import { transferService } from "../../apps/api/src/transfer-service.js";
import { purchaseService } from "../../apps/api/src/purchase-service.js";
import { migrateDatabase, seedDatabase } from "../../db/catalog.js";
import { connectTestDatabase, testDatabaseUrl } from "../test-database.js";
import { seedTestAccounts, testEmail, testPassword, testSessionSecret } from "../auth-fixtures.js";
import { createReportFixture, removeReportFixture, type ReportFixture } from "../report-fixtures.js";

let pool: Pool; let app: ReturnType<typeof createApp>; let agent: ReturnType<typeof request.agent>; let fixture: ReportFixture;
async function signIn(role: Role) {
  const account = request.agent(app); const anonymous = await account.get("/api/auth/session").expect(200);
  await account.post("/api/auth/login").set("x-csrf-token", anonymous.body.csrfToken).send({ email: testEmail(role), password: testPassword }).expect(200);
  return account;
}
function get(name: string, query: Record<string, string | number> = {}) { return agent.get(`/api/reports/${name}`).query({ q: fixture.tag, ...query }); }
beforeAll(async () => {
  const guard = await connectTestDatabase(); try { await migrateDatabase(testDatabaseUrl()); await seedDatabase(testDatabaseUrl()); await seedTestAccounts(guard); } finally { await guard.end(); }
  pool = new Pool({ connectionString: testDatabaseUrl() });
  app = createApp({ db: pool, transaction: transactions(pool), auth: { store: new session.MemoryStore(), secret: testSessionSecret, secureCookies: false } });
});
beforeEach(async () => { fixture = await transactions(pool)((db) => createReportFixture(db)); agent = await signIn("ADMIN"); });
afterEach(async () => { await transactions(pool)((db) => removeReportFixture(db, fixture)); });
afterAll(async () => { await pool.end(); });

it("values all matching on-hand rows with exact decimals, including inactive stock", async () => {
  const report = valuationReportSchema.parse((await get("valuation").expect(200)).body);
  // A: (8 + 5) × .10 = 1.30; B: 4 × 20.25 = 81; inactive: 2 × 999.99 = 1999.98.
  expect(report).toMatchObject({ total: 4, totalQuantity: "19", totalValue: "2082.28" });
  expect(report.items.find((row) => row.productId === fixture.products[2]!.id)).toMatchObject({ isActive: false, quantity: 2, value: "1999.98" });
  const local = valuationReportSchema.parse((await get("valuation", { storeId: fixture.lagos }).expect(200)).body);
  expect(local).toMatchObject({ total: 3, totalQuantity: "14", totalValue: "2081.78" });
});

it("keeps totals across pages, including an empty page, and searches literal product text", async () => {
  const first = valuationReportSchema.parse((await get("valuation", { pageSize: 1 }).expect(200)).body);
  const second = valuationReportSchema.parse((await get("valuation", { pageSize: 1, page: 2 }).expect(200)).body);
  expect(first.items).toHaveLength(1); expect(second.items).toHaveLength(1); expect(first.items[0]).not.toEqual(second.items[0]);
  expect(first.totalValue).toBe(second.totalValue); expect(first.total).toBe(4);
  const empty = valuationReportSchema.parse((await get("valuation", { pageSize: 1, page: 10 }).expect(200)).body);
  expect(empty.items).toEqual([]); expect(empty.totalValue).toBe("2082.28");
  expect((await get("valuation", { q: "%' OR 1=1 --" }).expect(200)).body.total).toBe(0);
});

it("preserves a valuation larger than JavaScript's exact integer range", async () => {
  await pool.query("UPDATE products SET cost_price = 9999999999.99 WHERE id = $1", [fixture.products[0]!.id]);
  await stockService(transactions(pool)).change(fixture.admin, { requestId: randomUUID(), productId: fixture.products[0]!.id, storeId: fixture.lagos, kind: "ADJUSTMENT", quantity: 999992, note: "Large report fixture" });
  const report = valuationReportSchema.parse((await get("valuation", { storeId: fixture.lagos, q: fixture.products[0]!.sku }).expect(200)).body);
  expect(report.totalValue).toBe("9999999999990000.00"); expect(report.items[0]!.value).toBe(report.totalValue);
});

it("finds threshold equality and never-stocked products, but excludes inactive products", async () => {
  const report = lowStockReportSchema.parse((await get("low-stock").expect(200)).body);
  expect(report.total).toBe(8); expect(report.outOfStock).toBe(6);
  expect(report.items).toContainEqual(expect.objectContaining({ productId: fixture.products[0]!.id, storeId: fixture.lagos, quantity: 8, reorderPoint: 8 }));
  expect(report.items.filter((row) => row.productId === fixture.products[3]!.id)).toHaveLength(3);
  expect(report.items.some((row) => row.productId === fixture.products[2]!.id)).toBe(false);
  const paged = lowStockReportSchema.parse((await get("low-stock", { pageSize: 2 }).expect(200)).body);
  expect(paged.items).toHaveLength(2); expect(paged.total).toBe(8); expect(paged.outOfStock).toBe(6);
});

it("uses inclusive Lagos start and exclusive next-day boundaries with 14 zero-filled dates", async () => {
  const report = movementReportSchema.parse((await get("movements", { endDate: "2026-09-20" }).expect(200)).body);
  expect(report.startDate).toBe("2026-09-07"); expect(report.endDate).toBe("2026-09-20"); expect(report.days).toHaveLength(14);
  expect(report.days[0]).toMatchObject({ date: "2026-09-07", opening: "14", sales: "1", net: "13" });
  expect(report.days[13]).toMatchObject({ date: "2026-09-20", sales: "3", adjustmentOut: "0", net: "-3" });
  expect(report.days.find((day) => day.date === "2026-09-15")).toMatchObject({ incoming: "0", outgoing: "0", net: "0", movementCount: "0" });
  expect(report.totals).toEqual({ opening: "21", sales: "4", purchases: "0", adjustmentIn: "1", adjustmentOut: "0", transferIn: "0", transferOut: "0", incoming: "22", outgoing: "4", net: "18", movementCount: "7" });
});

it("produces the same reporting dates regardless of the PostgreSQL connection time zone", async () => {
  const db = await pool.connect();
  try {
    await db.query("BEGIN"); await db.query("SET LOCAL TIME ZONE 'Pacific/Kiritimati'");
    const east = await reportRepository(db).movements({ q: fixture.tag, endDate: "2026-09-20", page: 1, pageSize: 20 }, null);
    await db.query("SET LOCAL TIME ZONE 'America/Los_Angeles'");
    const west = await reportRepository(db).movements({ q: fixture.tag, endDate: "2026-09-20", page: 1, pageSize: 20 }, null);
    expect(east.days).toEqual(west.days); expect(east.totals).toEqual(west.totals);
    await db.query("ROLLBACK");
  } finally { db.release(); }
});

it("handles leap-day windows and empty reports with explicit zeros", async () => {
  const report = movementReportSchema.parse((await get("movements", { endDate: "2024-03-01" }).expect(200)).body);
  expect(report.startDate).toBe("2024-02-17"); expect(report.days[12]!.date).toBe("2024-02-29"); expect(report.totals.net).toBe("0");
  const valuation = valuationReportSchema.parse((await get("valuation", { q: "nonexistent-report-product" }).expect(200)).body);
  expect(valuation).toMatchObject({ items: [], total: 0, totalQuantity: "0", totalValue: "0.00" });
});

it("keeps store permissions in every report, including default scope", async () => {
  for (const name of ["valuation", "low-stock", "movements"]) {
    await request(app).get(`/api/reports/${name}`).expect(401);
    for (const role of ["MANAGER", "STAFF", "VIEWER"] as const) {
      const account = await signIn(role);
      const query = { q: fixture.tag, endDate: "2026-09-20" };
      const result = await account.get(`/api/reports/${name}`).query(query).expect(200);
      if (name === "valuation") expect(result.body.totalValue).toBe(role === "VIEWER" ? "2082.28" : "2081.78");
      if (name === "movements") expect(result.body.totals.opening).toBe(role === "VIEWER" ? "21" : "16");
      if (name === "low-stock" && role !== "VIEWER") expect(result.body.items.every((row: { storeId: number }) => row.storeId === fixture.lagos)).toBe(true);
      await account.get(`/api/reports/${name}`).query({ ...query, storeId: fixture.ibadan }).expect(role === "VIEWER" ? 200 : 403);
    }
  }
});

it.each(["2026-02-30", "2026-13-01", "not-a-date", "0000-01-01", "2200-01-01"])("rejects invalid reporting date %s", async (endDate) => { await get("movements", { endDate }).expect(400); });
it("bounds pagination and rejects missing locations", async () => {
  await get("valuation", { pageSize: 101 }).expect(400); await get("low-stock", { page: 0 }).expect(400); await get("valuation", { storeId: 2147483647 }).expect(404);
});

it("agrees with purchase and transfer ledger entries while excluding in-transit stock from valuation", async () => {
  const transfers = transferService(transactions(pool)); const purchases = purchaseService(transactions(pool));
  const transfer = await transfers.create(fixture.admin, { sourceId: fixture.lagos, destinationId: fixture.ibadan, notes: "Report transfer", lines: [{ productId: fixture.products[0]!.id, quantity: 2 }] });
  const dispatch = await transfers.move(fixture.admin, transfer.id, "DISPATCH", randomUUID());
  await pool.query("UPDATE stock_movements SET created_at = '2026-09-12T11:00:00Z' WHERE id = $1", [dispatch.movements[0]!.movementId]);
  expect((await get("valuation").expect(200)).body.totalValue).toBe("2082.08");
  const received = await transfers.move(fixture.admin, transfer.id, "RECEIVE", randomUUID());
  await pool.query("UPDATE stock_movements SET created_at = '2026-09-13T11:00:00Z' WHERE id = $1", [received.movements[0]!.movementId]);
  expect((await get("valuation").expect(200)).body.totalValue).toBe("2082.28");
  const supplier = (await pool.query<{ id: number }>("SELECT id FROM suppliers WHERE name = 'Sunrise Pantry Supply'")).rows[0]!.id;
  const order = await purchases.create(fixture.admin, { supplierId: supplier, storeId: fixture.lagos, notes: "Report purchase", lines: [{ productId: fixture.products[1]!.id, orderedQty: 2, unitCost: "1.00" }] });
  await purchases.transition(fixture.admin, order.id, "ORDER");
  const receipt = await purchases.receive(fixture.admin, order.id, { requestId: randomUUID(), lines: [{ lineId: order.lines[0]!.id, quantity: 2 }] });
  await pool.query("UPDATE stock_movements SET created_at = '2026-09-11T11:00:00Z' WHERE id = $1", [receipt.movements[0]!.movementId]);
  expect((await get("valuation").expect(200)).body.totalValue).toBe("2122.78");
  const report = movementReportSchema.parse((await get("movements", { endDate: "2026-09-20" }).expect(200)).body);
  expect(report.totals).toMatchObject({ purchases: "2", transferOut: "2", transferIn: "2", incoming: "26", outgoing: "6", net: "20" });
});

it("defaults the ending date to today in Lagos", async () => {
  const date = (await pool.query<{ date: string }>("SELECT (statement_timestamp() AT TIME ZONE 'Africa/Lagos')::date::text AS date")).rows[0]!.date;
  const report = movementReportSchema.parse((await get("movements").expect(200)).body);
  expect(report.endDate).toBe(date);
});
