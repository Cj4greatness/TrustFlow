import type { Metadata } from "next";
import { EditCustomerView } from "@/components/customers/edit-customer-view";

export const metadata: Metadata = { title: "Edit customer | TrustFlow" };

export default function EditCustomerPage() {
  return <EditCustomerView />;
}
