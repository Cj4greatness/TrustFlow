import type { ReactNode } from "react";
import { AppGate } from "@/components/app/app-gate";
import { OrgProvider } from "@/components/app/org-provider";

// Everything under this folder is the signed-in app. The organization is
// loaded here, so it only starts once a page in this area is opened.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <AppGate>{children}</AppGate>
    </OrgProvider>
  );
}
