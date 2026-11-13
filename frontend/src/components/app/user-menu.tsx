"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";

/** The signed-in person in the top bar. Sign out lives inside the menu. */
export function UserMenu({
  firstName,
  role,
}: {
  firstName: string;
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!firstName) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
        >
          {firstName.charAt(0).toUpperCase()}
        </span>
        <span className="hidden text-sm font-medium sm:inline">
          {firstName}
        </span>
        <ChevronDown
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border border-border bg-card p-3 shadow-lg">
          <p className="truncate text-sm font-semibold">{firstName}</p>
          {role ? (
            <p className="text-xs text-muted-foreground">{role}</p>
          ) : null}
          <div className="mt-3 border-t border-border pt-3 [&>div]:items-stretch [&_button]:w-full">
            <SignOutButton />
          </div>
        </div>
      ) : null}
    </div>
  );
}
