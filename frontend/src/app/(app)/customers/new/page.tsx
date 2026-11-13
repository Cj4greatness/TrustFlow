import type { Metadata } from "next";
import { NewCustomerView } from "@/components/customers/new-customer-view";

export const metadata: Metadata = { title: "Add customer | TrustFlow" };

export default function NewCustomerPage() {
  return <NewCustomerView />;
}
