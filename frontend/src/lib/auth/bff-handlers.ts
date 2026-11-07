// Request handlers for the four BFF auth routes. Not a general proxy: each
// handler calls one fixed backend endpoint.

import { NextRequest, NextResponse } from "next/server";
import { AUTH_ERROR_CODES } from "../../api/errors";
import { getServerConfig } from "../config";
import { classifyRefreshFailure, logAuthEvent } from "./auth-log";
import { callBackend } from "./backend";
import {
  forwardedRateLimitHeaders,
  pickFields,
  sanitizeErrorBody,
  splitAuthResponse,
  type BackendAuthSuccess,
} from "./bff-helpers";
import {
  clearedRefreshCookieOptions,
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
} from "./cookies";
import { checkCsrf } from "./csrf";

const NO_STORE = { "Cache-Control": "no-store" };

function errorJson(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(sanitizeErrorBody(status, body), {
    status,
    headers: { ...NO_STORE, ...extraHeaders },
  });
}

const blocked = () => errorJson(403, { message: "Request blocked." });
const unreachable = () =>
  errorJson(502, {
    message: "Could not reach the TrustFlow service. Please try again.",
  });

function sessionResponse(
  parsed: BackendAuthSuccess,
  status: number,
  isProduction: boolean,
): NextResponse {
  const response = NextResponse.json(parsed.session, {
    status,
    headers: NO_STORE,
  });
  response.cookies.set(
    REFRESH_COOKIE_NAME,
    parsed.refreshToken,
    refreshCookieOptions(isProduction),
  );
  return response;
}

export async function handleCredentials(
  request: NextRequest,
  options: {
    backendPath: string;
    allowedFields: readonly string[];
    successStatus: number;
  },
): Promise<NextResponse> {
  if (!checkCsrf(request.headers).ok) return blocked();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorJson(400, { message: "Invalid request body." });
  }

  const { isProduction } = getServerConfig();
  const result = await callBackend(options.backendPath, {
    body: pickFields(payload, options.allowedFields),
  });
  if (!result) return unreachable();
  if (!result.ok) {
    return errorJson(
      result.status,
      result.body,
      forwardedRateLimitHeaders(result.headers),
    );
  }

  const parsed = splitAuthResponse(result.body);
  if (!parsed) return unreachable();
  return sessionResponse(parsed, options.successStatus, isProduction);
}

export async function handleRefresh(
  request: NextRequest,
): Promise<NextResponse> {
  if (!checkCsrf(request.headers).ok) return blocked();

  const { isProduction } = getServerConfig();
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
  if (!refreshToken) {
    return errorJson(401, {
      message: "Not signed in.",
      details: { code: AUTH_ERROR_CODES.NO_SESSION },
    });
  }

  const result = await callBackend("/auth/refresh", {
    body: { refreshToken },
  });
  if (!result) {
    logAuthEvent({ event: "refresh_backend_unreachable" });
    return unreachable();
  }

  if (!result.ok) {
    const response = errorJson(
      result.status,
      result.body,
      forwardedRateLimitHeaders(result.headers),
    );
    const code = sanitizeErrorBody(result.status, result.body).details?.code;
    const lostRace = code === AUTH_ERROR_CODES.REFRESH_TOKEN_RECENTLY_ROTATED;
    logAuthEvent({
      event: classifyRefreshFailure(result.status, code),
      status: result.status,
      code,
    });
    // Only a definitive "this session is dead" clears the cookie. Losing a
    // rotation race, throttling, or a server error must leave it alone.
    if (result.status === 401 && !lostRace) {
      response.cookies.set(
        REFRESH_COOKIE_NAME,
        "",
        clearedRefreshCookieOptions(isProduction),
      );
    }
    return response;
  }

  const parsed = splitAuthResponse(result.body);
  if (!parsed) {
    logAuthEvent({
      event: "refresh_invalid_backend_response",
      status: result.status,
    });
    return unreachable();
  }
  return sessionResponse(parsed, 200, isProduction);
}

export async function handleLogout(
  request: NextRequest,
): Promise<NextResponse> {
  if (!checkCsrf(request.headers).ok) return blocked();

  const { isProduction } = getServerConfig();
  const authorization = request.headers.get("authorization");

  let backendSessionEnded = false;
  if (authorization) {
    const result = await callBackend("/auth/logout", { authorization });
    backendSessionEnded = result?.ok === true;
  }

  // The user asked to sign out, so the cookie is cleared regardless. The flag
  // tells the client honestly whether the backend session was invalidated.
  const response = NextResponse.json(
    { backendSessionEnded },
    { headers: NO_STORE },
  );
  response.cookies.set(
    REFRESH_COOKIE_NAME,
    "",
    clearedRefreshCookieOptions(isProduction),
  );
  return response;
}
