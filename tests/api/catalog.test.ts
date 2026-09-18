import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { productListSchema, productSchema, type ProductInput } from "@ims/contracts";
import { createApp } from "../../apps/api/src/app.js";
import { migrateDatabase, seedDatabase } from "../../db/catalog.js";
import { connectTestDatabase, testDatabaseUrl } from "../test-database.js";

let client: Client;
let app: ReturnType<typeof createApp>;
let categoryId: number;
function fixture(overrides: Partial<ProductInput> = {}): ProductInput {
  return { sku: `API-${randomUUID()}`, name: "API product", barcode: null, unit: "each", costPrice: "10.10", sellPrice: "12.50", categoryId, ...overrides };
}

beforeAll(async () => {
  client = await connectTestDatabase();
  await migrateDatabase(testDatabaseUrl());
  await seedDatabase(testDatabaseUrl());
  app = createApp({ db: client });
});
beforeEach(async () => {
  await client.query("BEGIN");
  const result = await client.query<{ id: number }>("INSERT INTO categories (name) VALUES ($1) RETURNING id", [`API-${randomUUID()}`]);
  categoryId = result.rows[0]!.id;
});
afterEach(async () => { await client?.query("ROLLBACK"); });
afterAll(async () => { await client?.end(); });

describe("catalog HTTP API with PostgreSQL", () => {
  it("creates, reads, edits, and deactivates without changing the product identity", async () => {
    const input = fixture({ name: "  Test rice  ", costPrice: "10" });
    const created = await request(app).post("/api/products").send(input).expect(201);
    const product = productSchema.parse(created.body);
    expect(product).toMatchObject({ name: "Test rice", costPrice: "10.00", sellPrice: "12.50", isActive: true, barcode: null });
    expect(created.headers.location).toBe(`/api/products/${product.id}`);
    const edited = await request(app).put(`/api/products/${product.id}`).send({ ...input, sellPrice: "15.25" }).expect(200);
    expect(edited.body).toMatchObject({ id: product.id, sellPrice: "15.25" });
    await request(app).patch(`/api/products/${product.id}/status`).send({ isActive: false }).expect(200);
    await request(app).patch(`/api/products/${product.id}/status`).send({ isActive: false }).expect(200);
    const read = await request(app).get(`/api/products/${product.id}`).expect(200);
    expect(read.body).toMatchObject({ id: product.id, isActive: false, categoryId });
    const active = await request(app).get("/api/products").query({ categoryId }).expect(200);
    expect(active.body.total).toBe(0);
    const inactive = await request(app).get("/api/products").query({ categoryId, status: "inactive" }).expect(200);
    expect(inactive.body.items).toHaveLength(1);
    const restored = await request(app).patch(`/api/products/${product.id}/status`).send({ isActive: true }).expect(200);
    expect(restored.body.isActive).toBe(true);
  });

  it.each([
    ["blank name", { name: "   " }], ["blank SKU", { sku: "" }], ["blank unit", { unit: "" }],
    ["negative price", { costPrice: "-1.00" }], ["fractional pennies", { sellPrice: "1.999" }],
    ["oversized price", { sellPrice: "10000000000.00" }], ["numeric price", { costPrice: 1 }],
    ["NaN", { sellPrice: "NaN" }], ["missing category", { categoryId: undefined }],
    ["fractional ID", { categoryId: 1.5 }], ["blank barcode", { barcode: " " }],
    ["extra quantity", { quantity: 50 }]
  ])("rejects %s without writing a product", async (_name, overrides) => {
    const response = await request(app).post("/api/products").send({ ...fixture(), ...overrides }).expect(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    const count = await client.query("SELECT count(*)::integer AS count FROM products WHERE category_id = $1", [categoryId]);
    expect(count.rows[0].count).toBe(0);
  });

  it.each(["sku", "barcode"] as const)("maps duplicate %s to a field-specific 409", async (field) => {
    const input = fixture({ barcode: `BAR-${randomUUID()}` });
    await request(app).post("/api/products").send(input).expect(201);
    const duplicate = fixture({ [field]: input[field] });
    const response = await request(app).post("/api/products").send(duplicate).expect(409);
    expect(response.body.error.code).toBe("CONFLICT");
    expect(response.body.error.fields[field]).toBeTruthy();
  });

  it("rejects a category that does not exist", async () => {
    const response = await request(app).post("/api/products").send(fixture({ categoryId: 2147483647 })).expect(400);
    expect(response.body.error.code).toBe("INVALID_CATEGORY");
  });

  it("paginates a stable category-filtered list and searches literal input", async () => {
    for (const name of ["Zulu", "Alpha", "Mid%_quote'"]) await request(app).post("/api/products").send(fixture({ name })).expect(201);
    const first = await request(app).get("/api/products").query({ categoryId, pageSize: 2 }).expect(200);
    const parsed = productListSchema.parse(first.body);
    expect(parsed.items.map((p) => p.name)).toEqual(["Alpha", "Mid%_quote'"]);
    expect(parsed.total).toBe(3);
    const second = await request(app).get("/api/products").query({ categoryId, pageSize: 2, page: 2 }).expect(200);
    expect(second.body.items.map((p: { name: string }) => p.name)).toEqual(["Zulu"]);
    const search = await request(app).get("/api/products").query({ categoryId, q: "%_quote'" }).expect(200);
    expect(search.body.total).toBe(1);
    const injection = await request(app).get("/api/products").query({ q: "' OR 1=1 --" }).expect(200);
    expect(injection.body.total).toBe(0);
    const emptyPage = await request(app).get("/api/products").query({ categoryId, page: 100 }).expect(200);
    expect(emptyPage.body).toMatchObject({ items: [], total: 3 });
  });

  it.each(["pageSize=101", "page=0", "page=1.5", "page=100001", "categoryId=-1", "status=deleted", "page=1&page=2"])("rejects invalid query %s", async (query) => {
    const response = await request(app).get(`/api/products?${query}`).expect(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns consistent 404 and 400 responses for record URLs and bodies", async () => {
    await request(app).get("/api/products/2147483647").expect(404);
    await request(app).put("/api/products/2147483647").send(fixture()).expect(404);
    await request(app).patch("/api/products/2147483647/status").send({ isActive: true }).expect(404);
    await request(app).get("/api/products/1.5").expect(400);
    await request(app).patch("/api/products/1/status").send({ isActive: "false" }).expect(400);
    const malformed = await request(app).post("/api/products").type("json").send('{"name":').expect(400);
    expect(malformed.body.error.code).toBe("INVALID_JSON");
    const oversized = await request(app).post("/api/products").send({ name: "x".repeat(17000) }).expect(413);
    expect(oversized.body.error.code).toBe("BODY_TOO_LARGE");
  });

  it("creates and renames a category; product reads pick up its new name", async () => {
    const created = await request(app).post("/api/categories").send({ name: `Category-${randomUUID()}` }).expect(201);
    const product = await request(app).post("/api/products").send(fixture({ categoryId: created.body.id })).expect(201);
    const name = `Renamed-${randomUUID()}`;
    await request(app).put(`/api/categories/${created.body.id}`).send({ name }).expect(200);
    const read = await request(app).get(`/api/products/${product.body.id}`).expect(200);
    expect(read.body.categoryName).toBe(name);
    const listed = await request(app).get("/api/categories?pageSize=1").expect(200);
    expect(listed.body.items).toHaveLength(1);
    await request(app).get("/api/categories?pageSize=101").expect(400);
    await request(app).post("/api/categories").send({ name: " " }).expect(400);
    await request(app).put("/api/categories/2147483647").send({ name: "Missing" }).expect(404);
    const duplicate = await request(app).post("/api/categories").send({ name }).expect(409);
    expect(duplicate.body.error.fields.name).toBeTruthy();
  });
});
