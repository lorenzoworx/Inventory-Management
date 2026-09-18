import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, readFile, writeFile } from "node:fs/promises";

// Local setup only. Existing values are never replaced and credentials are not printed.
let text = existsSync(".env") ? await readFile(".env", "utf8") : "";
const defaults: Record<string, string> = {
  DATABASE_URL: "postgresql://ims@127.0.0.1:5433/ims",
  TEST_DATABASE_URL: "postgresql://ims@127.0.0.1:5433/ims_test",
  COOKIE_SECURE: "false",
  SESSION_SECRET: randomBytes(48).toString("hex"),
  ADMIN_PASSWORD: randomBytes(18).toString("base64url"),
  VIEWER_PASSWORD: randomBytes(18).toString("base64url"),
  MANAGER_PASSWORD: randomBytes(18).toString("base64url"),
  STAFF_PASSWORD: randomBytes(18).toString("base64url")
};
for (const [key, value] of Object.entries(defaults)) {
  if (!new RegExp(`^${key}=.+$`, "m").test(text)) {
    text = text.replace(new RegExp(`^${key}=.*$`, "m"), "");
    text += `\n${key}=${value}\n`;
  }
}
await writeFile(".env", text, { mode: 0o600 });
await chmod(".env", 0o600);
console.log("Local configuration is ready in the ignored .env file. Existing values were preserved.");
