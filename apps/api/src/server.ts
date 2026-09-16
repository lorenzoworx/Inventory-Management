import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

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

const app = createApp(webDirectory);
const server = app.listen(port, host, () => {
  console.log(`Uba Inventory API listening at http://${host}:${port}`);
});

server.on("error", (error) => {
  console.error("Could not start the API:", error.message);
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    // Don't wait indefinitely for an unfinished request during shutdown.
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
