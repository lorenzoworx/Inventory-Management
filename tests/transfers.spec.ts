import { test, expect, type Page } from "@playwright/test";
import { connectTestDatabase } from "./test-database.js";
import { signIn } from "./browser-auth.js";
import { createTransferFixture, removeTransferFixture, type TransferFixture } from "./transfer-fixtures.js";

let fixture: TransferFixture;
test.beforeEach(async () => {
  const db = await connectTestDatabase();
  try { await db.query("BEGIN"); fixture = await createTransferFixture(db); await db.query("COMMIT"); }
  catch (error) { await db.query("ROLLBACK"); throw error; } finally { await db.end(); }
});
test.afterEach(async () => {
  const db = await connectTestDatabase();
  try { await db.query("BEGIN"); await removeTransferFixture(db, fixture); await db.query("COMMIT"); }
  catch (error) { await db.query("ROLLBACK"); throw error; } finally { await db.end(); }
});
async function create(page: Page, sourceId = fixture.lagos, destinationId = fixture.ibadan, quantity = "5") {
  await page.goto("/transfers"); await page.getByRole("link", { name: "New transfer", exact: true }).click();
  await page.getByLabel("Source location", { exact: true }).selectOption(String(sourceId));
  await page.getByLabel("Destination location", { exact: true }).selectOption(String(destinationId));
  for (const product of fixture.products) {
    await page.getByLabel("Find products", { exact: true }).fill(product.sku);
    await page.getByRole("button", { name: `Add ${product.name}`, exact: true }).click();
    await page.getByLabel(`Transfer quantity · ${product.name}`, { exact: true }).fill(quantity);
  }
  await page.getByRole("button", { name: "Create transfer", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^TR-\d+$/);
  return page.url();
}
async function switchRole(page: Page, role: "ADMIN" | "MANAGER" | "STAFF" | "VIEWER") {
  await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(/\/login$/); await signIn(page, role);
}
async function balance(storeId: number) {
  const db = await connectTestDatabase();
  try { return (await db.query("SELECT quantity FROM stock_balances WHERE store_id = $1 AND product_id = $2", [storeId, fixture.products[0]!.id])).rows[0].quantity as number; }
  finally { await db.end(); }
}

test("manager creates a transfer, source staff dispatch, and the destination receives", async ({ page }) => {
  await signIn(page, "MANAGER"); const url = await create(page);
  await expect(page.locator(".status-badge")).toHaveText("Pending"); expect(await balance(fixture.lagos)).toBe(20);
  await switchRole(page, "STAFF"); await page.goto(url);
  await expect(page.getByRole("button", { name: "Cancel transfer", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm dispatch", exact: true }).click();
  await expect(page.locator(".status-badge")).toHaveText("In transit");
  await expect(page.getByText(/10 units are in transit/)).toBeVisible();
  expect(await balance(fixture.lagos)).toBe(15); expect(await balance(fixture.ibadan)).toBe(20);
  await expect(page.getByRole("button", { name: "Confirm receipt", exact: true })).toHaveCount(0);
  await switchRole(page, "ADMIN"); await page.goto(url);
  await page.getByRole("button", { name: "Confirm receipt", exact: true }).click();
  await expect(page.locator(".status-badge")).toHaveText("Received");
  expect(await balance(fixture.ibadan)).toBe(25);
  await page.reload(); await expect(page.locator(".status-badge")).toHaveText("Received");
});

test("destination staff can receive inbound transfers but cannot dispatch them", async ({ page }) => {
  await signIn(page); const url = await create(page, fixture.ibadan, fixture.lagos);
  await switchRole(page, "STAFF"); await page.goto(url);
  await expect(page.locator(".status-badge")).toHaveText("Pending");
  await expect(page.getByRole("button", { name: "Confirm dispatch", exact: true })).toHaveCount(0);
  await switchRole(page, "ADMIN"); await page.goto(url); await page.getByRole("button", { name: "Confirm dispatch", exact: true }).click();
  await expect(page.locator(".status-badge")).toHaveText("In transit");
  await switchRole(page, "STAFF"); await page.goto(url); await page.getByRole("button", { name: "Confirm receipt", exact: true }).click();
  await expect(page.locator(".status-badge")).toHaveText("Received"); expect(await balance(fixture.lagos)).toBe(25);
});

test("retries lost dispatch and receipt responses without moving either side twice", async ({ page }) => {
  await signIn(page); await create(page);
  for (const [action, button, expectedStatus] of [["dispatch", "Confirm dispatch", "In transit"], ["receive", "Confirm receipt", "Received"]] as const) {
    const ids: string[] = [];
    await page.route(`**/api/transfers/*/${action}`, async (route) => { ids.push(route.request().postDataJSON().requestId); if (ids.length === 1) { await route.fetch(); await route.abort("failed"); } else await route.continue(); });
    await page.getByRole("button", { name: button, exact: true }).click(); await expect(page.getByRole("alert")).toContainText("Retry this action");
    await page.getByRole("button", { name: button, exact: true }).click(); await expect(page.locator(".status-badge")).toHaveText(expectedStatus);
    expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
  }
  expect(await balance(fixture.lagos)).toBe(15); expect(await balance(fixture.ibadan)).toBe(25);
});

test("cancels pending transfers and shows a read-only mobile view", async ({ page }) => {
  await signIn(page); const url = await create(page);
  await page.getByRole("button", { name: "Cancel transfer", exact: true }).click(); await page.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
  await expect(page.locator(".status-badge")).toHaveText("Cancelled"); expect(await balance(fixture.lagos)).toBe(20);
  await switchRole(page, "VIEWER"); await page.setViewportSize({ width: 390, height: 844 }); await page.goto(url);
  await expect(page.locator(".status-badge")).toHaveText("Cancelled");
  await expect(page.getByRole("button", { name: /Confirm dispatch|Confirm receipt|Cancel transfer/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("insufficient stock leaves a transfer pending with no partial dispatch", async ({ page }) => {
  await signIn(page); await create(page, fixture.lagos, fixture.ibadan, "21");
  await page.getByRole("button", { name: "Confirm dispatch", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("make stock negative"); await expect(page.locator(".status-badge")).toHaveText("Pending");
  expect(await balance(fixture.lagos)).toBe(20); expect(await balance(fixture.ibadan)).toBe(20);
});
