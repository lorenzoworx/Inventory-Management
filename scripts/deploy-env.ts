import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { publicDemoCredentials } from "@ims/contracts";

const destination = process.env.IMS_DEPLOY_ENV ?? "deploy/.env";
await mkdir(dirname(destination), { recursive: true });
const secret = () => randomBytes(24).toString("hex");
const values = { DB_OWNER_PASSWORD: secret(), DB_APP_PASSWORD: secret(), SESSION_SECRET: secret(),
  ADMIN_PASSWORD: secret(), MANAGER_PASSWORD: secret(), STAFF_PASSWORD: secret(), VIEWER_PASSWORD: publicDemoCredentials.password };
try {
  await writeFile(destination, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(""), { flag: "wx", mode: 0o600 });
  console.log(`Created private ${destination}. Operational secrets were not printed. The viewer password is intentionally public.`);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  console.log(`${destination} already exists; it was preserved.`);
}
