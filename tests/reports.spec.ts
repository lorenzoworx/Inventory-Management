import { test, expect } from "@playwright/test";
import { connectTestDatabase } from "./test-database.js";
import { signIn } from "./browser-auth.js";
import { createReportFixture, removeReportFixture, type ReportFixture } from "./report-fixtures.js";

let fixture: ReportFixture;
test.beforeEach(async () => {
  const db = await connectTestDatabase();
  try { await db.query("BEGIN"); fixture = await createReportFixture(db); await db.query("COMMIT"); }
  catch (error) { await db.query("ROLLBACK"); throw error; } finally { await db.end(); }
});
test.afterEach(async () => {
  const db = await connectTestDatabase();
  try { await db.query("BEGIN"); await removeReportFixture(db, fixture); await db.query("COMMIT"); }
  catch (error) { await db.query("ROLLBACK"); throw error; } finally { await db.end(); }
});

test("shows exact valuation totals through pagination, filtering and a production refresh", async ({ page }) => {
  await signIn(page, "VIEWER");
  await page.goto(`/reports/valuation?q=${fixture.tag}&pageSize=1`);
  const total = page.locator(".report-metric").filter({ hasText: "On-hand value" });
  await expect(total).toContainText("₦2,082.28");
  await expect(page.getByRole("region", { name: "Stock valuation", exact: true }).getByRole("row")).toHaveCount(2);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/page=2/); await expect(total).toContainText("₦2,082.28");
  await page.reload(); await expect(total).toContainText("₦2,082.28");
  await page.getByLabel("Location", { exact: true }).selectOption(String(fixture.lagos)); await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(total).toContainText("₦2,081.78");
  await expect(page.getByRole("row").filter({ hasText: fixture.products[2]!.sku })).toContainText("Inactive");
  await page.goBack(); await expect(total).toContainText("₦2,082.28");
  const db = await connectTestDatabase();
  try { await db.query("UPDATE products SET cost_price = 0.20 WHERE id = $1", [fixture.products[0]!.id]); } finally { await db.end(); }
  await page.getByRole("button", { name: "Refresh report", exact: true }).click();
  await expect(total).toContainText("₦2,083.58");
});

test("shows low-stock records and links to the matching location's stock", async ({ page }) => {
  await signIn(page); await page.goto(`/reports/low-stock?q=${fixture.tag}&storeId=${fixture.lagos}`);
  await expect(page.locator(".report-metric").filter({ hasText: "Needs attention" }).locator("strong")).toHaveText("3");
  await expect(page.locator(".report-metric").filter({ hasText: "Out of stock" }).locator("strong")).toHaveText("1");
  const row = page.getByRole("row").filter({ hasText: fixture.products[0]!.sku });
  await expect(row).toContainText("Low stock"); await row.getByRole("link", { name: /^View stock/ }).click();
  await expect(page).toHaveURL(new RegExp(`stock\\?storeId=${fixture.lagos}&q=`));
  await expect(page.getByRole("row").filter({ hasText: fixture.products[0]!.sku }).getByRole("cell").first()).toHaveText("8");
});

test("renders all 14 Lagos days and exact movement totals on a phone", async ({ page }) => {
  await signIn(page, "VIEWER"); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/reports/movements?q=${fixture.tag}&endDate=2026-09-20`);
  await expect(page.locator(".report-metric").filter({ has: page.getByText("Units in", { exact: true }) }).locator("strong")).toHaveText("22");
  await expect(page.locator(".report-metric").filter({ has: page.getByText("Units out", { exact: true }) }).locator("strong")).toHaveText("4");
  await expect(page.locator(".report-metric").filter({ hasText: "Net change" }).locator("strong")).toHaveText("+18");
  const table = page.getByRole("region", { name: "Daily movement totals", exact: true });
  await expect(table.getByRole("row")).toHaveCount(15);
  await expect(page.getByText("Dates with no activity are shown as zero.", { exact: false })).toBeVisible();
  await page.getByLabel("Through date", { exact: true }).fill("2024-03-01"); await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page.locator(".report-metric").filter({ hasText: "Net change" }).locator("strong")).toHaveText("0");
  await expect(table.getByRole("rowheader", { name: "29 Feb", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await table.focus(); await expect(table).toBeFocused();
});

test("limits a manager to their store and explains an unauthorized deep link", async ({ page }) => {
  await signIn(page, "MANAGER"); await page.goto(`/reports/valuation?q=${fixture.tag}`);
  await expect(page.locator(".report-metric").filter({ hasText: "On-hand value" })).toContainText("₦2,081.78");
  await expect(page.getByLabel("Location", { exact: true }).getByRole("option", { name: "Ibadan Market" })).toHaveCount(0);
  await page.goto(`/reports/valuation?q=${fixture.tag}&storeId=${fixture.ibadan}`);
  await expect(page.getByRole("alert")).toContainText("cannot perform this action");
});

test("recovers from a failed report request and explains empty results", async ({ page }) => {
  await signIn(page); let fail = true;
  await page.route("**/api/reports/valuation?**", async (route) => {
    if (fail) { fail = false; await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "Report temporarily unavailable." } }) }); }
    else await route.continue();
  });
  await page.goto(`/reports/valuation?q=${fixture.tag}`);
  await expect(page.getByRole("alert")).toContainText("Report temporarily unavailable");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".report-metric").filter({ hasText: "On-hand value" })).toContainText("₦2,082.28");
  await page.getByLabel("Search report products", { exact: true }).fill("no-report-product-matches"); await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No valued stock on this page", exact: true })).toBeVisible();
  await expect(page.locator(".report-metric").filter({ hasText: "On-hand value" })).toContainText("₦0.00");
});
