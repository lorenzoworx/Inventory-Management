import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, seedDatabase } from "../../db/catalog.js";

let client: Client;
let databaseUrl: string;
let categoryId: number;
const seedSql = await readFile(new URL("../../db/seed.sql", import.meta.url), "utf8");

beforeAll(async () => {
  databaseUrl = process.env.TEST_DATABASE_URL ?? "";
  if (!databaseUrl) throw new Error("Set TEST_DATABASE_URL to a separate test database.");
  const testUrl = new URL(databaseUrl);
  if (!decodeURIComponent(testUrl.pathname).endsWith("_test")) {
    throw new Error("Database tests require a database name ending in _test.");
  }
  if (process.env.DATABASE_URL) {
    const developmentUrl = new URL(process.env.DATABASE_URL);
    if (decodeURIComponent(testUrl.pathname) === decodeURIComponent(developmentUrl.pathname)) {
      throw new Error("Test and development databases must have different names.");
    }
  }

  client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const actualDatabase = await client.query<{ name: string }>("SELECT current_database() AS name");
  expect(actualDatabase.rows[0]?.name).toMatch(/_test$/);
  await migrateDatabase(databaseUrl);
  await seedDatabase(databaseUrl);
  const category = await client.query<{ id: number }>("SELECT id FROM categories WHERE name = $1", ["Pantry"]);
  categoryId = category.rows[0]!.id;
});

beforeEach(async () => { await client.query("BEGIN"); });
afterEach(async () => { await client?.query("ROLLBACK"); });
afterAll(async () => { await client?.end(); });

type Fixture = { sku: string; name: string | null; cost: string; category: number; barcode: string | null };

function insertProduct(overrides: Partial<Fixture> = {}) {
  const product: Fixture = {
    sku: `TEST-${randomUUID()}`, name: "Test product", cost: "10.00",
    category: categoryId, barcode: null, ...overrides
  };
  return client.query(
    "INSERT INTO products (sku, name, cost_price, sell_price, category_id, barcode) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [product.sku, product.name, product.cost, "12.50", product.category, product.barcode]
  );
}

describe("catalog database", () => {
  it("joins a product to its category and keeps money as decimal strings", async () => {
    const result = await client.query(
      "SELECT p.name, p.sell_price, c.name AS category FROM products p JOIN categories c ON c.id = p.category_id WHERE p.sku = $1",
      ["RICE-001"]
    );
    expect(result.rows).toEqual([{ name: "Rice 5 kg", sell_price: "18500.00", category: "Pantry" }]);
  });

  it("does not reapply an already recorded migration", async () => {
    expect(await migrateDatabase(databaseUrl)).toHaveLength(0);
  });

  it("can seed again without duplicating products or overwriting edits", async () => {
    const before = await client.query("SELECT id, sku FROM products ORDER BY id");
    await client.query("UPDATE products SET sell_price = $1 WHERE sku = $2", ["19999.00", "RICE-001"]);
    await client.query(seedSql);
    const after = await client.query("SELECT id, sku FROM products ORDER BY id");
    expect(after.rows).toEqual(before.rows);
    const rice = await client.query("SELECT sell_price FROM products WHERE sku = $1", ["RICE-001"]);
    expect(rice.rows[0].sell_price).toBe("19999.00");
  });

  it.each([
    ["duplicate SKU", { sku: "RICE-001" }, "23505"],
    ["blank name", { name: "   " }, "23514"],
    ["missing name", { name: null }, "23502"],
    ["negative price", { cost: "-1.00" }, "23514"],
    ["non-numeric price", { cost: "NaN" }, "23514"],
    ["unknown category", { category: 2147483647 }, "23503"]
  ] as const)("rejects %s", async (_label, overrides, code) => {
    await expect(insertProduct(overrides)).rejects.toMatchObject({ code });
  });

  it("permits missing barcodes but rejects duplicate supplied barcodes", async () => {
    await insertProduct();
    await insertProduct();
    await insertProduct({ barcode: "TEST-BARCODE" });
    await expect(insertProduct({ barcode: "TEST-BARCODE" })).rejects.toMatchObject({ code: "23505" });
  });

  it("prevents deleting a category that still has products", async () => {
    await expect(client.query("DELETE FROM categories WHERE id = $1", [categoryId]))
      .rejects.toMatchObject({ code: "23001" });
  });

  it("deactivates a product while preserving its ID and category link", async () => {
    const before = await client.query("SELECT id, category_id FROM products WHERE sku = $1", ["RICE-001"]);
    await client.query("UPDATE products SET is_active = false WHERE sku = $1", ["RICE-001"]);
    const after = await client.query("SELECT id, category_id, is_active FROM products WHERE sku = $1", ["RICE-001"]);
    expect(after.rows[0]).toEqual({ ...before.rows[0], is_active: false });
  });
});
