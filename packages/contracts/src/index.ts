import { z } from "zod";

// JSON arrives at runtime, after TypeScript's compile-time checks are gone.
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string().min(1),
  checkedAt: z.iso.datetime(),
  message: z.string()
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), fields: z.record(z.string(), z.string()).optional() })
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const recordIdSchema = z.number().int().positive().max(2147483647);
export const routeIdSchema = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(recordIdSchema);
const nameSchema = z.string().trim().min(1, "Enter a name.").max(120);
// numeric(12, 2) permits ten integer digits and two fractional digits.
export const priceInputSchema = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/, "Enter a non-negative price with at most two decimal places.");
export const categoryInputSchema = z.strictObject({ name: nameSchema });
export const categorySchema = z.object({ id: recordIdSchema, name: nameSchema });
export type Category = z.infer<typeof categorySchema>;
export const categoryListSchema = z.object({
  items: z.array(categorySchema), total: z.number().int().nonnegative(),
  page: z.number().int().positive(), pageSize: z.number().int().positive()
});

export const productInputSchema = z.strictObject({
  sku: z.string().trim().min(1, "Enter a SKU.").max(64),
  barcode: z.string().trim().min(1).max(64).nullable(),
  name: nameSchema,
  unit: z.string().trim().min(1, "Enter a unit.").max(32),
  costPrice: priceInputSchema,
  sellPrice: priceInputSchema,
  categoryId: recordIdSchema
});
export type ProductInput = z.infer<typeof productInputSchema>;
export const productSchema = productInputSchema.extend({
  id: recordIdSchema, categoryName: nameSchema, isActive: z.boolean(), createdAt: z.iso.datetime()
});
export type Product = z.infer<typeof productSchema>;
export const productStatusSchema = z.strictObject({ isActive: z.boolean() });
export const paginationSchema = z.object({
  page: routeIdSchema.pipe(z.number().max(100000)).default(1),
  pageSize: routeIdSchema.pipe(z.number().max(100)).default(20)
});
export const productQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).default(""),
  categoryId: routeIdSchema.optional(),
  status: z.enum(["active", "inactive", "all"]).default("active")
});
export type ProductQuery = z.infer<typeof productQuerySchema>;
export const productListSchema = z.object({
  items: z.array(productSchema), total: z.number().int().nonnegative(),
  page: z.number().int().positive(), pageSize: z.number().int().positive()
});
export type ProductList = z.infer<typeof productListSchema>;

