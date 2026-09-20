import { readFile } from "node:fs/promises";
import type { Client } from "pg";
import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from "vitest";
import { migrateDatabase } from "../../db/catalog.js";
import { seedDemo } from "../../db/demo.js";
import { connectTestDatabase, testDatabaseUrl, testTransaction } from "../test-database.js";

let db: Client;
beforeAll(async () => { await migrateDatabase(testDatabaseUrl()); db = await connectTestDatabase(); });
beforeEach(async () => {
  await db.query("BEGIN");
  // The _test guard and rollback isolate these fresh-install fixtures from every other suite.
  await db.query("TRUNCATE categories, products, stores, users, suppliers RESTART IDENTITY CASCADE");
  await db.query(await readFile(new URL("../../db/seed.sql", import.meta.url), "utf8"));
  await db.query("INSERT INTO users (email, name, password_hash, role) VALUES ('admin@uba.example', 'Demo Administrator', 'unused-seed-fixture', 'ADMIN')");
});
afterEach(async () => { await db.query("ROLLBACK"); });
afterAll(async () => { await db.end(); });

it("seeds a complete fictional ledger once, with consistent balances and workflow states", async () => {
  expect(await seedDemo(testTransaction(db))).toBe(true);
  expect((await db.query(await readFile(new URL("../../db/verify-ledger.sql", import.meta.url), "utf8"))).rows).toEqual([]);
  expect((await db.query("SELECT status FROM transfers ORDER BY status")).rows.map((row) => row.status)).toEqual(["IN_TRANSIT", "PENDING", "RECEIVED"]);
  expect((await db.query("SELECT status FROM purchase_orders ORDER BY status")).rows.map((row) => row.status)).toEqual(["PARTIALLY_RECEIVED", "RECEIVED"]);
  const history = await db.query(`SELECT id FROM (SELECT id, balance_after, sum(quantity) OVER (PARTITION BY product_id, store_id ORDER BY created_at, id) AS expected FROM stock_movements) h WHERE balance_after <> expected`);
  expect(history.rows).toEqual([]);
  const count = (await db.query("SELECT count(*) FROM stock_movements")).rows;
  expect(await seedDemo(testTransaction(db))).toBe(false);
  expect((await db.query("SELECT count(*) FROM stock_movements")).rows).toEqual(count);
});

it("refuses to add fixtures over an existing inventory", async () => {
  await db.query("INSERT INTO stock_balances (product_id, store_id) SELECT p.id, s.id FROM products p CROSS JOIN stores s LIMIT 1");
  await expect(seedDemo(testTransaction(db))).rejects.toThrow("empty ledger");
  expect((await db.query("SELECT count(*)::int AS count FROM stock_balances")).rows[0].count).toBe(1);
});

it("rolls the entire seed back when a later purchase movement fails", async () => {
  await db.query(`CREATE FUNCTION pg_temp.fail_demo_purchase() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind = 'PURCHASE' THEN RAISE EXCEPTION 'seed failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_demo_purchase BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_demo_purchase()`);
  await expect(seedDemo(testTransaction(db))).rejects.toThrow("seed failure");
  for (const table of ["stock_balances", "stock_movements", "stock_requests", "purchase_orders", "transfers"]) expect((await db.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count).toBe(0);
});
