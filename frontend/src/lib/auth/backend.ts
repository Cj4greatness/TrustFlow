// The BFF's only way to reach the backend. It is deliberately not generic:
// callers pass a fixed path from this codebase, never a path from a request.

import { getServerConfig } from "../config";

export type BackendResult = {
  ok: boolean;
  status: number;
  body: unknown;
  headers: Headers;
};

const TIMEOUT_MS = 10_000;

/** POSTs JSON to the backend. Returns null if the backend was unreachable. */
export async function callBackend(
  path: string,
  init: { body?: unknown; authorization?: string | null } = {},
): Promise<BackendResult | null> {
  const { backendUrl } = getServerConfig();

  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.authorization) headers.Authorization = init.authorization;

  try {
    const response = await fetch(`${backendUrl}${path}`, {
      method: "POST",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return {
      ok: response.ok,
      status: response.status,
      body,
      headers: response.headers,
    };
  } catch {
    return null;
  }
}
