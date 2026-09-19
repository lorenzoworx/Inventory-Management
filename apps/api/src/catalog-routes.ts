import { Router } from "express";
import { categoryInputSchema, paginationSchema, productInputSchema, productQuerySchema, productStatusSchema, routeIdSchema } from "@ims/contracts";
import { catalogRepository } from "./catalog-repository.js";
import type { Database } from "./database.js";
import { HttpError, parseInput } from "./errors.js";
import { requireAdmin } from "./auth.js";

export function catalogRoutes(db: Database) {
  const router = Router();
  const catalog = catalogRepository(db);
  const missing = () => new HttpError(404, "NOT_FOUND", "That catalog record does not exist.");

  router.get("/products", async (request, response) => {
    response.json(await catalog.listProducts(parseInput(productQuerySchema, request.query)));
  });
  router.get("/products/:id", async (request, response) => {
    const product = await catalog.getProduct(parseInput(routeIdSchema, request.params.id));
    if (!product) throw missing();
    response.json(product);
  });
  router.post("/products", requireAdmin, async (request, response) => {
    const id = await catalog.createProduct(parseInput(productInputSchema, request.body));
    response.status(201).location(`/api/products/${id}`).json(await catalog.getProduct(id));
  });
  router.put("/products/:id", requireAdmin, async (request, response) => {
    const id = parseInput(routeIdSchema, request.params.id);
    const input = parseInput(productInputSchema, request.body);
    if (!await catalog.updateProduct(id, input)) throw missing();
    response.json(await catalog.getProduct(id));
  });
  router.patch("/products/:id/status", requireAdmin, async (request, response) => {
    const id = parseInput(routeIdSchema, request.params.id);
    const { isActive } = parseInput(productStatusSchema, request.body);
    if (!await catalog.setProductStatus(id, isActive)) throw missing();
    response.json(await catalog.getProduct(id));
  });
  router.get("/categories", async (request, response) => {
    const { page, pageSize } = parseInput(paginationSchema, request.query);
    response.json(await catalog.listCategories(page, pageSize));
  });
  router.post("/categories", requireAdmin, async (request, response) => {
    const input = parseInput(categoryInputSchema, request.body);
    response.status(201).json(await catalog.createCategory(input.name));
  });
  router.put("/categories/:id", requireAdmin, async (request, response) => {
    const id = parseInput(routeIdSchema, request.params.id);
    const input = parseInput(categoryInputSchema, request.body);
    const category = await catalog.updateCategory(id, input.name);
    if (!category) throw missing();
    response.json(category);
  });
  return router;
}
