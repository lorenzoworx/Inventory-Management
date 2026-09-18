import { test, expect } from "@playwright/test";
import { signIn } from "./browser-auth.js";
import { testEmail, testPassword } from "./auth-fixtures.js";

test("redirects a protected deep link to login and restores it after sign-in", async ({ page }) => {
  await page.goto("/products/new");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email address").fill(testEmail("ADMIN"));
  await page.getByLabel("Password", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/products\/new$/);
  await expect(page.getByLabel("Product name", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/products")).status()).toBe(401);
});

test("explains bad credentials and allows another attempt", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(testEmail("ADMIN"));
  await page.getByLabel("Password", { exact: true }).fill("incorrect password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Email or password is incorrect.");
  await page.getByLabel("Password", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Products", exact: true })).toBeVisible();
});

test("a viewer can browse all locations but cannot open editing screens or submit writes", async ({ page }) => {
  await signIn(page, "VIEWER");
  await expect(page.getByRole("row").filter({ hasText: "RICE-001" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add product", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Deactivate/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Categories", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create category" })).toHaveCount(0);
  await page.getByRole("link", { name: "Locations", exact: true }).click();
  for (const name of ["Lagos Central", "Ibadan Market", "Main Warehouse"]) await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.goto("/products/new");
  await expect(page.getByRole("heading", { name: "Administrator access required" })).toBeVisible();
  const session = await (await page.request.get("/api/auth/session")).json();
  const response = await page.request.post("/api/categories", { headers: { "x-csrf-token": session.csrfToken }, data: { name: "Forbidden browser write" } });
  expect(response.status()).toBe(403);
});

test("a manager sees only the assigned location and session loss returns to sign-in", async ({ page }) => {
  await signIn(page, "MANAGER");
  await page.getByRole("link", { name: "Locations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lagos Central", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ibadan Market", exact: true })).toHaveCount(0);
  await page.context().clearCookies();
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
});

test("sign-in fits a phone and supports keyboard entry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Uba Inventory home" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email address")).toBeFocused();
});
