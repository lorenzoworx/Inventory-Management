import type { ErrorRequestHandler } from "express";
import type { ApiError } from "@ims/contracts";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

// Compatible with shared Zod schemas without coupling HTTP handling to a particular schema.
export function parseInput<T>(schema: {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] } };
}, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  throw new HttpError(400, "VALIDATION_ERROR", "Check the supplied fields.", fields);
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (response.headersSent) { _next(error); return; }
  let problem = error instanceof HttpError ? error : undefined;
  const details = error && typeof error === "object" ? error as { code?: string; constraint?: string; type?: string } : {};
  if (details.code === "23505") {
    const field = details.constraint === "products_sku_key" ? "sku"
      : details.constraint === "products_barcode_key" ? "barcode" : "name";
    const message = field === "name" ? "A category with this name already exists." : `A product with this ${field === "sku" ? "SKU" : "barcode"} already exists.`;
    problem = new HttpError(409, "CONFLICT", message, { [field]: message });
  } else if (details.code === "23503") {
    problem = new HttpError(400, "INVALID_CATEGORY", "Choose an existing category.", { categoryId: "This category no longer exists." });
  } else if (details.type === "entity.parse.failed") {
    problem = new HttpError(400, "INVALID_JSON", "The request body must be valid JSON.");
  } else if (details.type === "entity.too.large") {
    problem = new HttpError(413, "BODY_TOO_LARGE", "The request body is too large.");
  }
  if (!problem) {
    console.error("Unhandled API error:", error);
    problem = new HttpError(500, "INTERNAL_ERROR", "The request could not be completed. Try again shortly.");
  }
  const body: ApiError = { error: { code: problem.code, message: problem.message, ...(problem.fields && { fields: problem.fields }) } };
  response.status(problem.status).json(body);
};
