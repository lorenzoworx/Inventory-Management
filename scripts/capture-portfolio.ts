import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const baseURL = process.env.IMS_BASE_URL ?? "http://127.0.0.1:4200";
assert.equal((await (await fetch(`${baseURL}/api/demo`)).json()).enabled, true, "Screenshots require the fictional public-demo installation.");
await mkdir("docs/screenshots", { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage(); const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Explore read-only demo" })).toBeEnabled();
  await page.screenshot({ path: "docs/screenshots/demo-login.png", fullPage: true });
  await page.getByRole("button", { name: "Explore read-only demo" }).click();
  await page.waitForURL("**/products");
  await expect(page.getByRole("table")).toBeVisible();
  const stores = await (await context.request.get("/api/stores")).json();
  const lagos = stores.items.find((store: { code: string }) => store.code === "LAGOS").id;
  for (const [path, name] of [["/reports/valuation", "valuation"], [`/stock?storeId=${lagos}`, "stock"], ["/transfers", "transfers"]]) {
    await page.goto(path!); await expect(page.getByRole("table").first()).toBeVisible();
    await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reports/low-stock"); await expect(page.getByRole("table")).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Phone layout must not overflow the viewport");
  await page.screenshot({ path: "docs/screenshots/low-stock-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Saved portfolio screenshots. Real demo login, tables, and phone overflow checks passed.");
} finally { await browser.close(); }
