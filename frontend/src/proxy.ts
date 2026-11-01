import { NextResponse, type NextRequest } from "next/server";
import { getSecurityConfig } from "@/lib/config";
import {
  apiOriginFrom,
  buildCsp,
  cspHeaderName,
  generateNonce,
} from "@/lib/security/csp";

// Sets a per-request nonce and a Content-Security-Policy.
//
// The mode comes from CSP_MODE. "report-only" (the default while the policy is
// being verified) shows violations in the browser console and blocks nothing;
// "enforce" blocks them. The policy string is identical in both modes and only
// the header name changes. Production must run in enforce mode (see
// docs/frontend-session-design.md section 8).
export function proxy(request: NextRequest) {
  const { isDevelopment, apiUrl, cspMode } = getSecurityConfig();
  const nonce = generateNonce();
  const policy = buildCsp({
    nonce,
    apiOrigin: apiOriginFrom(apiUrl),
    isDevelopment,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads the nonce from the request's Content-Security-Policy header
  // and applies it to the scripts it renders. This header never reaches the
  // browser; the response header below is what the browser sees.
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(cspHeaderName(cspMode), policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Skip the BFF routes, Next.js internals, and static files.
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
