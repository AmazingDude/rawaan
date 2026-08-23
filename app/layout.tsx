import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
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
      <body className={dmSans.variable}>{children}</body>
    </html>
  );
}
