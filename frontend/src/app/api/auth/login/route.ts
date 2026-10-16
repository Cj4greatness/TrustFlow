import type { NextRequest } from "next/server";
import { handleCredentials } from "@/lib/auth/bff-handlers";

export async function POST(request: NextRequest) {
  return handleCredentials(request, {
    backendPath: "/auth/login",
    allowedFields: ["email", "password"],
    successStatus: 200,
  });
}
