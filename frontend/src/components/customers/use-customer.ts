import { useEffect, useState } from "react";
import { isApiError } from "@/api/errors";
import { getBrowserAuth } from "@/lib/auth/browser";
import {
  customerPath,
  parseCustomer,
  type Customer,
} from "@/lib/customers/customers";

type Result =
  | { key: string; status: "ready"; customer: Customer }
  | { key: string; status: "not_found" }
  | { key: string; status: "error" };

export type CustomerState =
  | { status: "loading" }
  | { status: "ready"; customer: Customer }
  | { status: "not_found" }
  | { status: "error" };

// The result is remembered with the exact request it belongs to, which
// includes the organization id, so a record from another organization can
// never be shown after a switch.
export function useCustomer(
  enabled: boolean,
  organizationId: string,
  customerId: string,
  attempt: number,
): CustomerState {
  const path = customerPath(organizationId, customerId);
  const key = `${path}|${attempt}`;
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    getBrowserAuth()
      .api.get<unknown>(path, { signal: controller.signal })
      .then((json) => {
        if (controller.signal.aborted) return;
        const customer = parseCustomer(json);
        setResult(
          customer === null
            ? { key, status: "error" }
            : { key, status: "ready", customer },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          status:
            isApiError(error) && error.kind === "not_found"
              ? "not_found"
              : "error",
        });
      });
    return () => controller.abort();
  }, [enabled, key, path]);

  if (result === null || result.key !== key) return { status: "loading" };
  if (result.status === "ready") {
    return { status: "ready", customer: result.customer };
  }
  return { status: result.status };
}
