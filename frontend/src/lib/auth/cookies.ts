// Refresh-token cookie policy. The path limits the cookie to the BFF auth
// routes so it is never attached to any other request. The backend remains
// the authority on token expiry: maxAge only bounds how long the browser
// keeps the cookie (7 days, matching JWT_REFRESH_EXPIRES_IN in the backend
// env example).

export const REFRESH_COOKIE_NAME = "tf_refresh";
export const REFRESH_COOKIE_PATH = "/api/auth";
export const REFRESH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export type RefreshCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  path: string;
  maxAge: number;
};

export function refreshCookieOptions(
  isProduction: boolean,
): RefreshCookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  };
}

export function clearedRefreshCookieOptions(
  isProduction: boolean,
): RefreshCookieOptions {
  return { ...refreshCookieOptions(isProduction), maxAge: 0 };
}
