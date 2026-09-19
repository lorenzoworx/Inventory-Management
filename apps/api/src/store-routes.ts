import { Router } from "express";
import { paginationSchema, routeIdSchema } from "@ims/contracts";
import { canReadStore } from "./auth.js";
import type { Database } from "./database.js";
import { HttpError, parseInput } from "./errors.js";

export function storeRoutes(db: Database) {
  const router = Router();
  router.get("/stores", async (request, response) => {
    const { page, pageSize } = parseInput(paginationSchema, request.query);
    const user = request.user!;
    const scope = user.role === "ADMIN" || user.role === "VIEWER" ? null : user.storeId;
    const count = await db.query<{ total: number }>("SELECT count(*)::integer AS total FROM stores WHERE ($1::integer IS NULL OR id = $1)", [scope]);
    const rows = await db.query("SELECT id, code, name, kind FROM stores WHERE ($1::integer IS NULL OR id = $1) ORDER BY name, id LIMIT $2 OFFSET $3", [scope, pageSize, (page - 1) * pageSize]);
    response.json({ items: rows.rows, total: count.rows[0]!.total, page, pageSize });
  });
  router.get("/stores/:id", async (request, response) => {
    const id = parseInput(routeIdSchema, request.params.id);
    const result = await db.query("SELECT id, code, name, kind FROM stores WHERE id = $1", [id]);
    if (!result.rows[0]) throw new HttpError(404, "NOT_FOUND", "That location does not exist.");
    if (!canReadStore(request.user!, id)) throw new HttpError(403, "FORBIDDEN", "You do not have access to this location.");
    response.json(result.rows[0]);
  });
  return router;
}
