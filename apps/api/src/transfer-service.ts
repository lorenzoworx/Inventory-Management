import type { Transfer, TransferActionResult, TransferInput, TransferStatus, User } from "@ims/contracts";
import type { Database, TransactionRunner } from "./database.js";
import { HttpError } from "./errors.js";
import { transferRepository } from "./transfer-repository.js";
import { stockRepository } from "./stock-repository.js";
import { applyStockMovement, requireStockAccess } from "./stock-service.js";
import { canReadStore } from "./auth.js";

export function assertTransferAction(status: TransferStatus, action: "DISPATCH" | "RECEIVE" | "CANCEL") {
  if (status !== (action === "RECEIVE" ? "IN_TRANSIT" : "PENDING")) throw new HttpError(409, "INVALID_TRANSITION", action === "RECEIVE"
    ? "Only transfers in transit can be received." : action === "CANCEL" ? "Only pending transfers can be cancelled. Receive stock already in transit." : "Only pending transfers can be dispatched.");
}
async function load(db: Database, id: number, lock: "SHARE" | "UPDATE") {
  const transfer = await transferRepository(db).get(id, lock);
  if (!transfer) throw new HttpError(404, "NOT_FOUND", "That transfer does not exist.");
  return transfer;
}
function requireRead(user: User, transfer: Transfer) {
  if (!canReadStore(user, transfer.sourceId) && !canReadStore(user, transfer.destinationId)) throw new HttpError(403, "FORBIDDEN", "This transfer does not involve your assigned location.");
}
export function transferService(transaction: TransactionRunner) {
  return {
    get(user: User, id: number) { return transaction(async (db) => { const transfer = await load(db, id, "SHARE"); requireRead(user, transfer); return transfer; }); },
    create(user: User, input: TransferInput) {
      return transaction(async (db) => {
        await requireStockAccess(db, user, input.sourceId, "MANAGE");
        const stock = stockRepository(db);
        if (!await stock.storeExists(input.destinationId)) throw new HttpError(400, "INVALID_DESTINATION", "Choose an existing destination.");
        for (const line of [...input.lines].sort((a, b) => a.productId - b.productId)) {
          const product = await stock.product(line.productId);
          if (!product) throw new HttpError(400, "INVALID_PRODUCT", "One of the selected products no longer exists.");
          if (!product.is_active) throw new HttpError(409, "INACTIVE_PRODUCT", "Only active products can be added to a new transfer.");
        }
        const repository = transferRepository(db);
        const id = await repository.create(input, user.id);
        return (await repository.get(id, "SHARE"))!;
      });
    },
    cancel(user: User, id: number) {
      return transaction(async (db) => {
        const transfer = await load(db, id, "UPDATE");
        await requireStockAccess(db, user, transfer.sourceId, "MANAGE");
        assertTransferAction(transfer.status, "CANCEL");
        await transferRepository(db).transition(id, "CANCELLED");
        return (await transferRepository(db).get(id, "SHARE"))!;
      });
    },
    move(user: User, id: number, action: "DISPATCH" | "RECEIVE", requestId: string): Promise<TransferActionResult> {
      return transaction(async (db) => {
        const transfer = await load(db, id, "UPDATE");
        const storeId = action === "DISPATCH" ? transfer.sourceId : transfer.destinationId;
        await requireStockAccess(db, user, storeId, "SALE");
        const stock = stockRepository(db);
        const payload = { requestId, operation: `TRANSFER_${action}`, transferId: id };
        const claim = await stock.claim<TransferActionResult>(payload, user.id);
        if (!claim.claimed) {
          if (!claim.previous.matches || !claim.previous.result) throw new HttpError(409, "REQUEST_ID_REUSED", "This request ID was already used for a different submission.");
          return { ...claim.previous.result, replayed: true };
        }
        assertTransferAction(transfer.status, action);
        const movements: TransferActionResult["movements"] = [];
        // Lines are read in product order. Each action affects only one location's balances.
        for (const line of transfer.lines) movements.push(await applyStockMovement(db, user.id, { requestId, productId: line.productId, storeId,
          kind: action === "DISPATCH" ? "TRANSFER_OUT" : "TRANSFER_IN", quantity: action === "DISPATCH" ? -line.quantity : line.quantity,
          note: `${action === "DISPATCH" ? "Dispatch" : "Receive"} ${transfer.number}`, transferLineId: line.id }));
        const status = action === "DISPATCH" ? "IN_TRANSIT" : "RECEIVED";
        await transferRepository(db).transition(id, status);
        const result: TransferActionResult = { transferId: id, status, movements, replayed: false };
        await stock.finish(requestId, result);
        return result;
      });
    }
  };
}
