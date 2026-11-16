import type { Metadata } from "next";
import { CustomerDetailView } from "@/components/customers/customer-detail-view";

export const metadata: Metadata = { title: "Customer | TrustFlow" };

export default function CustomerPage() {
  return <CustomerDetailView />;
}
