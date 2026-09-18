import { apiErrorSchema, categoryListSchema, type Category } from "@ims/contracts";

export type ResponseSchema<T> = { parse(value: unknown): T };
export class RequestError extends Error {
  constructor(message: string, public fields: Record<string, string> = {}, options?: ErrorOptions) { super(message, options); }
}

export async function requestJson<T>(url: string, schema: ResponseSchema<T>, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options, cache: "no-store",
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
  });
  let body: unknown;
  try { body = await response.json(); }
  catch (error) { throw new RequestError("The server returned an unreadable response. Please try again.", {}, { cause: error }); }
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new RequestError(parsed.success ? parsed.data.error.message : `Request failed (HTTP ${response.status}).`, parsed.success ? parsed.data.error.fields : {});
  }
  return schema.parse(body);
}

export function errorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") return "The request took too long. Please try again.";
  if (error instanceof TypeError) return "Could not reach the server. Check your connection and try again.";
  return error instanceof RequestError ? error.message : "Something went wrong. Please try again.";
}

// Select menus need every category; each HTTP request remains bounded to 100 rows.
export async function getCategoryOptions(signal: AbortSignal): Promise<Category[]> {
  const items: Category[] = [];
  for (let page = 1; ; page++) {
    const result = await requestJson(`/api/categories?pageSize=100&page=${page}`, categoryListSchema, { signal });
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) return items;
  }
}
