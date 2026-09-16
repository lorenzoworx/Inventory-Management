import express from "express";
import type { ApiError, HealthResponse } from "@ims/contracts";

export function createApp(webDirectory?: string) {
  const app = express();
  app.disable("x-powered-by");

  app.get("/api/health", (_request, response) => {
    const health: HealthResponse = {
      status: "ok",
      service: "uba-inventory-api",
      checkedAt: new Date().toISOString(),
      message: "Ready to build the catalog."
    };

    response.set("Cache-Control", "no-store").json(health);
  });

  // Keep API errors as JSON, even when Express also serves the frontend.
  app.use("/api", (_request, response) => {
    const error: ApiError = {
      error: { code: "NOT_FOUND", message: "This API route does not exist." }
    };
    response.status(404).json(error);
  });

  if (webDirectory) {
    app.use(express.static(webDirectory));
  }

  return app;
}
