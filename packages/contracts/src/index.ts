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

export const movementKindSchema = z.enum(["OPENING", "SALE", "ADJUSTMENT"]);
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
