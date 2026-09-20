import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { Pool } from "pg";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { transactions } from "./database.js";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in the environment or root .env file.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
pool.on("error", (error) => console.error("Idle database connection failed:", error.message));

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "127.0.0.1";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a whole number between 1 and 65535.");
}

const webDirectory = process.env.NODE_ENV === "production"
  ? fileURLToPath(new URL("../../web/dist/", import.meta.url))
  : undefined;

if (webDirectory && !existsSync(`${webDirectory}/index.html`)) {
  throw new Error("Frontend build missing. Run npm run build from the repository root first.");
}

const SessionStore = connectPgSimple(session);
const sessionStore = new SessionStore({ pool, tableName: "web_sessions", createTableIfMissing: false });
const app = createApp({
  db: pool, transaction: transactions(pool), webDirectory,
  auth: { store: sessionStore, secret: process.env.SESSION_SECRET ?? "", secureCookies: process.env.COOKIE_SECURE !== "false", publicDemo: process.env.PUBLIC_DEMO === "true" },
  trustProxy: process.env.TRUST_PROXY === "loopback"
});
const server = app.listen(port, host, () => {
  console.log(`Uba Inventory API listening at http://${host}:${port}`);
});

server.on("error", (error) => {
  console.error("Could not start the API:", error.message);
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => { sessionStore.close(); void pool.end().then(() => process.exit(0)); });
    // Don't wait indefinitely for an unfinished request during shutdown.
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
