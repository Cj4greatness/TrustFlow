import type { ReactNode } from "react";

// Shared shell for the sign-in and registration screens.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
        <p className="mb-6 text-center text-lg font-semibold text-primary">
          TrustFlow
        </p>
        {children}
      </div>
    </main>
  );
}
