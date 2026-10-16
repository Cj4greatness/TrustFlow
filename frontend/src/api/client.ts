// Typed HTTP client for the TrustFlow API (browser side).
//
// - Attaches the in-memory access token as a Bearer header; no cookies.
// - On 401: refresh once (shared across concurrent callers by the session
//   manager) and replay the request once. A 401 means the request never
//   executed, so the replay cannot duplicate a write. A second 401 is thrown.
// - Never retries network errors or 5xx: for those the outcome is unknown.
// - Never logs tokens or bodies.
// - Failures become ApiError (see errors.ts). Aborts are rethrown untouched.

import { ApiError, networkError, normalizeErrorResponse } from "./errors";

export type QueryValue = string | number | boolean | undefined;

export type RequestOptions = {
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
};

export type ApiClientOptions = {
  baseUrl: string;
  getAccessToken: () => string | null;
  refreshSession: () => Promise<{ accessToken: string }>;
  fetchFn?: typeof fetch;
};

export function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, QueryValue>,
): string {
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with "/": ${path}`);
  }
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.append(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export function createApiClient(options: ApiClientOptions) {
  const { baseUrl, getAccessToken, refreshSession } = options;
  const fetchFn: typeof fetch =
    options.fetchFn ?? ((input, init) => fetch(input, init));

  async function send(
    method: string,
    path: string,
    requestOptions: RequestOptions,
    token: string | null,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (requestOptions.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      return await fetchFn(buildUrl(baseUrl, path, requestOptions.query), {
        method,
        headers,
        body:
          requestOptions.body === undefined
            ? undefined
            : JSON.stringify(requestOptions.body),
        signal: requestOptions.signal,
        cache: "no-store",
        credentials: "omit",
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw networkError();
    }
  }

  async function handle<T>(response: Response): Promise<T> {
    const text = await response.text();
    let body: unknown;
    let parseFailed = false;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        parseFailed = true;
      }
    }

    if (!response.ok) {
      throw normalizeErrorResponse(
        response.status,
        parseFailed ? null : body,
        response.headers,
      );
    }
    if (parseFailed) {
      throw new ApiError({ kind: "unknown", status: response.status });
    }
    return body as T;
  }

  async function request<T>(
    method: string,
    path: string,
    requestOptions: RequestOptions = {},
  ): Promise<T> {
    let response = await send(method, path, requestOptions, getAccessToken());

    if (response.status === 401) {
      const refreshed = await refreshSession();
      response = await send(
        method,
        path,
        requestOptions,
        refreshed.accessToken,
      );
    }

    return handle<T>(response);
  }

  return {
    request,
    get: <T>(path: string, o?: Omit<RequestOptions, "body">) =>
      request<T>("GET", path, o),
    post: <T>(path: string, o?: RequestOptions) => request<T>("POST", path, o),
    patch: <T>(path: string, o?: RequestOptions) =>
      request<T>("PATCH", path, o),
    delete: <T>(path: string, o?: RequestOptions) =>
      request<T>("DELETE", path, o),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
