import type { MetadataRoute } from "next";

// PWA web app manifest — makes daily82 installable ("Add to Home Screen" /
// desktop install) so it launches standalone next to Wordle et al. The favicon
// (app/icon.svg, app/apple-icon.png, app/favicon.ico) covers browser tabs; this
// covers the home-screen tile. Palette is the SLAM ground/flame (see globals.css:
// --md-paper #EDE7D8, --md-coral #E5261F). OG/social cards are handled separately
// by /api/og, so no images are declared here.
//
// Icons live in /public (generated from the Spot Block mark):
//   icon-{192,512}.png           full Spot Block mark, purpose "any"
//   icon-maskable-{192,512}.png  full-bleed flame ground, purpose "maskable"
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "daily82 · Go undefeated",
    short_name: "daily82",
    description:
      "Draft a 5-man roster across the decades and see if it can go undefeated. Powered by MotherDuck Game Quality.",
    start_url: "/",
    display: "standalone",
    background_color: "#EDE7D8",
    theme_color: "#E5261F",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
