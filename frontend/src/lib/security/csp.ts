// Content-Security-Policy builder. Pure, so it can be unit tested.
//
// The access token lives in browser memory, so a strict CSP is the main
// protection against XSS. Scripts need the per-request nonce; 'strict-dynamic'
// lets nonced scripts load the chunks they need. Development relaxes two
// things Next.js requires (eval for React refresh, inline styles).
//
// upgrade-insecure-requests is deliberately not included: it would break
// `next start` over plain http on a developer machine. HTTPS and HSTS belong
// to the deployment, not this policy.

export type CspOptions = {
  nonce: string;
  /** Origin of the API the browser calls directly. Null if not configured. */
  apiOrigin: string | null;
  isDevelopment: boolean;
};

/** A fresh, unguessable nonce: 16 random bytes, base64 encoded. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** The origin part of an http(s) URL, or null if it is missing or invalid. */
export function apiOriginFrom(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function buildCsp({ nonce, apiOrigin, isDevelopment }: CspOptions) {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (isDevelopment) scriptSrc.push("'unsafe-eval'");

  const styleSrc = isDevelopment
    ? ["'self'", "'unsafe-inline'"]
    : ["'self'", `'nonce-${nonce}'`];

  const connectSrc = ["'self'"];
  if (apiOrigin) connectSrc.push(apiOrigin);

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", scriptSrc],
    ["style-src", styleSrc],
    ["img-src", ["'self'", "blob:", "data:"]],
    ["font-src", ["'self'"]],
    ["connect-src", connectSrc],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];

  return directives
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export type CspMode = "report-only" | "enforce";

/**
 * Reads CSP_MODE. Unset or empty keeps the default, report-only. Any other
 * value is treated as enforce, so a typo can only make the policy stricter,
 * never silently weaker.
 */
export function parseCspMode(value: string | null | undefined): CspMode {
  const mode = value?.trim().toLowerCase();
  if (!mode || mode === "report-only") return "report-only";
  return "enforce";
}

/** Report-only mode reports violations; enforce mode blocks them. */
export function cspHeaderName(mode: CspMode): string {
  return mode === "enforce"
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";
}
