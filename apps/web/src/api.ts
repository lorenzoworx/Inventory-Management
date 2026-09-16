import { healthResponseSchema, type HealthResponse } from "@ims/contracts";

export async function getHealth(signal: AbortSignal): Promise<HealthResponse> {
  const response = await fetch("/api/health", { signal, cache: "no-store" });

  // fetch rejects network failures, but an HTTP 500 still resolves normally.
  if (!response.ok) {
    throw new Error(`The API returned HTTP ${response.status}. Try again shortly.`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("The API did not return valid JSON.", { cause: error });
    }
    throw error;
  }
  const result = healthResponseSchema.safeParse(body);
  if (!result.success) {
    throw new Error("The API response did not match the expected format.");
  }

  return result.data;
}
