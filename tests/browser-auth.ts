import type { Page } from "@playwright/test";
import type { Role } from "@ims/contracts";
import { testEmail, testPassword } from "./auth-fixtures.js";

export async function signIn(page: Page, role: Role = "ADMIN") {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(testEmail(role));
  await page.getByLabel("Password", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
}
