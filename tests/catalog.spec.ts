import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { connectTestDatabase } from "./test-database.js";
import { signIn } from "./browser-auth.js";

test.beforeEach(async ({ page }) => { await signIn(page); });

const productSkus: string[] = [];
const categoryNames: string[] = [];
test.afterEach(async () => {
  if (!productSkus.length && !categoryNames.length) return;
  const client = await connectTestDatabase();
  try {
    await client.query("DELETE FROM products WHERE sku = ANY($1::text[])", [productSkus]);
    await client.query("DELETE FROM categories WHERE name = ANY($1::text[])", [categoryNames]);
  } finally {
    await client.end(); productSkus.length = 0; categoryNames.length = 0;
  }
});

async function fillProduct(page: Page, sku: string, name: string, category: string) {
  await page.getByLabel("Product name", { exact: true }).fill(name);
  await page.getByLabel("SKU", { exact: true }).fill(sku);
  await page.getByLabel("Category", { exact: true }).selectOption({ label: category });
  await page.getByLabel("Cost price (NGN)").fill("100.10");
  await page.getByLabel("Selling price (NGN)").fill("150.25");
}

test("creates a category and product, edits through a deep link, and changes active status", async ({ page }) => {
  const suffix = randomUUID();
  const category = `Browser ${suffix}`;
  const renamedCategory = `Renamed ${suffix}`;
  const sku = `BROWSER-${suffix}`;
  categoryNames.push(category, renamedCategory); productSkus.push(sku);
  await page.goto("/categories");
  await page.getByLabel("Category name").fill(category);
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${category} created.` })).toHaveText(`${category} created.`);
  await page.getByRole("button", { name: `Edit ${category}`, exact: true }).click();
  await page.getByLabel("Category name").fill(renamedCategory);
  await page.getByRole("button", { name: "Save category" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${renamedCategory} updated.` })).toHaveText(`${renamedCategory} updated.`);

  await page.getByRole("link", { name: "Products", exact: true }).click();
  await page.getByRole("link", { name: "Add product", exact: true }).click();
  await fillProduct(page, sku, "Browser test rice", renamedCategory);
  await page.getByRole("button", { name: "Create product" }).click();
  let row = page.getByRole("row").filter({ hasText: sku });
  await expect(row).toContainText("₦150.25");
  await row.getByRole("link", { name: "Edit Browser test rice", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("SKU", { exact: true })).toHaveValue(sku);
  await page.getByLabel("Selling price (NGN)").fill("175.50");
  await page.getByRole("button", { name: "Save changes" }).click();
  row = page.getByRole("row").filter({ hasText: sku });
  await expect(row).toContainText("₦175.50");
  await row.getByRole("button", { name: "Deactivate Browser test rice", exact: true }).click();
  await expect(row).toContainText("Inactive");
  await page.getByLabel("Status", { exact: true }).selectOption("active");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("heading", { name: "No products found" })).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("inactive");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page.getByRole("button", { name: "Reactivate Browser test rice", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Browser test rice reactivated." })).toHaveText("Browser test rice reactivated.");
  await page.getByLabel("Status", { exact: true }).selectOption("all");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("row").filter({ hasText: sku })).toContainText("Active");
});

test("shows client validation and server duplicate errors without losing form values", async ({ page }) => {
  await page.goto("/products/new");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("alert")).toHaveText("Check the highlighted fields.");
  await expect(page.getByLabel("Product name", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await fillProduct(page, "RICE-001", "Duplicate rice", "Pantry");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("alert")).toContainText("A product with this SKU already exists.");
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue("Duplicate rice");
  await expect(page.getByLabel("SKU", { exact: true })).toHaveAttribute("aria-invalid", "true");
});

test("searches real seeded products and restores category filters on refresh and Back", async ({ page }) => {
  const response = await page.request.get("/api/categories?pageSize=100");
  const { items } = await response.json();
  const pantry = items.find((item: { name: string }) => item.name === "Pantry");
  await page.goto(`/products?categoryId=${pantry.id}&q=RICE-001`);
  await expect(page.getByRole("row").filter({ hasText: "RICE-001" })).toBeVisible();
  await expect(page.getByLabel("Category", { exact: true })).toHaveValue(String(pantry.id));
  await page.getByLabel("Search products").fill("BEANS-001");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("row").filter({ hasText: "BEANS-001" })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("Search products")).toHaveValue("RICE-001");
  await expect(page.getByRole("row").filter({ hasText: "RICE-001" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Category", { exact: true })).toHaveValue(String(pantry.id));
});

test("shows loading, handles a failed catalog request, and retries", async ({ page }) => {
  await page.route("**/api/products?**", (route) => route.abort("connectionrefused"));
  await page.goto("/products");
  await expect(page.getByRole("alert")).toContainText("Could not reach the server.");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.unrouteAll();
  await page.route("**/api/products?**", async (route) => { await gate; await route.continue(); });
  await page.getByRole("button", { name: "Try again" }).click();
  try { await expect(page.getByRole("status")).toHaveText("Loading products…"); }
  finally { release(); }
  await expect(page.getByRole("row").filter({ hasText: "RICE-001" })).toBeVisible();
});

test("product list paginates and an empty later page returns to the last page", async ({ page }) => {
  await page.goto("/products?pageSize=1&status=all");
  await expect(page.getByRole("row")).toHaveCount(2);
  const first = await page.locator("tbody").innerText();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator("tbody")).not.toHaveText(first);
  await page.goto("/products?page=100&q=RICE-001");
  await expect(page).toHaveURL(/page=1&/);
  await expect(page.getByRole("row").filter({ hasText: "RICE-001" })).toBeVisible();
});

test("the catalog and form fit a phone and provide keyboard access", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/products");
  await expect(page.getByRole("row").filter({ hasText: "RICE-001" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.getByRole("link", { name: "Add product", exact: true }).click();
  await expect(page.getByLabel("Product name", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
