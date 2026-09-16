import { test, expect } from "@playwright/test";

test("the built React app reaches the real Express API and can check again", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("API connected");
  const response = page.getByLabel("API response");
  await expect(response).toContainText("uba-inventory-api");
  const firstResponse = await response.textContent();

  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByRole("status")).toHaveText("API connected");
  await expect(response).not.toHaveText(firstResponse!);
});

test("shows a pending state and disables repeated submissions", async ({ page }) => {
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route("**/api/health", async (route) => {
    await responseGate;
    await route.continue();
  });
  try {
    await page.goto("/");
    await expect(page.getByRole("status")).toHaveText("Checking connection…");
    await expect(page.getByRole("button", { name: "Checking…" })).toBeDisabled();
  } finally {
    releaseResponse();
  }
  await expect(page.getByRole("status")).toHaveText("API connected");
});

test("recovers from a network failure when the user retries", async ({ page }) => {
  await page.route("**/api/health", (route) => route.abort("connectionrefused"));
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Connection failed");
  await expect(page.getByText("Could not reach the API.", { exact: false })).toBeVisible();

  await page.unrouteAll();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("status")).toHaveText("API connected");
});

test("an HTTP error is not mistaken for a successful fetch", async ({ page }) => {
  await page.route("**/api/health", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Connection failed");
  await expect(page.getByText("The API returned HTTP 503. Try again shortly.")).toBeVisible();
});

test("rejects JSON with an unexpected shape instead of showing a false healthy state", async ({ page }) => {
  await page.route("**/api/health", (route) => route.fulfill({ json: { status: "broken" } }));
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Connection failed");
  await expect(page.getByText("The API response did not match the expected format.")).toBeVisible();
});

test("explains a non-JSON response", async ({ page }) => {
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, body: "<html>Oops</html>" }));
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Connection failed");
  await expect(page.getByText("The API did not return valid JSON.")).toBeVisible();
});

test("a stalled request times out and permits another attempt", async ({ page }) => {
  await page.route("**/api/health", () => { /* Leave this request unanswered. */ });
  await page.goto("/");
  await expect(page.getByText("The API took too long to respond. Try again.")).toBeVisible({ timeout: 8000 });
  await page.unrouteAll();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("status")).toHaveText("API connected");
});

test("unknown API routes remain JSON 404s when the frontend is served", async ({ request }) => {
  const response = await request.get("/api/missing");
  expect(response.status()).toBe(404);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect((await response.json()).error.code).toBe("NOT_FOUND");
});

test("the connection page fits a phone and remains keyboard accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("API connected");
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalOverflow).toBe(false);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Uba Inventory home" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Check again" })).toBeFocused();
});
