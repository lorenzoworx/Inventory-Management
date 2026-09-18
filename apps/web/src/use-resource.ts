import { useCallback, useEffect, useState } from "react";
import type { Category } from "@ims/contracts";
import { errorMessage, getCategoryOptions, requestJson, type ResponseSchema } from "./catalog-api";

type Resource<T> = { phase: "loading" } | { phase: "ready"; data: T } | { phase: "error"; message: string };

export function useResource<T>(url: string, schema: ResponseSchema<T>) {
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const [state, setState] = useState<{ key: string; result: Resource<T> }>({ key: "", result: { phase: "loading" } });
  const key = `${url}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    void requestJson(url, schema, { signal: controller.signal }).then(
      (data) => { if (!controller.signal.aborted) setState({ key, result: { phase: "ready", data } }); },
      (error: unknown) => { if (!controller.signal.aborted) setState({ key, result: { phase: "error", message: errorMessage(error) } }); }
    );
    return () => controller.abort();
  }, [url, schema, key]);
  return { state: state.key === key ? state.result : { phase: "loading" } as const, reload };
}

export function useCategories() {
  const [state, setState] = useState<Resource<Category[]>>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ phase: "loading" });
    void getCategoryOptions(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setState({ phase: "ready", data }); },
      (error: unknown) => { if (!controller.signal.aborted) setState({ phase: "error", message: errorMessage(error) }); }
    );
    return () => controller.abort();
  }, [attempt]);
  return { state, reload: () => setAttempt((value) => value + 1) };
}
