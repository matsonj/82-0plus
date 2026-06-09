"use client";

// Robust copy-to-clipboard that works on iOS Safari, where the plain
// `navigator.clipboard.writeText` path silently fails unless it runs inside a
// live user gesture. MUST be called directly from a click/tap handler — never
// after an `await` (a preceding await burns the gesture's transient activation
// and Safari rejects the write).
//
// Three tiers, best → legacy:
//   1. clipboard.write([ClipboardItem]) with a Promise-valued item. Passing a
//      Promise keeps the write() call itself synchronous within the gesture,
//      which is the only shape Safari reliably accepts.
//   2. clipboard.writeText (Chrome/Firefox, and Safari when the string is ready
//      up front with no prior await).
//   3. hidden <textarea> + execCommand("copy") for insecure contexts and old
//      WebViews that lack the async Clipboard API.
//
// Returns true only if a copy path actually succeeded — callers must not claim
// "Copied!" otherwise.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": Promise.resolve(new Blob([text], { type: "text/plain" })),
        }),
      ]);
      return true;
    }
  } catch {
    /* fall through */
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    document.body.appendChild(ta);
    // iOS needs an explicit range selection, not just .select().
    ta.contentEditable = "true";
    const range = document.createRange();
    range.selectNodeContents(ta);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
