import type { Metadata } from "next";
import { Space_Mono, Inter } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

// Aeonik Mono is the real brand face; Space Mono is the documented fallback.
const display = Space_Mono({
  variable: "--font-display",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "82-0+ · Build an undefeated season",
  description:
    "Draft a 5-man roster across the decades and see if it can go 82-0. Powered by MotherDuck Game Quality.",
  openGraph: {
    title: "82-0+ · Can you build the perfect season?",
    description:
      "New challenges daily. Draft a 5-man roster across the decades and see if it can go 82-0.",
    type: "website",
    siteName: "82-0+",
    images: [
      {
        url: "/api/og?v=home",
        width: 1200,
        height: 630,
        alt: "82-0+ · Build an undefeated season — new challenges daily",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "82-0+ · Can you build the perfect season?",
    description:
      "New challenges daily. Draft a 5-man roster across the decades and see if it can go 82-0.",
    images: ["/api/og?v=home"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
