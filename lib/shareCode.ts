// Compact, URL-safe encoding of a finished season so a shared link can render a
// rich preview (dynamic OG image) without re-simulating. Isomorphic: the client
// encodes, the OG route + share page decode. Game Quality is never included —
// only the already-public display fields shown on the result card.

export interface SharePayload {
  w: number; // wins
  l: number; // losses
  n: number; // net rating (one decimal preserved)
  p: boolean; // perfect season
  m: string; // mode label (e.g. "Classic", "Daily 2026-06-03")
  r: SharePlayer[]; // roster lines, in board order (empty for daily — no spoilers)
  u?: string; // sharer's account name (daily links — powers the head-to-head compare)
  // The sharer's daily-TOURNAMENT run, when they entered one. Its presence flips
  // the OG card to the tournament layout (reg-season + playoffs), so a shared
  // bracket link unfurls as a tournament card, not the plain daily card.
  tn?: { w: number; l: number; n: number; r: number }; // playoff w/l, realized margin, reached round
}

export interface SharePlayer {
  t: string; // team abbreviation
  s: number; // best season (full year)
  name: string;
  pts: number;
  reb: number;
  ast: number;
}

// Stored as a positional array to keep the URL short, then base64url-encoded.
type Packed = [
  number, // wins
  number, // losses
  number, // net * 10 (rounded, preserves one decimal)
  0 | 1, // perfect
  string, // label
  Array<[string, number, string, number, number, number]>,
  string?, // sharer name (optional, daily links)
  [number, number, number, number]?, // tournament: [w, l, n*10, reachedRound] (optional)
];

function toBase64Url(bytes: string): string {
  const b64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(bytes, "utf8").toString("base64")
      : btoa(unescape(encodeURIComponent(bytes)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof Buffer !== "undefined") {
    return Buffer.from(b64, "base64").toString("utf8");
  }
  return decodeURIComponent(escape(atob(b64)));
}

export function encodeShare(payload: SharePayload): string {
  const packed: Packed = [
    payload.w,
    payload.l,
    Math.round(payload.n * 10),
    payload.p ? 1 : 0,
    payload.m,
    payload.r.map((p) => [p.t, p.s, p.name, p.pts, p.reb, p.ast]),
    payload.u ?? "",
  ];
  if (payload.tn) {
    packed[7] = [payload.tn.w, payload.tn.l, Math.round(payload.tn.n * 10), payload.tn.r];
  }
  return toBase64Url(JSON.stringify(packed));
}

export function decodeShare(code: string): SharePayload | null {
  try {
    const packed = JSON.parse(fromBase64Url(code)) as Packed;
    if (!Array.isArray(packed) || packed.length < 6) return null;
    const [w, l, n10, p, m, r, u, tn] = packed;
    if (
      typeof w !== "number" ||
      typeof l !== "number" ||
      typeof n10 !== "number" ||
      typeof m !== "string" ||
      !Array.isArray(r)
    ) {
      return null;
    }
    const roster: SharePlayer[] = r.map((row) => ({
      t: String(row[0]),
      s: Number(row[1]),
      name: String(row[2]),
      pts: Number(row[3]),
      reb: Number(row[4]),
      ast: Number(row[5]),
    }));
    return {
      w, l, n: n10 / 10, p: p === 1, m, r: roster,
      u: typeof u === "string" && u ? u : undefined,
      tn: Array.isArray(tn)
        ? { w: Number(tn[0]), l: Number(tn[1]), n: Number(tn[2]) / 10, r: Number(tn[3]) }
        : undefined,
    };
  } catch {
    return null;
  }
}
