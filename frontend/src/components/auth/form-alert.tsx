import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FormAlertProps = {
  variant?: "error" | "info";
  children: ReactNode;
  className?: string;
};

/** Errors are announced immediately; informational notices politely. */
export function FormAlert({
  variant = "error",
  children,
  className,
}: FormAlertProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        variant === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
