import { redirect } from "next/navigation";
import { AUTH_REDIRECT_PATH } from "@/lib/auth/auth-config";

// The app lives under the (app) route group. Signed-out visitors are sent to
// /login by the gate there, so the root only needs to forward.
export default function Home() {
  redirect(AUTH_REDIRECT_PATH);
}
