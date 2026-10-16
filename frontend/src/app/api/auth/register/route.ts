import type { NextRequest } from "next/server";
import { handleCredentials } from "@/lib/auth/bff-handlers";

export async function POST(request: NextRequest) {
  return handleCredentials(request, {
    backendPath: "/auth/register",
    allowedFields: ["firstName", "lastName", "email", "password", "phone"],
    successStatus: 201,
  });
}
