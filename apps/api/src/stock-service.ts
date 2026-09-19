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

export type MovementInput = { productId: number; storeId: number; requestId: string; kind: "OPENING" | "SALE" | "ADJUSTMENT" | "PURCHASE" | "TRANSFER_OUT" | "TRANSFER_IN"; quantity: number; note: string; purchaseOrderLineId?: number; transferLineId?: number };

// Call only within a transaction, after authorization and claiming the request ID.
// Purchases call this repeatedly on the same connection; no nested transaction commits a single line.
export async function applyStockMovement(db: Database, userId: number, input: MovementInput): Promise<StockChangeResult> {
  if (!Number.isInteger(input.quantity) || input.quantity === 0 || Math.abs(input.quantity) > 1000000
    || (["SALE", "TRANSFER_OUT"].includes(input.kind) && input.quantity > 0) || (["OPENING", "PURCHASE", "TRANSFER_IN"].includes(input.kind) && input.quantity < 0)) {
    throw new HttpError(400, "INVALID_QUANTITY", "The stock change has an invalid quantity or sign.");
  }
  const repository = stockRepository(db);
  const product = await repository.product(input.productId);
  if (!product) throw new HttpError(404, "NOT_FOUND", "That product does not exist.");
  if (!product.is_active && ["OPENING", "SALE"].includes(input.kind)) throw new HttpError(409, "INACTIVE_PRODUCT", "Reactivate this product before recording opening stock or sales.");
  await repository.lockBalance(input.productId, input.storeId);
  if (input.kind === "OPENING" && await repository.hasMovements(input.productId, input.storeId)) {
    throw new HttpError(409, "ALREADY_OPENED", "This product already has stock history here. Record an adjustment instead.");
  }
  const balance = await repository.changeBalance(input.productId, input.storeId, input.quantity);
  if (balance === undefined) throw new HttpError(409, "STOCK_LIMIT", "This change would make stock negative or exceed the supported balance.");
  const movementId = await repository.movement(input, balance, userId);
  return { movementId, productId: input.productId, storeId: input.storeId, quantity: input.quantity, balance, replayed: false };
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
        const result = await applyStockMovement(db, user.id, { ...input, quantity: input.kind === "SALE" ? -input.quantity : input.quantity });
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
