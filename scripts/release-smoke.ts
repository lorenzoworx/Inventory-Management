import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { publicDemoCredentials } from "@ims/contracts";

const base = process.env.IMS_BASE_URL ?? "http://127.0.0.1:4200";
const stateFile = process.argv[3] ?? ".local/release-session.json";
await mkdir(dirname(stateFile), { recursive: true });
let cookie = "";
async function get(path: string) {
  const response = await fetch(`${base}${path}`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200, path);
  cookie = response.headers.getSetCookie()[0]?.split(";")[0] ?? cookie;
  return response.json();
}
assert.deepEqual(await get("/api/ready"), { status: "ready" });
assert.deepEqual(await get("/api/demo"), { enabled: true });
const html = await fetch(`${base}/reports/valuation`);
assert.equal(html.status, 200); assert.match(await html.text(), /<div id="root">/);
assert.ok(html.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"));
if (process.argv[2] === "resume") {
  cookie = JSON.parse(await readFile(stateFile, "utf8")).cookie;
  const session = await get("/api/auth/session");
  assert.equal(session.user?.role, "VIEWER", "Session must survive a restart of app and database");
} else {
  const anonymous = await get("/api/auth/session");
  const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "x-csrf-token": anonymous.csrfToken }, body: JSON.stringify(publicDemoCredentials) });
  assert.equal(login.status, 200); cookie = login.headers.getSetCookie()[0]!.split(";")[0]!;
  assert.equal((await login.json()).user.role, "VIEWER");
  await writeFile(stateFile, JSON.stringify({ cookie }), { mode: 0o600 });
}
const session = await get("/api/auth/session");
const forbidden = await fetch(`${base}/api/categories`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "x-csrf-token": session.csrfToken }, body: JSON.stringify({ name: "Must not be created" }) });
assert.equal(forbidden.status, 403); assert.equal((await forbidden.json()).error.code, "DEMO_READ_ONLY");
const stores = await get("/api/stores"); assert.equal(stores.total, 3);
const valuation = await get("/api/reports/valuation"); assert.equal(valuation.total, 15); assert.notEqual(valuation.totalValue, "0.00");
const movements = await get("/api/reports/movements"); assert.equal(movements.days.length, 14);
const transfers = await get("/api/transfers"); assert.deepEqual(transfers.items.map((row: { status: string }) => row.status).sort(), ["IN_TRANSIT", "PENDING", "RECEIVED"]);
const orders = await get("/api/purchase-orders"); assert.deepEqual(orders.items.map((row: { status: string }) => row.status).sort(), ["PARTIALLY_RECEIVED", "RECEIVED"]);
console.log("Release smoke passed: viewer access, forbidden writes, reports, workflow fixtures, and session persistence.");
