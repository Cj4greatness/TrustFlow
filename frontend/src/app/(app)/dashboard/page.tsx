import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Dashboard | TrustFlow" };

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Here is an overview of your organization."
      />
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm font-medium">No figures to show yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Revenue, orders and stock alerts will appear here once they are
          connected to your organization.
        </p>
      </div>
    </div>
  );
}
