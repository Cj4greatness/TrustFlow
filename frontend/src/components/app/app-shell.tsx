"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { iconFor } from "@/components/app/nav-icons";
import { useOrg } from "@/components/app/org-provider";
import {
  hasOrganizationChoice,
  OrgSwitcher,
} from "@/components/app/org-switcher";
import { useAuth } from "@/components/auth/auth-provider";
import { FormAlert } from "@/components/auth/form-alert";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { visibleNavigation, type NavSection } from "@/lib/app/navigation";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarHeader({ name }: { name: string }) {
  return (
    <div className="px-3">
      <p className="text-lg font-semibold text-primary">TrustFlow</p>
      <p className="truncate text-xs text-muted-foreground">{name}</p>
    </div>
  );
}

function SidebarNav({
  sections,
  pathname,
  onNavigate,
}: {
  sections: readonly NavSection[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-1">
          <p className="px-3 text-xs font-medium text-muted-foreground">
            {section.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const Icon = iconFor(item.id);
              const base =
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm";
              if (!item.ready) {
                return (
                  <li key={item.id}>
                    <span
                      aria-disabled="true"
                      className={cn(
                        base,
                        "cursor-not-allowed text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="flex-1">{item.label}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                        Soon
                      </span>
                    </span>
                  </li>
                );
              }
              const active = isActive(pathname, item.href);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      base,
                      "font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({
  banner,
  children,
}: {
  banner: "setup" | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { state: auth } = useAuth();
  const { state: org } = useOrg();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  // The gate only renders the shell for a ready organization; this is a guard.
  if (org.status !== "ready") return null;

  const sections = visibleNavigation(org.role, { includePlanned: true });
  const firstName = auth.status === "authenticated" ? auth.user.firstName : "";
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border bg-card p-4 md:sticky md:top-0 md:flex md:h-screen">
        <SidebarHeader name={org.organization.name} />
        <SidebarNav
          sections={sections}
          pathname={pathname}
          onNavigate={closeMenu}
        />
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={closeMenu}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col gap-6 overflow-y-auto bg-card p-4 shadow-lg"
          >
            <div className="flex items-start justify-between gap-2">
              <SidebarHeader name={org.organization.name} />
              <button
                type="button"
                aria-label="Close menu"
                onClick={closeMenu}
                className="rounded-md p-1.5 hover:bg-muted"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <SidebarNav
              sections={sections}
              pathname={pathname}
              onNavigate={closeMenu}
            />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="rounded-md p-1.5 hover:bg-muted md:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          {hasOrganizationChoice(org.organizations) ? (
            <OrgSwitcher />
          ) : (
            <span className="truncate text-sm font-medium md:hidden">
              {org.organization.name}
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            {firstName ? (
              <span className="hidden text-sm sm:inline">{firstName}</span>
            ) : null}
            <SignOutButton />
          </div>
        </header>
        {banner === "setup" ? (
          <div className="px-4 pt-4 md:px-6">
            <FormAlert variant="info">
              Your organization is still being set up.
            </FormAlert>
          </div>
        ) : null}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