export const roleSchema = z.enum(["ADMIN", "MANAGER", "STAFF", "VIEWER"]);
export type Role = z.infer<typeof roleSchema>;
export const userSchema = z.object({
  id: recordIdSchema, email: z.email(), name: z.string(), role: roleSchema,
  storeId: recordIdSchema.nullable(), storeName: z.string().nullable()
});
export type User = z.infer<typeof userSchema>;
export const loginSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(1).max(72).refine((value) => new TextEncoder().encode(value).length <= 72, "Password must be at most 72 UTF-8 bytes.")
});
export const sessionSchema = z.object({ user: userSchema.nullable(), csrfToken: z.string().min(32) });
export type SessionInfo = z.infer<typeof sessionSchema>;
export const okSchema = z.object({ ok: z.literal(true) });
export const storeSchema = z.object({ id: recordIdSchema, code: z.string(), name: z.string(), kind: z.enum(["SHOP", "WAREHOUSE"]) });
export const storeListSchema = z.object({ items: z.array(storeSchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive() });

export const movementKindSchema = z.enum(["OPENING", "SALE", "ADJUSTMENT", "PURCHASE", "TRANSFER_OUT", "TRANSFER_IN"]);
const stockIdentifiers = { requestId: z.uuid(), productId: recordIdSchema, storeId: recordIdSchema };
const units = z.number().int().positive().max(1000000);
export const stockChangeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...stockIdentifiers, kind: z.literal("OPENING"), quantity: units, note: z.string().trim().max(500).default("") }),
  z.strictObject({ ...stockIdentifiers, kind: z.literal("SALE"), quantity: units, note: z.string().trim().max(500).default("") }),
  z.strictObject({ ...stockIdentifiers, kind: z.literal("ADJUSTMENT"), quantity: z.number().int().min(-1000000).max(1000000).refine((value) => value !== 0, "Quantity cannot be zero."), note: z.string().trim().min(3, "Give a reason for the adjustment.").max(500) })
]);
export type StockChange = z.infer<typeof stockChangeSchema>;
export const stockChangeResultSchema = z.object({ movementId: recordIdSchema, productId: recordIdSchema, storeId: recordIdSchema, quantity: z.number().int(), balance: z.number().int().nonnegative(), replayed: z.boolean() });
export type StockChangeResult = z.infer<typeof stockChangeResultSchema>;
export const reorderInputSchema = z.strictObject({ productId: recordIdSchema, storeId: recordIdSchema, reorderPoint: z.number().int().min(0).max(1000000) });
export const stockQuerySchema = paginationSchema.extend({ storeId: routeIdSchema, q: z.string().trim().max(100).default("") });
export const movementQuerySchema = stockQuerySchema.extend({ productId: routeIdSchema.optional(), kind: movementKindSchema.optional() });
export const stockItemSchema = z.object({ productId: recordIdSchema, sku: z.string(), name: z.string(), unit: z.string(), isActive: z.boolean(), quantity: z.number().int().nonnegative(), reorderPoint: z.number().int().nonnegative(), hasMovements: z.boolean() });
export type StockItem = z.infer<typeof stockItemSchema>;
export const stockListSchema = z.object({ items: z.array(stockItemSchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive() });
export const movementSchema = z.object({ id: recordIdSchema, productId: recordIdSchema, sku: z.string(), name: z.string(), kind: movementKindSchema, quantity: z.number().int(), balanceAfter: z.number().int().nonnegative(), note: z.string(), actorName: z.string(), createdAt: z.iso.datetime() });
export const movementListSchema = z.object({ items: z.array(movementSchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive() });

export const supplierInputSchema = z.strictObject({
  name: nameSchema, email: z.email().max(254).nullable(),
  phone: z.string().trim().min(1).max(40).nullable(), address: z.string().trim().min(1).max(500).nullable()
});
export type SupplierInput = z.infer<typeof supplierInputSchema>;
export const supplierSchema = supplierInputSchema.extend({ id: recordIdSchema, isActive: z.boolean() });
export type Supplier = z.infer<typeof supplierSchema>;
export const supplierQuerySchema = paginationSchema.extend({ q: z.string().trim().max(100).default(""), status: z.enum(["active", "inactive", "all"]).default("active") });
export const supplierListSchema = z.object({ items: z.array(supplierSchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive() });

export const purchaseStatusSchema = z.enum(["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"]);
export type PurchaseStatus = z.infer<typeof purchaseStatusSchema>;
const purchaseLineInputSchema = z.strictObject({ productId: recordIdSchema, orderedQty: units, unitCost: priceInputSchema });
export const purchaseInputSchema = z.strictObject({
  supplierId: recordIdSchema, storeId: recordIdSchema, notes: z.string().trim().max(500).default(""),
  lines: z.array(purchaseLineInputSchema).min(1).max(50).refine((lines) => new Set(lines.map((line) => line.productId)).size === lines.length, "Each product can appear only once.")
});
export type PurchaseInput = z.infer<typeof purchaseInputSchema>;
export const purchaseReceiptSchema = z.strictObject({
  requestId: z.uuid(),
  lines: z.array(z.strictObject({ lineId: recordIdSchema, quantity: units })).min(1).max(50)
    .refine((lines) => new Set(lines.map((line) => line.lineId)).size === lines.length, "Each line can appear only once.")
});
export type PurchaseReceipt = z.infer<typeof purchaseReceiptSchema>;
export const purchaseQuerySchema = paginationSchema.extend({ storeId: routeIdSchema.optional(), status: purchaseStatusSchema.optional(), q: z.string().trim().max(100).default("") });
export type PurchaseQuery = z.infer<typeof purchaseQuerySchema>;
export const purchaseSummarySchema = z.object({
  id: recordIdSchema, number: z.string(), supplierId: recordIdSchema, supplierName: z.string(), storeId: recordIdSchema, storeName: z.string(),
  status: purchaseStatusSchema, notes: z.string(), createdAt: z.iso.datetime(), orderedAt: z.iso.datetime().nullable(), closedAt: z.iso.datetime().nullable(),
  total: z.string().regex(/^\d+\.\d{2}$/)
});
export const purchaseSchema = purchaseSummarySchema.extend({
  lines: z.array(purchaseLineInputSchema.extend({ id: recordIdSchema, sku: z.string(), name: z.string(), receivedQty: z.number().int().nonnegative() }))
});
export type PurchaseOrder = z.infer<typeof purchaseSchema>;
export const purchaseListSchema = z.object({ items: z.array(purchaseSummarySchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive() });
export const purchaseReceiptResultSchema = z.object({ orderId: recordIdSchema, status: purchaseStatusSchema, movements: z.array(stockChangeResultSchema), replayed: z.boolean() });
export type PurchaseReceiptResult = z.infer<typeof purchaseReceiptResultSchema>;

export const transferStatusSchema = z.enum(["PENDING", "IN_TRANSIT", "RECEIVED", "CANCELLED"]);
export type TransferStatus = z.infer<typeof transferStatusSchema>;
const transferLineInputSchema = z.strictObject({ productId: recordIdSchema, quantity: units });
export const transferInputSchema = z.strictObject({
  sourceId: recordIdSchema, destinationId: recordIdSchema, notes: z.string().trim().max(500).default(""),
  lines: z.array(transferLineInputSchema).min(1).max(50).refine((lines) => new Set(lines.map((line) => line.productId)).size === lines.length, "Each product can appear only once.")
}).refine((input) => input.sourceId !== input.destinationId, { message: "Source and destination must be different locations.", path: ["destinationId"] });
export type TransferInput = z.infer<typeof transferInputSchema>;
export const transferActionSchema = z.strictObject({ requestId: z.uuid() });
export const transferQuerySchema = paginationSchema.extend({ storeId: routeIdSchema.optional(), status: transferStatusSchema.optional(), q: z.string().trim().max(100).default("") });
export type TransferQuery = z.infer<typeof transferQuerySchema>;
export const transferSummarySchema = z.object({
  id: recordIdSchema, number: z.string(), sourceId: recordIdSchema, sourceName: z.string(), destinationId: recordIdSchema, destinationName: z.string(),
  status: transferStatusSchema, notes: z.string(), createdAt: z.iso.datetime(), dispatchedAt: z.iso.datetime().nullable(), receivedAt: z.iso.datetime().nullable(),
  totalUnits: z.number().int().positive()
});
export const transferSchema = transferSummarySchema.extend({ lines: z.array(transferLineInputSchema.extend({ id: recordIdSchema, sku: z.string(), name: z.string() })) });
export type Transfer = z.infer<typeof transferSchema>;
export const transferListSchema = z.object({ items: z.array(transferSummarySchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive() });
export const transferActionResultSchema = z.object({ transferId: recordIdSchema, status: transferStatusSchema, movements: z.array(stockChangeResultSchema), replayed: z.boolean() });
export type TransferActionResult = z.infer<typeof transferActionResultSchema>;

// Aggregated quantities and money remain strings so large SQL totals keep their exact precision.
const countString = z.string().regex(/^\d+$/);
const signedCountString = z.string().regex(/^-?\d+$/);
const moneyTotal = z.string().regex(/^\d+\.\d{2}$/);
export const reportQuerySchema = paginationSchema.extend({ storeId: routeIdSchema.optional(), q: z.string().trim().max(100).default("") });
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export const movementReportQuerySchema = reportQuerySchema.extend({ endDate: z.iso.date().refine((date) => date >= "2000-01-01" && date <= "2100-12-31", "Choose a date from 2000 through 2100.").optional() });
export type MovementReportQuery = z.infer<typeof movementReportQuerySchema>;
const reportProduct = { productId: recordIdSchema, sku: z.string(), name: z.string(), unit: z.string(), storeId: recordIdSchema, storeName: z.string(), quantity: z.number().int().nonnegative() };
export const valuationReportSchema = z.object({
  items: z.array(z.object({ ...reportProduct, isActive: z.boolean(), costPrice: moneyTotal, value: moneyTotal })),
  total: z.number().int().nonnegative(), totalQuantity: countString, totalValue: moneyTotal,
  page: z.number().int().positive(), pageSize: z.number().int().positive(), generatedAt: z.iso.datetime()
});
export const lowStockReportSchema = z.object({
  items: z.array(z.object({ ...reportProduct, reorderPoint: z.number().int().nonnegative() })),
  total: z.number().int().nonnegative(), outOfStock: z.number().int().nonnegative(),
  page: z.number().int().positive(), pageSize: z.number().int().positive(), generatedAt: z.iso.datetime()
});
export const movementTotalsSchema = z.object({
  opening: countString, sales: countString, purchases: countString, adjustmentIn: countString, adjustmentOut: countString,
  transferIn: countString, transferOut: countString, incoming: countString, outgoing: countString, net: signedCountString, movementCount: countString
});
export const movementReportSchema = z.object({
  startDate: z.iso.date(), endDate: z.iso.date(), timeZone: z.literal("Africa/Lagos"),
  days: z.array(movementTotalsSchema.extend({ date: z.iso.date() })).length(14),
  totals: movementTotalsSchema, generatedAt: z.iso.datetime()
});
export type MovementReport = z.infer<typeof movementReportSchema>;
