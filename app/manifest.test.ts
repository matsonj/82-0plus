import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import manifest from "./manifest";

// Guards the PWA manifest (#63): the field set + icon assets that make daily82
// installable ("Add to Home Screen" with no Chrome installability errors). Pure
// + offline — reads the manifest object and the committed /public icons, no DB
// or dev server. SLAM palette: --md-paper #EDE7D8 ground, --md-coral #E5261F.
const m = manifest();
const PUBLIC = join(process.cwd(), "public");

describe("PWA manifest (#63)", () => {
  it("declares the fields a browser needs to treat it as installable", () => {
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBe("daily82");
    expect(m.start_url).toBe("/");
    // Must be a standalone-class display mode or Chrome won't offer install.
    expect(["standalone", "fullscreen", "minimal-ui"]).toContain(m.display);
    expect(m.background_color).toBe("#EDE7D8");
    expect(m.theme_color).toBe("#E5261F");
  });

  it("offers 192 and 512 icons in both 'any' and 'maskable' purposes", () => {
    const icons = m.icons ?? [];
    const has = (sizes: string, purpose: string) =>
      icons.some((i) => i.sizes === sizes && i.purpose === purpose);
    expect(has("192x192", "any")).toBe(true);
    expect(has("512x512", "any")).toBe(true);
    expect(has("192x192", "maskable")).toBe(true);
    expect(has("512x512", "maskable")).toBe(true);
  });

  it("every declared icon file exists in /public at its declared size", async () => {
    for (const icon of m.icons ?? []) {
      const file = join(PUBLIC, icon.src.replace(/^\//, ""));
      expect(() => readFileSync(file), `${icon.src} should exist`).not.toThrow();
      const [w, h] = icon.sizes.split("x").map(Number);
      const meta = await sharp(file).metadata();
      expect(meta.width, `${icon.src} width`).toBe(w);
      expect(meta.height, `${icon.src} height`).toBe(h);
      expect(meta.format).toBe("png");
    }
  });

  it("maskable icons are full-bleed (fully opaque) so the safe-zone mask can't clip transparent corners", async () => {
    const maskable = (m.icons ?? []).filter((i) => i.purpose === "maskable");
    expect(maskable.length).toBeGreaterThan(0);
    for (const icon of maskable) {
      const file = join(PUBLIC, icon.src.replace(/^\//, ""));
      const stats = await sharp(file).stats();
      // RGBA PNG: the alpha channel is the 4th. Fully opaque ⇒ min alpha 255.
      const alpha = stats.channels[3];
      expect(alpha, `${icon.src} should have an alpha channel`).toBeDefined();
      expect(alpha.min, `${icon.src} should have no transparent pixels`).toBe(
        255,
      );
    }
  });
});
