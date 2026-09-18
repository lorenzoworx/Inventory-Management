import express from "express";
import type { ApiError, HealthResponse } from "@ims/contracts";
import { join } from "node:path";
import { catalogRoutes } from "./catalog-routes.js";
import type { Database } from "./catalog-repository.js";
import { errorHandler } from "./errors.js";

export function createApp({ db, webDirectory }: { db: Database; webDirectory?: string }) {
  const app = express();
  app.disable("x-powered-by");
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

  app.use("/api", catalogRoutes(db));

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
    app.get(["/", "/products", "/products/new", "/products/:id/edit", "/categories", "/connection"], (_request, response) => {
      response.sendFile(join(webDirectory, "index.html"));
    });
  }

  app.use(errorHandler);

  return app;
}
