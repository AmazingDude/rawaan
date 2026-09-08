import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { SessionCacheBoundary } from "@/app/components/session-cache-boundary";

import "./globals.css";

const onest = localFont({
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
  src: "./fonts/onest-variable.ttf",
  variable: "--font-onest",
  weight: "400 700",
});

const thestralNeue = localFont({
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
  src: "./fonts/thestral-neue-bold.woff2",
  variable: "--font-thestral-neue",
  weight: "700",
});

export const metadata: Metadata = {
  description:
    "Clinical documentation and patient history recall, with clinician-reviewed notes and source-backed answers.",
  title: "Rawaan | Patient Context Engine",
};

export const viewport: Viewport = {
  initialScale: 1,
  viewportFit: "cover",
  width: "device-width",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${onest.variable} ${thestralNeue.variable}`}>
        <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" signInFallbackRedirectUrl="/record" signUpFallbackRedirectUrl="/record"><SessionCacheBoundary />{children}</ClerkProvider>
      </body>
    </html>
  );
}
