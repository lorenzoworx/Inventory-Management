import { Router } from "express";
import { movementReportQuerySchema, reportQuerySchema } from "@ims/contracts";
import type { Database } from "./database.js";
import { parseInput } from "./errors.js";
import { requireStockAccess } from "./stock-service.js";
import { reportRepository } from "./report-repository.js";

export function reportRoutes(db: Database) {
  const router = Router(); const reports = reportRepository(db);
  for (const name of ["valuation", "low-stock"] as const) router.get(`/reports/${name}`, async (request, response) => {
    const query = parseInput(reportQuerySchema, request.query);
    if (query.storeId) await requireStockAccess(db, request.user!, query.storeId, "READ");
    const storeId = query.storeId ?? request.user!.storeId;
    response.json(name === "valuation" ? await reports.valuation(query, storeId) : await reports.lowStock(query, storeId));
  });
  router.get("/reports/movements", async (request, response) => {
    const query = parseInput(movementReportQuerySchema, request.query);
    if (query.storeId) await requireStockAccess(db, request.user!, query.storeId, "READ");
    response.json(await reports.movements(query, query.storeId ?? request.user!.storeId));
  });
  return router;
}
