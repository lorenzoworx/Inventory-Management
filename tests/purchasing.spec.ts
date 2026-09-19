import { test, expect, type Page } from "@playwright/test";
import { connectTestDatabase } from "./test-database.js";
import { signIn } from "./browser-auth.js";
import { createPurchaseFixture, removePurchaseFixture, type PurchaseFixture } from "./purchase-fixtures.js";

let fixture: PurchaseFixture;
test.beforeEach(async () => { const db = await connectTestDatabase(); try { fixture = await createPurchaseFixture(db); } finally { await db.end(); } });
test.afterEach(async () => {
  const db = await connectTestDatabase();
  try { await db.query("BEGIN"); await removePurchaseFixture(db, fixture); await db.query("COMMIT"); }
  catch (error) { await db.query("ROLLBACK"); throw error; } finally { await db.end(); }
});
async function createDraft(page: Page) {
  await page.goto("/purchases");
  await page.getByRole("link", { name: "New purchase order", exact: true }).click();
  await page.getByLabel("Receiving location", { exact: true }).selectOption(String(fixture.lagos));
  await page.getByLabel("Find supplier", { exact: true }).fill(fixture.tag);
  await page.getByLabel("Supplier", { exact: true }).selectOption(String(fixture.supplier));
  for (const product of fixture.products) {
    await page.getByLabel("Find products", { exact: true }).fill(product.sku);
    await page.getByRole("button", { name: `Add ${product.name}`, exact: true }).click();
    await page.getByLabel(`Quantity · ${product.name}`, { exact: true }).fill("10");
  }
  await page.getByLabel("Find products", { exact: true }).fill("");
  const picker = page.getByRole("region", { name: "Add order products", exact: true });
  await picker.getByRole("button", { name: "Next", exact: true }).click();
  await expect(picker.getByText(/Page 2 of/)).toBeVisible();
  await expect(page).toHaveURL(/\/purchases\/new$/);
  await page.getByLabel("Notes (optional)").fill("Browser purchase journey");
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^PO-\d+$/);
  return page.url();
}

test("creates a purchase, records a partial delivery, and completes it as store staff", async ({ page }) => {
  await signIn(page, "MANAGER");
  const url = await createDraft(page);
  await expect(page.getByText("Order total ₦205.00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark as ordered", exact: true }).click();
  await page.getByLabel(`Receive ${fixture.products[0]!.name}`, { exact: false }).fill("4");
  await page.getByRole("button", { name: "Record receipt", exact: true }).click();
  await expect(page.getByText("Partially received", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel order", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, "STAFF"); await page.goto(url);
  await page.getByLabel(`Receive ${fixture.products[0]!.name}`, { exact: false }).fill("6");
  await page.getByLabel(`Receive ${fixture.products[1]!.name}`, { exact: false }).fill("10");
  await page.getByRole("button", { name: "Record receipt", exact: true }).click();
  await expect(page.locator(".status-badge")).toHaveText("Received");
  await expect(page.getByRole("button", { name: "Record receipt", exact: true })).toHaveCount(0);
  await page.reload(); await expect(page.locator(".status-badge")).toHaveText("Received");
  await page.goto(`/stock?storeId=${fixture.lagos}&q=${fixture.products[0]!.sku}`);
  await expect(page.getByRole("row").filter({ hasText: fixture.products[0]!.sku }).getByRole("cell").first()).toHaveText("10");
});

test("retains a receipt request ID after a lost response and avoids posting it twice", async ({ page }) => {
  await signIn(page); await createDraft(page);
  await page.getByRole("button", { name: "Mark as ordered", exact: true }).click();
  const ids: string[] = [];
  await page.route("**/api/purchase-orders/*/receive", async (route) => {
    ids.push(route.request().postDataJSON().requestId);
    if (ids.length === 1) { await route.fetch(); await route.abort("failed"); } else await route.continue();
  });
  for (const product of fixture.products) await page.getByLabel(`Receive ${product.name}`, { exact: false }).fill("10");
  await page.getByRole("button", { name: "Record receipt", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Retry these quantities");
  await page.getByRole("button", { name: "Record receipt", exact: true }).click();
  await expect(page.locator(".status-badge")).toHaveText("Received");
  expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
  const db = await connectTestDatabase();
  try { const rows = await db.query("SELECT quantity FROM stock_balances WHERE product_id = ANY($1::int[])", [fixture.products.map((product) => product.id)]); expect(rows.rows.map((row) => row.quantity)).toEqual([10, 10]); }
  finally { await db.end(); }
});

test("cancels a draft and exposes read-only purchase details to a viewer on mobile", async ({ page }) => {
  await signIn(page); const url = await createDraft(page);
  await page.getByRole("button", { name: "Cancel order", exact: true }).click();
  await page.getByRole("button", { name: "Keep order", exact: true }).click();
  await expect(page.locator(".status-badge")).toHaveText("Draft");
  await page.getByRole("button", { name: "Cancel order", exact: true }).click();
  await page.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
  await expect(page.locator(".status-badge")).toHaveText("Cancelled");
  await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(/\/login$/);
  await signIn(page, "VIEWER"); await page.setViewportSize({ width: 390, height: 844 }); await page.goto(url);
  await expect(page.locator(".status-badge")).toHaveText("Cancelled");
  await expect(page.getByRole("button", { name: /Record receipt|Mark as ordered|Cancel order/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole("link", { name: "Purchases", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Purchase orders", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "New purchase order", exact: true })).toHaveCount(0);
});

test("updates supplier contact details and deactivates the supplier", async ({ page }) => {
  await signIn(page); await page.getByRole("link", { name: "Suppliers", exact: true }).click();
  await page.getByLabel("Search suppliers", { exact: true }).fill(fixture.tag);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: `Edit Purchase fixture ${fixture.tag}`, exact: true }).click();
  await page.getByLabel("Email (optional)").fill("updated@fixture.example");
  await page.getByRole("button", { name: "Save supplier", exact: true }).click();
  await expect(page.getByText("updated@fixture.example", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Deactivate Purchase fixture ${fixture.tag}`, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "deactivated" })).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("inactive");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("button", { name: `Reactivate Purchase fixture ${fixture.tag}`, exact: true })).toBeVisible();
});

test("rejects over-receipt without losing the entered quantities", async ({ page }) => {
  await signIn(page); await createDraft(page);
  await page.getByRole("button", { name: "Mark as ordered", exact: true }).click();
  await page.getByLabel(`Receive ${fixture.products[0]!.name}`, { exact: false }).fill("11");
  await page.getByRole("button", { name: "Record receipt", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("only 10 units left");
  await expect(page.getByLabel(`Receive ${fixture.products[0]!.name}`, { exact: false })).toHaveValue("11");
  await expect(page.locator(".status-badge")).toHaveText("Ordered");
});
