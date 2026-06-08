"use client";

// Unified share behaviour for the result cards. On a touch device we hand the
// PNG + text (which INCLUDES the shareable link) to the native share sheet so a
// player can post it anywhere in one tap. On desktop we fall through to the
// caller's download/copy overlay. Either way the link is on the clipboard.

interface ShareArgs {
  blob: Blob | null;
  filename: string;
  text: string; // human message — MUST include the link so the share carries it
  link: string; // the URL alone, copied to the clipboard for the desktop path
}

/**
 * Returns true if the native share sheet handled it (mobile). Returns false on
 * desktop / unsupported — the caller should then show its download overlay. The
 * link is copied to the clipboard on the desktop path.
 */
export async function presentShare({ blob, filename, text, link }: ShareArgs): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const touchPrimary =
    typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const file = blob ? new File([blob], filename, { type: "image/png" }) : null;

  if (touchPrimary && file && nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], text, title: "82-0+" });
      return true;
    } catch {
      // user dismissed the sheet — treat as handled (don't pop the desktop overlay)
      return true;
    }
  }

  // Desktop / no file share: quietly put the link on the clipboard; caller shows
  // the image overlay (download + copy).
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    /* clipboard blocked */
  }
  return false;
}
