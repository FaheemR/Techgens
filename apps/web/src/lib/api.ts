import type { ApiErrorBody } from "@techgens/core";

/** Orchestrator base URL. The browser talks to it directly (CORS is enabled server-side). */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  /** True when the orchestrator could not be reached at all (network error, CORS, DNS…). */
  get unreachable(): boolean {
    return this.status === 0;
  }
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export function withQuery(path: string, params?: QueryParams): string {
  if (!params) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}${path.includes("?") ? "&" : "?"}${qs}` : path;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" && value !== null && typeof (value as { error?: unknown }).error === "string"
  );
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const init: RequestInit = { method, cache: "no-store", headers: { accept: "application/json" } };
  if (signal) init.signal = signal;
  if (body !== undefined) {
    init.headers = { accept: "application/json", "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(`Orchestrator unreachable at ${API_URL}`, 0, "unreachable");
  }

  if (!res.ok) {
    let message = `${res.status} ${res.statusText || "Request failed"}`;
    let code: string | undefined;
    try {
      const parsed: unknown = await res.json();
      if (isApiErrorBody(parsed)) {
        message = parsed.error;
        code = parsed.code;
      }
    } catch {
      // Non-JSON error body: keep the status line.
    }
    throw new ApiError(message, res.status, code);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("The orchestrator returned an invalid JSON response", res.status, "invalid_json");
  }
}

export const api = {
  get: <T>(path: string, params?: QueryParams, signal?: AbortSignal) =>
    request<T>("GET", withQuery(path, params), undefined, signal),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T = void>(path: string) => request<T>("DELETE", path),
};

export function isUnreachable(error: unknown): boolean {
  return error instanceof ApiError && error.unreachable;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong";
}
