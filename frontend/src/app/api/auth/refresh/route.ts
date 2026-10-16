import type { NextRequest } from "next/server";
import { handleRefresh } from "@/lib/auth/bff-handlers";

export async function POST(request: NextRequest) {
  return handleRefresh(request);
}
