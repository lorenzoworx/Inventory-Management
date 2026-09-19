import type { PurchaseInput, PurchaseOrder, PurchaseReceipt, PurchaseReceiptResult, PurchaseStatus, User } from "@ims/contracts";
import type { Database, TransactionRunner } from "./database.js";
import { HttpError } from "./errors.js";
import { purchaseRepository, supplierRepository } from "./purchase-repository.js";
import { stockRepository } from "./stock-repository.js";
import { applyStockMovement, requireStockAccess } from "./stock-service.js";

export function assertPurchaseAction(status: PurchaseStatus, action: "ORDER" | "CANCEL" | "RECEIVE", receivedQuantities: number[]) {
  const allowed = action === "ORDER" ? status === "DRAFT"
    : action === "CANCEL" ? ["DRAFT", "ORDERED"].includes(status) && receivedQuantities.every((quantity) => quantity === 0)
    : ["ORDERED", "PARTIALLY_RECEIVED"].includes(status);
  if (!allowed) throw new HttpError(409, "INVALID_TRANSITION", action === "CANCEL"
    ? "Only draft or ordered purchases with no receipts can be cancelled."
    : action === "ORDER" ? "Only draft purchases can be ordered." : "This purchase is not open for receiving.");
}

async function accessibleOrder(db: Database, user: User, id: number, action: "READ" | "SALE" | "MANAGE") {
  const order = await purchaseRepository(db).get(id, action === "READ" ? "SHARE" : "UPDATE");
  if (!order) throw new HttpError(404, "NOT_FOUND", "That purchase order does not exist.");
  await requireStockAccess(db, user, order.storeId, action);
  return order;
}

async function requireActiveCatalog(db: Database, supplierId: number, productIds: number[]) {
  const supplier = await supplierRepository(db).get(supplierId, true);
  if (!supplier) throw new HttpError(400, "INVALID_SUPPLIER", "Choose an existing supplier.");
  if (!supplier.isActive) throw new HttpError(409, "INACTIVE_SUPPLIER", "Reactivate this supplier before creating or ordering a purchase.");
  for (const id of [...productIds].sort((a, b) => a - b)) {
    const product = await stockRepository(db).product(id);
    if (!product) throw new HttpError(400, "INVALID_PRODUCT", "One of the selected products no longer exists.");
    if (!product.is_active) throw new HttpError(409, "INACTIVE_PRODUCT", "Only active products can be added to a new order.");
  }
}

export function purchaseService(transaction: TransactionRunner) {
  return {
    get(user: User, id: number) { return transaction((db) => accessibleOrder(db, user, id, "READ")); },
    create(user: User, input: PurchaseInput) {
      return transaction(async (db) => {
        await requireStockAccess(db, user, input.storeId, "MANAGE");
        await requireActiveCatalog(db, input.supplierId, input.lines.map((line) => line.productId));
        const repository = purchaseRepository(db);
        const id = await repository.create(input, user.id);
        return (await repository.get(id))!;
      });
    },
    transition(user: User, id: number, action: "ORDER" | "CANCEL") {
      return transaction(async (db) => {
        const order = await accessibleOrder(db, user, id, "MANAGE");
        assertPurchaseAction(order.status, action, order.lines.map((line) => line.receivedQty));
        if (action === "ORDER") await requireActiveCatalog(db, order.supplierId, order.lines.map((line) => line.productId));
        const repository = purchaseRepository(db);
        await repository.transition(id, action === "ORDER" ? "ORDERED" : "CANCELLED");
        return (await repository.get(id))!;
      });
    },
    receive(user: User, id: number, input: PurchaseReceipt): Promise<PurchaseReceiptResult> {
      return transaction(async (db) => {
        const order = await accessibleOrder(db, user, id, "SALE");
        const stock = stockRepository(db);
        const payload = { ...input, operation: "PURCHASE_RECEIPT", orderId: id, lines: [...input.lines].sort((a, b) => a.lineId - b.lineId) };
        const claim = await stock.claim<PurchaseReceiptResult>(payload, user.id);
        if (!claim.claimed) {
          if (!claim.previous.matches || !claim.previous.result) throw new HttpError(409, "REQUEST_ID_REUSED", "This request ID was already used for a different submission.");
          return { ...claim.previous.result, replayed: true };
        }
        assertPurchaseAction(order.status, "RECEIVE", order.lines.map((line) => line.receivedQty));
        const receipts = input.lines.map((receipt) => {
          const line = order.lines.find((candidate) => candidate.id === receipt.lineId);
          if (!line) throw new HttpError(400, "INVALID_LINE", "A receipt line does not belong to this purchase order.");
          if (receipt.quantity > line.orderedQty - line.receivedQty) throw new HttpError(409, "OVER_RECEIPT", `${line.name} has only ${line.orderedQty - line.receivedQty} units left to receive.`);
          return { line, quantity: receipt.quantity };
        }).sort((a, b) => a.line.productId - b.line.productId);
        const repository = purchaseRepository(db);
        const movements: PurchaseReceiptResult["movements"] = [];
        // Consistent product order prevents two multi-line receipts locking balances in opposite orders.
        for (const { line, quantity } of receipts) {
          if (!await repository.receive(line.id, quantity)) throw new HttpError(409, "OVER_RECEIPT", "This receipt exceeds the outstanding quantity.");
          movements.push(await applyStockMovement(db, user.id, { requestId: input.requestId, productId: line.productId, storeId: order.storeId,
            kind: "PURCHASE", quantity, note: `Purchase receipt ${order.number}`, purchaseOrderLineId: line.id }));
          line.receivedQty += quantity;
        }
        const status: PurchaseOrder["status"] = order.lines.every((line) => line.receivedQty === line.orderedQty) ? "RECEIVED" : "PARTIALLY_RECEIVED";
        await repository.transition(id, status);
        const result = { orderId: id, status, movements, replayed: false };
        await stock.finish(input.requestId, result);
        return result;
      });
    }
  };
}
