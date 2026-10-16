import type { NextRequest } from "next/server";
import { handleLogout } from "@/lib/auth/bff-handlers";

export async function POST(request: NextRequest) {
  return handleLogout(request);
}
