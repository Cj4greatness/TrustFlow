// Server-only configuration. This is the only module that reads process.env
// for the BFF; nothing here is exposed to the browser (no NEXT_PUBLIC_ vars).

import { parseCspMode, type CspMode } from "./security/csp";

export type ServerConfig = {
  backendUrl: string;
  isProduction: boolean;
};

export function getServerConfig(): ServerConfig {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    throw new Error(
      "BACKEND_URL is not set. Add it to frontend/.env.local (see .env.local.example).",
    );
  }
  return {
    backendUrl: backendUrl.replace(/\/+$/, ""),
    isProduction: process.env.NODE_ENV === "production",
  };
}

export type SecurityConfig = {
  isDevelopment: boolean;
  /** "report-only" (default) or "enforce", from CSP_MODE. */
  cspMode: CspMode;
  /** Public API URL the browser calls directly (backend CORS). Optional until the browser client exists. */
  apiUrl: string | undefined;
};

// Separate from getServerConfig on purpose: it does not require BACKEND_URL,
// so the proxy cannot fail every page request if that variable is missing.
export function getSecurityConfig(): SecurityConfig {
  return {
    isDevelopment: process.env.NODE_ENV === "development",
    cspMode: parseCspMode(process.env.CSP_MODE),
    apiUrl: process.env.NEXT_PUBLIC_API_URL || undefined,
  };
}
