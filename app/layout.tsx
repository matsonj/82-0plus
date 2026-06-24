import type { Metadata, Viewport } from "next";
import {
  Anton,
  Archivo,
  Oswald,
  Space_Mono,
  Space_Grotesk,
  Special_Elite,
  Permanent_Marker,
} from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

// SLAM editorial type stack — seven voices. Each exposes a CSS variable that
// app/globals.css maps onto the --font-* tokens
// (cover/display/cond/mono/sans/byline/marker).
const anton = Anton({
  variable: "--font-anton", // cover-line / hero display
  weight: "400",
  subsets: ["latin"],
});
const archivo = Archivo({
  variable: "--font-archivo", // multi-width display: wordmark, headlines, scores
  subsets: ["latin"],
  axes: ["wdth"], // variable wght (default) + width axis (62–125)
});
const oswald = Oswald({
  variable: "--font-oswald", // labels, buttons, nav, headings
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});
const spaceMono = Space_Mono({
  variable: "--font-space-mono", // ALL data / numbers (tabular)
  weight: ["400", "700"],
  subsets: ["latin"],
});
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk", // body copy
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});
const specialElite = Special_Elite({
  variable: "--font-special-elite", // folios / datelines / meta
  weight: "400",
  subsets: ["latin"],
});
const permanentMarker = Permanent_Marker({
  variable: "--font-permanent-marker", // marker scrawl (rationed)
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "daily82 · Go undefeated",
  description:
    "Draft a 5-man roster across the decades and see if it can go undefeated. Powered by MotherDuck Game Quality.",
  openGraph: {
    title: "daily82 · Can you build the perfect season?",
    description:
      "New challenges daily. Draft a 5-man roster across the decades and see if it can go undefeated.",
    type: "website",
    siteName: "daily82",
    images: [
      {
        url: "/api/og?v=home",
        width: 1200,
        height: 630,
        alt: "daily82 · Build an undefeated season — new challenges daily",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "daily82 · Can you build the perfect season?",
    description:
      "New challenges daily. Draft a 5-man roster across the decades and see if it can go undefeated.",
    images: ["/api/og?v=home"],
  },
};

// Tints the mobile browser address bar / installed-app status bar with the SLAM
// flame, matching the manifest theme_color (see app/manifest.ts).
export const viewport: Viewport = {
  themeColor: "#E5261F",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${archivo.variable} ${oswald.variable} ${spaceMono.variable} ${spaceGrotesk.variable} ${specialElite.variable} ${permanentMarker.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
