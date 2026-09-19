import type { StockChange, StockChangeResult, User } from "@ims/contracts";
import { canReadStore } from "./auth.js";
import type { Database, TransactionRunner } from "./database.js";
import { HttpError } from "./errors.js";
import { stockRepository } from "./stock-repository.js";

export async function requireStockAccess(db: Database, user: User, storeId: number, operation: "READ" | "SALE" | "MANAGE") {
  if (!await stockRepository(db).storeExists(storeId)) throw new HttpError(404, "NOT_FOUND", "That location does not exist.");
  if (!canReadStore(user, storeId) || (operation !== "READ" && user.role === "VIEWER") || (operation === "MANAGE" && user.role === "STAFF")) {
    throw new HttpError(403, "FORBIDDEN", "Your account cannot perform this action at this location.");
  }
}

export function stockService(transaction: TransactionRunner) {
  return {
    change(user: User, input: StockChange): Promise<StockChangeResult> {
      return transaction(async (db) => {
        await requireStockAccess(db, user, input.storeId, input.kind === "SALE" ? "SALE" : "MANAGE");
        const repository = stockRepository(db);
        const claim = await repository.claim(input, user.id);
        if (!claim.claimed) {
          if (!claim.previous.matches || !claim.previous.result) throw new HttpError(409, "REQUEST_ID_REUSED", "This request ID was already used for a different submission.");
          return { ...claim.previous.result, replayed: true };
        }
        const product = await repository.product(input.productId);
        if (!product) throw new HttpError(404, "NOT_FOUND", "That product does not exist.");
        if (!product.is_active && input.kind !== "ADJUSTMENT") throw new HttpError(409, "INACTIVE_PRODUCT", "Reactivate this product before recording opening stock or sales.");
        await repository.lockBalance(input.productId, input.storeId);
        if (input.kind === "OPENING" && await repository.hasMovements(input.productId, input.storeId)) {
          throw new HttpError(409, "ALREADY_OPENED", "This product already has stock history here. Record an adjustment instead.");
        }
        const delta = input.kind === "SALE" ? -input.quantity : input.quantity;
        const balance = await repository.changeBalance(input.productId, input.storeId, delta);
        if (balance === undefined) throw new HttpError(409, "STOCK_LIMIT", "This change would make stock negative or exceed the supported balance.");
        const movementId = await repository.movement(input, delta, balance, user.id);
        const result = { movementId, productId: input.productId, storeId: input.storeId, quantity: delta, balance, replayed: false };
        await repository.finish(input.requestId, result);
        return result;
      });
    },
    reorder(user: User, productId: number, storeId: number, reorderPoint: number) {
      return transaction(async (db) => {
        await requireStockAccess(db, user, storeId, "MANAGE");
        const repository = stockRepository(db);
        if (!await repository.product(productId)) throw new HttpError(404, "NOT_FOUND", "That product does not exist.");
        await repository.reorder(productId, storeId, reorderPoint);
      });
    }
  };
}
