"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { breadcrumbsFor } from "@/lib/app/navigation";

/**
 * The header every page in the app uses: breadcrumbs, title, a short
 * description and an optional primary action. Keeping it in one place is what
 * makes the modules feel like one product. `current` names a page below a
 * section (for example "Add customer") so the breadcrumb can end on it.
 */
export function PageHeader({
  title,
  description,
  action,
  current,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  current?: string;
}) {
  const crumbs = breadcrumbsFor(usePathname(), current);
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <li key={crumb.label} className="flex items-center gap-1.5">
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {crumb.href && !last ? (
                  <Link href={crumb.href} className="hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    aria-current={last ? "page" : undefined}
                    className={last ? "text-foreground" : undefined}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
