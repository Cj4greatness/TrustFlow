// Server-only configuration. This is the only module that reads process.env
// for the BFF; nothing here is exposed to the browser (no NEXT_PUBLIC_ vars).

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
