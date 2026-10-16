// Stateless CSRF protection for cookie-authenticated BFF endpoints. No server
// state, so it works across any number of instances.
//
// A request passes only if it carries the custom header (a cross-origin page
// cannot add it without a CORS preflight, which these routes never grant) AND
// it is provably same-origin. Browsers send Sec-Fetch-Site on modern versions;
// Origin is the fallback. If neither is present we refuse rather than guess.
// x-forwarded-host is honoured for proxied deployments (e.g. Cloud Run); a
// cross-site page cannot set it from a browser.

export const CSRF_HEADER = "x-trustflow-csrf";
export const CSRF_HEADER_VALUE = "1";

export type CsrfCheck = { ok: true } | { ok: false; reason: string };

const OK: CsrfCheck = { ok: true };
const fail = (reason: string): CsrfCheck => ({ ok: false, reason });

export function checkCsrf(headers: Headers): CsrfCheck {
  if (headers.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
    return fail("missing CSRF header");
  }

  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite !== null) {
    return fetchSite === "same-origin"
      ? OK
      : fail(`cross-site request (${fetchSite})`);
  }

  const origin = headers.get("origin");
  if (origin === null) return fail("cannot verify request origin");

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return fail("malformed origin");
  }

  const expectedHost = headers.get("x-forwarded-host") ?? headers.get("host");
  return expectedHost !== null && originHost === expectedHost
    ? OK
    : fail("origin mismatch");
}
