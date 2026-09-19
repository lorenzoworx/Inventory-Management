import express from "express";
import type { ApiError, HealthResponse } from "@ims/contracts";
import { join } from "node:path";
import { catalogRoutes } from "./catalog-routes.js";
import type { Database, TransactionRunner } from "./database.js";
import { errorHandler } from "./errors.js";
import { authRoutes, requireCsrf, requireUser, sessionMiddleware, type AuthOptions } from "./auth.js";
import { storeRoutes } from "./store-routes.js";
import { stockRoutes } from "./stock-routes.js";

export function createApp({ db, transaction, webDirectory, auth, trustProxy = false }: { db: Database; transaction: TransactionRunner; webDirectory?: string; auth: AuthOptions; trustProxy?: boolean }) {
  const app = express();
  app.disable("x-powered-by");
  if (trustProxy) app.set("trust proxy", "loopback");
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
  app.use("/api/auth", authRoutes(db, auth));
  const access = express.Router();
  access.use(["/products", "/categories", "/stores", "/stock", "/movements"], requireUser(db), requireCsrf);
  app.use("/api", access, catalogRoutes(db), storeRoutes(db), stockRoutes(db, transaction));

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
    app.get(["/", "/login", "/products", "/products/new", "/products/:id/edit", "/categories", "/stores", "/stock", "/movements", "/connection"], (_request, response) => {
      response.sendFile(join(webDirectory, "index.html"));
    });
  }

  app.use(errorHandler);

  return app;
}
