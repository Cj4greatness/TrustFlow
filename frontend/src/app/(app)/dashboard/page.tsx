import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard | TrustFlow" };

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-muted-foreground">
        The overview for your organization will appear here.
      </p>
    </div>
  );
}
