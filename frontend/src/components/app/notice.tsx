import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A calm, informational notice for the app area (not for form errors). */
export function Notice({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground",
        className,
      )}
    >
      <Info
        className="mt-0.5 size-4 shrink-0 text-primary"
        aria-hidden="true"
      />
      <div>{children}</div>
    </div>
  );
}
