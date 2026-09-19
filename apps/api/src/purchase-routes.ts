import { Router } from "express";
import { productStatusSchema, purchaseInputSchema, purchaseQuerySchema, purchaseReceiptSchema, routeIdSchema, supplierInputSchema, supplierQuerySchema } from "@ims/contracts";
import { requireAdmin } from "./auth.js";
import type { Database, TransactionRunner } from "./database.js";
import { HttpError, parseInput } from "./errors.js";
import { purchaseRepository, supplierRepository } from "./purchase-repository.js";
import { purchaseService } from "./purchase-service.js";
import { requireStockAccess } from "./stock-service.js";

export function purchaseRoutes(db: Database, transaction: TransactionRunner) {
  const router = Router();
  const suppliers = supplierRepository(db);
  const purchases = purchaseService(transaction);
  const missing = () => new HttpError(404, "NOT_FOUND", "That supplier does not exist.");
  router.get("/suppliers", async (request, response) => {
    const { q, status, page, pageSize } = parseInput(supplierQuerySchema, request.query);
    response.json(await suppliers.list(q, status, page, pageSize));
  });
  router.get("/suppliers/:id", async (request, response) => {
    const supplier = await suppliers.get(parseInput(routeIdSchema, request.params.id));
    if (!supplier) throw missing();
    response.json(supplier);
  });
  router.post("/suppliers", requireAdmin, async (request, response) => {
    const supplier = await suppliers.create(parseInput(supplierInputSchema, request.body));
    response.status(201).location(`/api/suppliers/${supplier.id}`).json(supplier);
  });
  router.put("/suppliers/:id", requireAdmin, async (request, response) => {
    const supplier = await suppliers.update(parseInput(routeIdSchema, request.params.id), parseInput(supplierInputSchema, request.body));
    if (!supplier) throw missing();
    response.json(supplier);
  });
  router.patch("/suppliers/:id/status", requireAdmin, async (request, response) => {
    const supplier = await suppliers.status(parseInput(routeIdSchema, request.params.id), parseInput(productStatusSchema, request.body).isActive);
    if (!supplier) throw missing();
    response.json(supplier);
  });
  router.get("/purchase-orders", async (request, response) => {
    const query = parseInput(purchaseQuerySchema, request.query);
    const user = request.user!;
    if (query.storeId) await requireStockAccess(db, user, query.storeId, "READ");
    const storeId = query.storeId ?? user.storeId;
    response.json(await purchaseRepository(db).list(query, storeId));
  });
  router.get("/purchase-orders/:id", async (request, response) => {
    response.json(await purchases.get(request.user!, parseInput(routeIdSchema, request.params.id)));
  });
  router.post("/purchase-orders", async (request, response) => {
    const order = await purchases.create(request.user!, parseInput(purchaseInputSchema, request.body));
    response.status(201).location(`/api/purchase-orders/${order.id}`).json(order);
  });
  for (const action of ["order", "cancel"] as const) router.post(`/purchase-orders/:id/${action}`, async (request, response) => {
    response.json(await purchases.transition(request.user!, parseInput(routeIdSchema, request.params.id), action === "order" ? "ORDER" : "CANCEL"));
  });
  router.post("/purchase-orders/:id/receive", async (request, response) => {
    const result = await purchases.receive(request.user!, parseInput(routeIdSchema, request.params.id), parseInput(purchaseReceiptSchema, request.body));
    response.status(result.replayed ? 200 : 201).json(result);
  });
  return router;
}
