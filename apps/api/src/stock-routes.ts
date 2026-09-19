import { Router } from "express";
import { movementQuerySchema, reorderInputSchema, stockChangeSchema, stockQuerySchema } from "@ims/contracts";
import type { Database, TransactionRunner } from "./database.js";
import { parseInput } from "./errors.js";
import { stockRepository } from "./stock-repository.js";
import { requireStockAccess, stockService } from "./stock-service.js";

export function stockRoutes(db: Database, transaction: TransactionRunner) {
  const router = Router();
  const stock = stockService(transaction);
  router.get("/stock", async (request, response) => {
    const query = parseInput(stockQuerySchema, request.query);
    await requireStockAccess(db, request.user!, query.storeId, "READ");
    response.json(await stockRepository(db).list(query.storeId, query.q, query.page, query.pageSize));
  });
  router.get("/movements", async (request, response) => {
    const query = parseInput(movementQuerySchema, request.query);
    await requireStockAccess(db, request.user!, query.storeId, "READ");
    response.json(await stockRepository(db).history(query.storeId, query.q, query.page, query.pageSize, query.productId, query.kind));
  });
  router.post("/stock/changes", async (request, response) => {
    const result = await stock.change(request.user!, parseInput(stockChangeSchema, request.body));
    response.status(result.replayed ? 200 : 201).json(result);
  });
  router.put("/stock/reorder", async (request, response) => {
    const input = parseInput(reorderInputSchema, request.body);
    await stock.reorder(request.user!, input.productId, input.storeId, input.reorderPoint);
    response.json({ ok: true });
  });
  return router;
}
