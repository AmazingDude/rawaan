import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

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
    "A clinician-controlled patient context engine for fictional demo consultations.",
  title: "Rawaan | Patient Context Engine",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${onest.variable} ${thestralNeue.variable}`}>{children}</body>
    </html>
  );
}
