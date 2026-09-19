import { Router } from "express";
import { paginationSchema, routeIdSchema, transferActionSchema, transferInputSchema, transferQuerySchema } from "@ims/contracts";
import type { Database, TransactionRunner } from "./database.js";
import { parseInput } from "./errors.js";
import { requireStockAccess } from "./stock-service.js";
import { transferRepository } from "./transfer-repository.js";
import { transferService } from "./transfer-service.js";

export function transferRoutes(db: Database, transaction: TransactionRunner) {
  const router = Router(); const transfers = transferService(transaction);
  router.get("/transfers/destinations", async (request, response) => {
    const { page, pageSize } = parseInput(paginationSchema, request.query);
    response.json(await transferRepository(db).destinations(page, pageSize));
  });
  router.get("/transfers", async (request, response) => {
    const query = parseInput(transferQuerySchema, request.query);
    if (query.storeId) await requireStockAccess(db, request.user!, query.storeId, "READ");
    response.json(await transferRepository(db).list(query, query.storeId ?? request.user!.storeId));
  });
  router.get("/transfers/:id", async (request, response) => { response.json(await transfers.get(request.user!, parseInput(routeIdSchema, request.params.id))); });
  router.post("/transfers", async (request, response) => {
    const transfer = await transfers.create(request.user!, parseInput(transferInputSchema, request.body));
    response.status(201).location(`/api/transfers/${transfer.id}`).json(transfer);
  });
  router.post("/transfers/:id/cancel", async (request, response) => { response.json(await transfers.cancel(request.user!, parseInput(routeIdSchema, request.params.id))); });
  for (const action of ["dispatch", "receive"] as const) router.post(`/transfers/:id/${action}`, async (request, response) => {
    const result = await transfers.move(request.user!, parseInput(routeIdSchema, request.params.id), action === "dispatch" ? "DISPATCH" : "RECEIVE", parseInput(transferActionSchema, request.body).requestId);
    response.status(result.replayed ? 200 : 201).json(result);
  });
  return router;
}
