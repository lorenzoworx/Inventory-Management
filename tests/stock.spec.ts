import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { connectTestDatabase } from "./test-database.js";
import { signIn } from "./browser-auth.js";

let productId: number;
let storeId: number;
let sku: string;
test.beforeEach(async () => {
  const client = await connectTestDatabase();
  try {
    sku = `BROWSER-STOCK-${randomUUID()}`;
    const product = await client.query<{ id: number }>("INSERT INTO products (sku, name, cost_price, sell_price, category_id) SELECT $1, 'Browser stock item', 10, 12, id FROM categories WHERE name = 'Pantry' RETURNING id", [sku]);
    productId = product.rows[0]!.id;
    const store = await client.query<{ id: number }>("SELECT id FROM stores WHERE code = 'LAGOS'"); storeId = store.rows[0]!.id;
  } finally { await client.end(); }
});
test.afterEach(async () => {
  const client = await connectTestDatabase();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM stock_movements WHERE product_id = $1", [productId]);
    await client.query("DELETE FROM stock_requests WHERE payload->>'productId' = $1", [String(productId)]);
    await client.query("DELETE FROM stock_balances WHERE product_id = $1", [productId]);
    await client.query("DELETE FROM products WHERE id = $1", [productId]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { await client.end(); }
});

async function enter(page: Page, kind: string, quantity: string, reason = "") {
  await page.getByRole("button", { name: "Record change for Browser stock item", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Change type").selectOption(kind);
  await dialog.getByLabel("Quantity", { exact: true }).fill(quantity);
  if (reason) await dialog.getByLabel("Reason", { exact: true }).fill(reason);
  await dialog.getByRole("button", { name: "Save entry", exact: true }).click();
}

test("records opening stock, a sale, an adjustment, and a reorder point with matching history", async ({ page }) => {
  await signIn(page);
  await page.goto(`/stock?storeId=${storeId}&q=${sku}`);
  await enter(page, "OPENING", "10");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await enter(page, "SALE", "3");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await enter(page, "ADJUSTMENT", "-2", "Damaged during handling");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let row = page.getByRole("row").filter({ hasText: sku });
  await expect(row.getByRole("cell").first()).toHaveText("5");
  await page.getByRole("button", { name: "Set reorder point for Browser stock item", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Reorder point", { exact: true }).fill("6");
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  row = page.getByRole("row").filter({ hasText: sku });
  await expect(row).toContainText("Low stock");
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page.getByLabel("Search history").fill(sku);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("row")).toHaveCount(4);
  await expect(page.getByRole("row").filter({ hasText: "Adjustment" })).toContainText("Damaged during handling");
  await expect(page.getByRole("row").filter({ hasText: "Sale" })).toContainText("-3");
});

test("retries a lost response using the same request ID without posting stock twice", async ({ page }) => {
  await signIn(page);
  const requestIds: string[] = [];
  await page.route("**/api/stock/changes", async (route) => {
    requestIds.push(route.request().postDataJSON().requestId);
    if (requestIds.length === 1) { await route.fetch(); await route.abort("failed"); }
    else await route.continue();
  });
  await page.goto(`/stock?storeId=${storeId}&q=${sku}`);
  await enter(page, "OPENING", "10");
  await expect(page.getByRole("alert")).toContainText("Retry this entry");
  await page.getByRole("dialog").getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: sku }).getByRole("cell").first()).toHaveText("10");
  expect(requestIds).toHaveLength(2); expect(requestIds[0]).toBe(requestIds[1]);
  const client = await connectTestDatabase();
  try { expect((await client.query("SELECT count(*)::integer AS count FROM stock_movements WHERE product_id = $1", [productId])).rows[0].count).toBe(1); }
  finally { await client.end(); }
});

test("rejects overselling in the UI while retaining the entry and the current balance", async ({ page }) => {
  await signIn(page);
  await page.goto(`/stock?storeId=${storeId}&q=${sku}`);
  await enter(page, "OPENING", "4");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await enter(page, "SALE", "5");
  await expect(page.getByRole("alert")).toContainText("make stock negative");
  await expect(page.getByRole("dialog").getByLabel("Quantity", { exact: true })).toHaveValue("5");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: sku }).getByRole("cell").first()).toHaveText("4");
});

test("stock is read-only for viewers and remains usable on a phone", async ({ page }) => {
  await signIn(page, "VIEWER");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/stock?storeId=${storeId}&q=${sku}`);
  await expect(page.getByRole("row").filter({ hasText: sku })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Record change/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
