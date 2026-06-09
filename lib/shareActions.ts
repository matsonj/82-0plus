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

// What actually happened, so callers only ever claim success on a real share or
// copy — never when the clipboard was blocked.
//   "shared"    — the native share sheet accepted it
//   "cancelled" — the user dismissed the native sheet (do nothing)
//   "copied"    — fell back to clipboard and the copy succeeded
//   "failed"    — fell back to clipboard and every copy path failed
export type ShareOutcome = "shared" | "cancelled" | "copied" | "failed";

/**
 * Tries the native share sheet first (image+link on touch, else text+link),
 * then falls back to copying the link. The caller should show its download/copy
 * overlay on "copied"/"failed", do nothing on "shared"/"cancelled", and only
 * claim success ("Shared!"/"Copied!") on "shared"/"copied".
 */
export async function presentShare({ blob, filename, text, link }: ShareArgs): Promise<ShareOutcome> {
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
      return "shared";
    } catch (err) {
      // User dismissed the sheet → don't pop the overlay on top of it.
      if (isUserCancel(err)) return "cancelled";
      // NotAllowedError / TypeError / anything else is a real failure: fall
      // through to the clipboard + overlay path below.
    }
  }

  // Desktop / no file share / native failed: copy the link and tell the caller
  // to show the image overlay (download + copy).
  return (await copyText(link)) ? "copied" : "failed";
}
