"use client";

import { copyText } from "@/lib/copyText";

// Unified share behaviour for the result cards. On a touch device we hand the
// PNG + text (which INCLUDES the shareable link) to the native share sheet so a
// player can post it anywhere in one tap. On desktop — or if the native sheet
// is unavailable / rejects — we copy the link and let the caller show its
// download/copy overlay.
//
// CRITICAL: the caller must precompute `blob` BEFORE the click and call this
// directly from the gesture. Any `await` before presentShare (e.g. building the
// PNG inside the handler) burns iOS Safari's transient activation and the share
// silently fails.

interface ShareArgs {
  blob: Blob | null;
  filename: string;
  text: string; // human message — MUST include the link so the share carries it
  link: string; // the URL alone, copied to the clipboard for the desktop path
}

function isUserCancel(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/**
 * Returns true if the share was handled natively (shared OR the user cancelled
 * the sheet) — the caller should do nothing more. Returns false when there was
 * no native share or it failed for a real reason; the caller should then show
 * its download/copy overlay. Either way the link is placed on the clipboard on
 * the non-native path.
 */
export async function presentShare({ blob, filename, text, link }: ShareArgs): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const touchPrimary =
    typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const file = blob ? new File([blob], filename, { type: "image/png" }) : null;

  if (touchPrimary && nav.share) {
    // Share the image when we have one the platform accepts; otherwise share
    // text + link only (e.g. the "challenge friends" invite has no card). Some
    // targets keep the image but drop `url`, so the link also lives in `text`.
    const canShareFile = !!file && !!nav.canShare?.({ files: [file] });
    try {
      await nav.share(
        canShareFile
          ? { files: [file as File], text, url: link, title: "82-0+" }
          : { text, url: link, title: "82-0+" },
      );
      return true;
    } catch (err) {
      // User dismissed the sheet → handled, don't pop the overlay on top of it.
      if (isUserCancel(err)) return true;
      // NotAllowedError / TypeError / anything else is a real failure: fall
      // through to the clipboard + overlay path below.
    }
  }

  // Desktop / no file share / native failed: copy the link and tell the caller
  // to show the image overlay (download + copy).
  await copyText(link);
  return false;
}
