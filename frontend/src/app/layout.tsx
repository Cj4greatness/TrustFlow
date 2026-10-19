import type { Metadata } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";

// Poppins is the TrustFlow brand typeface (initial direction; swap here only).
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrustFlow",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Opt into dynamic rendering. The CSP nonce is created per request in
  // src/proxy.ts, so pages cannot be prerendered ahead of time.
  await connection();

  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        poppins.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
