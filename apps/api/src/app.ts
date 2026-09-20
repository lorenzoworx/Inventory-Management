import express from "express";
import type { ApiError, HealthResponse } from "@ims/contracts";
import { join } from "node:path";
import { catalogRoutes } from "./catalog-routes.js";
import type { Database, TransactionRunner } from "./database.js";
import { errorHandler, HttpError } from "./errors.js";
import { authRoutes, requireCsrf, requireUser, sessionMiddleware, type AuthOptions } from "./auth.js";
import { storeRoutes } from "./store-routes.js";
import { stockRoutes } from "./stock-routes.js";
import { reportRoutes } from "./report-routes.js";
import { transferRoutes } from "./transfer-routes.js";
import { purchaseRoutes } from "./purchase-routes.js";

export function createApp({ db, transaction, webDirectory, auth, trustProxy = false }: { db: Database; transaction: TransactionRunner; webDirectory?: string; auth: AuthOptions; trustProxy?: boolean }) {
  const app = express();
  app.disable("x-powered-by");
  if (trustProxy) app.set("trust proxy", "loopback");
  app.use((_request, response, next) => {
    response.set({
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    });
    next();
  });
  app.use("/api", (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "16kb" }));

  app.get("/api/health", (_request, response) => {
    const health: HealthResponse = {
      status: "ok",
      service: "uba-inventory-api",
      checkedAt: new Date().toISOString(),
      message: "The inventory API is ready."
    };

    response.set("Cache-Control", "no-store").json(health);
  });

  app.use("/api", sessionMiddleware(auth));
  app.get("/api/demo", (_request, response) => { response.json({ enabled: auth.publicDemo ?? false }); });
  app.get("/api/ready", async (_request, response) => {
    try {
      await db.query("SELECT 1 FROM products LIMIT 1");
      response.json({ status: "ready" });
    } catch {
      response.status(503).json({ error: { code: "NOT_READY", message: "The database is not ready." } });
    }
  });
  app.use("/api/auth", authRoutes(db, auth));
  app.use("/api", (_request, _response, next) => {
    if (auth.publicDemo && !["GET", "HEAD", "OPTIONS"].includes(_request.method)) throw new HttpError(403, "DEMO_READ_ONLY", "Inventory changes are disabled in the public demo.");
    next();
  });
  const access = express.Router();
  access.use(["/products", "/categories", "/stores", "/stock", "/movements", "/suppliers", "/purchase-orders", "/transfers", "/reports"], requireUser(db), requireCsrf);
  app.use("/api", access, catalogRoutes(db), storeRoutes(db), stockRoutes(db, transaction), purchaseRoutes(db, transaction), transferRoutes(db, transaction), reportRoutes(db));

  // Keep API errors as JSON, even when Express also serves the frontend.
  app.use("/api", (_request, response) => {
    const error: ApiError = {
      error: { code: "NOT_FOUND", message: "This API route does not exist." }
    };
    response.status(404).json(error);
  });

  if (webDirectory) {
    app.use(express.static(webDirectory));
    // React Router owns these browser URLs; missing assets must remain 404s.
    app.get(["/", "/login", "/products", "/products/new", "/products/:id/edit", "/categories", "/stores", "/stock", "/movements", "/suppliers", "/purchases", "/purchases/new", "/purchases/:id", "/transfers", "/transfers/new", "/transfers/:id", "/reports", "/reports/valuation", "/reports/low-stock", "/reports/movements", "/connection"], (_request, response) => {
      response.sendFile(join(webDirectory, "index.html"));
    });
  }

  app.use(errorHandler);

  return app;
}
