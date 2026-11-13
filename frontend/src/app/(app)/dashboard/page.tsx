import type { Metadata } from "next";
import { EmptyState } from "@/components/app/states";
import { PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Dashboard | TrustFlow" };

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Here is an overview of your organization."
      />
      <EmptyState
        title="No figures to show yet"
        description="Revenue, orders and stock alerts will appear here once they are connected to your organization."
      />
    </div>
  );
}
