import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { decodeShare } from "@/lib/shareCode";

export const runtime = "nodejs";

// ── SLAM Editorial palette (mirrors globals.css --md-* tokens) ──────────────
const INK      = "#15110E";   // near-black warm ink
const INK_2    = "#221C17";   // lifted ink (radial bg on cover cards)
const PAPER    = "#EDE7D8";   // newsprint ground
const CREAM    = "#FBF8EF";   // coated-insert stock ("md-white")
const CORAL    = "#E5261F";   // flame-red — primary accent / CTA
const CORAL_D  = "#A6160F";   // flame deep / hover
const YELLOW   = "#FFC400";   // press-yellow — champion / highlight
const TEAL     = "#127A4F";   // court green — W / positive net
const MUTED    = "#5C564B";   // muted ink

const W = 1200;
const H = 630;

// ── Font loading — read once per cold start ──────────────────────────────────
// Bundled locally in assets/fonts/ so no network fetch at request time.
const fontsPromise = Promise.all([
  readFile(join(process.cwd(), "assets/fonts/SpaceMono-Regular.ttf")),
  readFile(join(process.cwd(), "assets/fonts/SpaceMono-Bold.ttf")),
  readFile(join(process.cwd(), "assets/fonts/Anton-Regular.ttf")),
  readFile(join(process.cwd(), "assets/fonts/Oswald-Bold.ttf")),
  readFile(join(process.cwd(), "assets/fonts/PermanentMarker-Regular.ttf")),
]);

// A real glossy basketball (Fluent emoji, bundled locally) — next/og's default
// emoji renderer only produces flat twemoji line-art, so we embed the PNG.
const ballPromise = readFile(
  join(process.cwd(), "assets/emoji/basketball-3d.png"),
).then((b) => `data:image/png;base64,${b.toString("base64")}`);

function clampName(name: string, max = 20): string {
  return name.length > max ? name.slice(0, max - 1) + "…" : name;
}

// reached round: 0 = lost R1 … 4 = champion (mirrors DailyShareTourn).
function reachedPhrase(r: number): string {
  return ["FIRST ROUND", "SEMIFINALS", "CONFERENCE FINALS", "RUNNER-UP", "CHAMPION"][
    Math.max(0, Math.min(4, r))
  ];
}

// ── Shared font options builder ───────────────────────────────────────────────
function fontOpts(spaceMono: Buffer, spaceMonoBold: Buffer, anton: Buffer, oswald: Buffer, marker: Buffer) {
  return [
    { name: "Space Mono",       data: spaceMono,    weight: 400 as const, style: "normal" as const },
    { name: "Space Mono",       data: spaceMonoBold,weight: 700 as const, style: "normal" as const },
    { name: "Anton",            data: anton,        weight: 400 as const, style: "normal" as const },
    { name: "Oswald",           data: oswald,       weight: 700 as const, style: "normal" as const },
    { name: "Permanent Marker", data: marker,       weight: 400 as const, style: "normal" as const },
  ];
}

// ── SLAM wordmark lockup ──────────────────────────────────────────────────────
// Ink field + flame "82" box, cream border, flame offset shadow.
function Wordmark({ size = 36 }: { size?: number }) {
  const pad = Math.round(size * 0.22);
  const h = Math.round(size * 1.35);
  return (
    <div
      style={{
        display: "flex",
        border: `2.5px solid ${CREAM}`,
        boxShadow: `4px 4px 0 ${CORAL}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: INK,
          paddingTop: 5,
          paddingBottom: 5,
          paddingLeft: pad + 4,
          paddingRight: pad,
          height: h,
        }}
      >
        <span
          style={{
            fontFamily: "Oswald",
            fontWeight: 700,
            fontSize: size,
            color: CREAM,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
          }}
        >
          DAILY
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: CORAL,
          paddingTop: 5,
          paddingBottom: 5,
          paddingLeft: pad,
          paddingRight: pad + 2,
          height: h,
        }}
      >
        <span
          style={{
            fontFamily: "Oswald",
            fontWeight: 700,
            fontSize: size,
            color: CREAM,
            letterSpacing: "-0.02em",
          }}
        >
          82
        </span>
      </div>
    </div>
  );
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("r");
  const data = code ? decodeShare(code) : null;

  const [spaceMono, spaceMonoBold, anton, oswald, marker] = await fontsPromise;
  const fonts = fontOpts(spaceMono, spaceMonoBold, anton, oswald, marker);

  const cacheHeaders = { "Cache-Control": "public, immutable, no-transform, max-age=31536000" };

  // ── A5K-0 · Brand / Homepage card ────────────────────────────────────────
  // Full flame-red ground, ghost "82" watermark, GO UNDEFEATED., marker scrawl.
  if (params.get("v") === "home") {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%", height: "100%",
            display: "flex", flexDirection: "column",
            background: CORAL,
            padding: "40px 56px",
            position: "relative",
          }}
        >
          {/* Ghost "82" watermark — bottom-right, large, low opacity */}
          <div
            style={{
              position: "absolute",
              right: -20,
              bottom: -40,
              fontFamily: "Anton",
              fontSize: 380,
              color: CORAL_D,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              display: "flex",
            }}
          >
            82
          </div>

          {/* Masthead row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Wordmark size={32} />
            <div
              style={{
                display: "flex",
                fontFamily: "Space Mono",
                fontSize: 13,
                fontWeight: 400,
                color: INK,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginTop: 8,
              }}
            >
              A DAILY BASKETBALL DRAFT PUZZLE
            </div>
          </div>

          {/* Hero block */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: 0 }}>
            {/* Marker scrawl */}
            <div
              style={{
                display: "flex",
                fontFamily: "Permanent Marker",
                fontSize: 36,
                color: INK,
                marginBottom: 4,
              }}
            >
              Five rolls. Draft five.
            </div>

            {/* GO UNDEFEATED. cover line */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 0 }}>
              <span
                style={{
                  fontFamily: "Anton",
                  fontSize: 160,
                  color: INK,
                  lineHeight: 0.88,
                  letterSpacing: "-0.01em",
                  textTransform: "uppercase",
                }}
              >
                GO
              </span>
              <span
                style={{
                  fontFamily: "Oswald",
                  fontSize: 104,
                  fontWeight: 700,
                  color: CREAM,
                  lineHeight: 0.88,
                  letterSpacing: "-0.01em",
                  textTransform: "uppercase",
                  marginLeft: 8,
                }}
              >
                UNDEFEATED.
              </span>
            </div>

            {/* Double rule */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 18, width: 620 }}>
              <div style={{ height: 3, background: INK, display: "flex" }} />
              <div style={{ height: 3, background: CREAM, display: "flex" }} />
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", fontFamily: "Space Mono", fontSize: 18, color: INK }}>
              Simulate the season. Chase 82–0.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  display: "flex",
                  width: 10, height: 10,
                  background: INK,
                }}
              />
              <span
                style={{
                  fontFamily: "Oswald",
                  fontWeight: 700,
                  fontSize: 26,
                  color: INK,
                  textTransform: "uppercase",
                  letterSpacing: "0.02em",
                }}
              >
                daily82.com
              </span>
            </div>
          </div>
        </div>
      ),
      { width: W, height: H, fonts, headers: cacheHeaders },
    );
  }

  // ── Shared data for result cards ──────────────────────────────────────────
  const wins   = data?.w ?? 0;
  const losses = data?.l ?? 82;
  const net    = data?.n ?? 0;
  const perfect = data?.p ?? false;
  const label  = (data?.m ?? "CLASSIC").toUpperCase();
  const roster = data?.r ?? [];
  const netColor = net >= 0 ? TEAL : CORAL;

  // ── A5J-0 · Tournament champion card ─────────────────────────────────────
  // Dark ink cover, trophy, "CHAMPION" Oswald, big Anton name, marker scrawl.
  const tn = data?.tn;
  if (tn) {
    const sharerName = clampName(data?.u || "A PLAYER", 24).toUpperCase();
    const isChamp = tn.r === 4;
    const reachLabel = reachedPhrase(tn.r);

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%", height: "100%",
            display: "flex", flexDirection: "column",
            background: INK,
            backgroundImage: `radial-gradient(${INK_2} 1.4px, transparent 1.5px)`,
            backgroundSize: "8px 8px",
            padding: "36px 56px",
            border: `0px solid transparent`,
            position: "relative",
          }}
        >
          {/* Confetti dots — decorative, only on champion */}
          {isChamp && (
            <>
              <div style={{ position: "absolute", top: 80, left: 60, width: 18, height: 18, background: YELLOW, display: "flex" }} />
              <div style={{ position: "absolute", top: 130, left: 120, width: 12, height: 12, background: CORAL, borderRadius: "50%", display: "flex" }} />
              <div style={{ position: "absolute", top: 90, right: 100, width: 16, height: 16, background: CORAL, display: "flex" }} />
              <div style={{ position: "absolute", top: 60, right: 200, width: 10, height: 10, background: YELLOW, borderRadius: "50%", display: "flex" }} />
              <div style={{ position: "absolute", bottom: 110, left: 80, width: 20, height: 8, background: CREAM, display: "flex" }} />
              <div style={{ position: "absolute", bottom: 150, right: 80, width: 16, height: 16, background: YELLOW, display: "flex" }} />
              <div style={{ position: "absolute", bottom: 100, right: 180, width: 12, height: 12, background: CORAL, borderRadius: "50%", display: "flex" }} />
            </>
          )}

          {/* Top row: wordmark + "THE BRACKET" label */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Wordmark size={28} />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontFamily: "Space Mono",
                fontSize: 13,
                color: MUTED,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              <div style={{ display: "flex", width: 20, height: 1.5, background: MUTED }} />
              THE BRACKET
            </div>
          </div>

          {/* Center: trophy + CHAMPION label + name */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              gap: 0,
            }}
          >
            {isChamp && (
              // Trophy lockup — pure flex, no absolute positioning (satori safe)
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 10, gap: 0 }}>
                {/* Top row: left handle + cup bowl + right handle */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
                  <div style={{ display: "flex", width: 9, height: 22, background: YELLOW, marginTop: 10, borderRadius: "0 6px 6px 0" }} />
                  {/* Cup body — trapezoid via border trick not available; use rounded rect */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 52, height: 40, background: YELLOW,
                    borderRadius: "2px 2px 8px 8px",
                  }}>
                    <span style={{ fontFamily: "Oswald", fontWeight: 700, fontSize: 20, color: INK }}>★</span>
                  </div>
                  <div style={{ display: "flex", width: 9, height: 22, background: YELLOW, marginTop: 10, borderRadius: "6px 0 0 6px" }} />
                </div>
                {/* Stem */}
                <div style={{ display: "flex", width: 10, height: 12, background: YELLOW }} />
                {/* Base */}
                <div style={{ display: "flex", width: 46, height: 7, background: YELLOW, borderRadius: 2 }} />
              </div>
            )}
            {/* CHAMPION label with flanking rules */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
              <div style={{ display: "flex", width: 60, height: 2, background: YELLOW }} />
              <span
                style={{
                  fontFamily: "Oswald",
                  fontWeight: 700,
                  fontSize: 22,
                  color: YELLOW,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                }}
              >
                {isChamp ? "CHAMPION" : reachLabel}
              </span>
              <div style={{ display: "flex", width: 60, height: 2, background: YELLOW }} />
            </div>

            {/* Big champion name — Anton */}
            <div
              style={{
                display: "flex",
                fontFamily: "Anton",
                fontSize: sharerName.length > 14 ? 96 : 128,
                color: CREAM,
                lineHeight: 0.9,
                letterSpacing: "-0.01em",
                textTransform: "uppercase",
              }}
            >
              {sharerName}
            </div>

            {/* Sub-line: record + "RAN THE TABLE" */}
            <div
              style={{
                display: "flex",
                fontFamily: "Space Mono",
                fontSize: 18,
                color: MUTED,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginTop: 16,
                gap: 12,
              }}
            >
              <span>
                {isChamp ? "RAN THE TABLE" : `REG ${wins}–${losses}`}
              </span>
              <span>·</span>
              <span>
                WON THE {label} BRACKET {tn.w}–{tn.l}
              </span>
            </div>

            {/* "RING SECURED." marker scrawl */}
            {isChamp && (
              <div
                style={{
                  display: "flex",
                  fontFamily: "Permanent Marker",
                  fontSize: 38,
                  color: CORAL,
                  marginTop: 14,
                }}
              >
                Ring secured.
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", fontFamily: "Space Mono", fontSize: 14, color: MUTED }}>
              An independent basketball draft puzzle
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: "Oswald",
                fontSize: 24,
                fontWeight: 700,
                color: CREAM,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              daily82.com
            </div>
          </div>

          {/* Bottom double stripe: yellow + coral — SLAM champion mark (absolute, safe in satori) */}
          <div style={{
            display: "flex", flexDirection: "column",
            position: "absolute", bottom: 0, left: 0, width: "100%",
          }}>
            <div style={{ display: "flex", height: 5, background: YELLOW, width: "100%" }} />
            <div style={{ display: "flex", height: 4, background: CORAL, width: "100%" }} />
          </div>
        </div>
      ),
      { width: W, height: H, fonts, headers: cacheHeaders },
    );
  }

  // ── A5I-0 · Classic / Ranked result card ─────────────────────────────────
  // Newsprint ground, "CLASSIC SEASON" / "RANKED SEASON" badge, big flame score,
  // green net, player names dot-row, "YOU BUILT A CONTENDER." marker scrawl.
  const isDaily = label.startsWith("DAILY") || label.startsWith("D ");

  if (!isDaily) {
    // Classic or Ranked result
    const headline = net >= 15.2 ? "PERFECT SEASON." : net >= 10 ? "YOU BUILT A DYNASTY." : net >= 5 ? "YOU BUILT A CONTENDER." : "THE FINAL SCORE.";
    // Clamp each name short so the whole dot-row fits on one line (max 5 names × ~12 chars + dots)
    const playerLine = roster.length > 0
      ? roster.map((p) => clampName(p.name, 12)).join("  ·  ")
      : "";

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%", height: "100%",
            display: "flex", flexDirection: "column",
            background: PAPER,
            padding: "40px 56px",
          }}
        >
          {/* Top row: wordmark + mode badge */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Wordmark size={32} />
            <div
              style={{
                display: "flex",
                border: `2px solid ${INK}`,
                background: INK,
                padding: "8px 18px",
                fontFamily: "Oswald",
                fontWeight: 700,
                fontSize: 16,
                color: CREAM,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              {label} SEASON
            </div>
          </div>

          {/* Body */}
          <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 0 }}>
            {/* Left: score + net + player names */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              {/* "YOUR FINAL STANDINGS" label */}
              <div
                style={{
                  display: "flex",
                  fontFamily: "Space Mono",
                  fontSize: 14,
                  color: MUTED,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                YOUR FINAL STANDINGS — 82-GAME SEASON
              </div>

              {/* Big record: flame wins + ink dash + ink losses */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 0 }}>
                <span
                  style={{
                    fontFamily: "Anton",
                    fontSize: 180,
                    color: CORAL,
                    lineHeight: 0.85,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {wins}
                </span>
                <span
                  style={{
                    fontFamily: "Anton",
                    fontSize: 100,
                    color: INK,
                    lineHeight: 1,
                    paddingBottom: 12,
                    paddingLeft: 8,
                    paddingRight: 8,
                    opacity: 0.5,
                  }}
                >
                  -
                </span>
                <span
                  style={{
                    fontFamily: "Anton",
                    fontSize: 180,
                    color: INK,
                    lineHeight: 0.85,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {losses}
                </span>
                {/* Net rating inline */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    paddingLeft: 24,
                    paddingBottom: 16,
                    gap: 2,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "Space Mono",
                      fontSize: 13,
                      color: MUTED,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    NET RATING
                  </span>
                  <span
                    style={{
                      fontFamily: "Oswald",
                      fontWeight: 700,
                      fontSize: 62,
                      color: netColor,
                      lineHeight: 1,
                    }}
                  >
                    {net >= 0 ? "+" : ""}{net.toFixed(1)}
                  </span>
                </div>
              </div>

              {/* Player names dot-row */}
              {playerLine && (
                <div
                  style={{
                    display: "flex",
                    fontFamily: "Oswald",
                    fontWeight: 700,
                    fontSize: 18,
                    color: INK,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginTop: 8,
                  }}
                >
                  {playerLine}
                </div>
              )}
            </div>

            {/* Right: marker scrawl headline */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                width: 340,
                paddingLeft: 28,
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                }}
              >
                <span
                  style={{
                    fontFamily: "Permanent Marker",
                    fontSize: 58,
                    color: INK,
                    lineHeight: 1.1,
                  }}
                >
                  {headline}
                </span>
                {/* Underline accent */}
                <div
                  style={{
                    position: "absolute",
                    bottom: -8,
                    left: 0,
                    width: 220,
                    height: 4,
                    background: CORAL,
                    display: "flex",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: `2px solid ${INK}`,
              paddingTop: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "Oswald",
                fontWeight: 700,
                fontSize: 22,
                color: INK,
                textTransform: "uppercase",
              }}
            >
              BUILD YOURS —
              <span style={{ color: CORAL }}>DAILY82.COM</span>
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: "Space Mono",
                fontSize: 13,
                color: MUTED,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              A DAILY BASKETBALL DRAFT PUZZLE
            </div>
          </div>
        </div>
      ),
      { width: W, height: H, fonts, headers: cacheHeaders },
    );
  }

  // ── A5H-0 · Daily Challenge result card ──────────────────────────────────
  // Dark ink cover, wordmark, date meta, giant flame wins + cream losses,
  // rank stamp, "CAN YOU BEAT IT?" hook, "new puzzle daily" marker bottom-right.
  // Extract the date from the mode label: "Daily 2026-06-03" → "JUN 03, 2026"
  const dateStr = (() => {
    if (!label) return null;
    const m = label.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const mo = parseInt(m[2], 10) - 1;
    return `${months[mo]} ${m[3]}, ${m[1]}`;
  })();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%",
          display: "flex", flexDirection: "column",
          background: INK,
          backgroundImage: `radial-gradient(${INK_2} 1.4px, transparent 1.5px)`,
          backgroundSize: "8px 8px",
          padding: "36px 56px",
        }}
      >
        {/* Top strip: wordmark + date meta */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Wordmark size={32} />
          {dateStr && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 2,
              }}
            >
              <span
                style={{
                  fontFamily: "Space Mono",
                  fontSize: 12,
                  fontWeight: 700,
                  color: YELLOW,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                DAILY CHALLENGE
              </span>
              <span
                style={{
                  fontFamily: "Space Mono",
                  fontSize: 18,
                  fontWeight: 700,
                  color: CREAM,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {dateStr}
              </span>
            </div>
          )}
        </div>

        {/* Center focal: record block + optional rank stamp */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Record block */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div
              style={{
                display: "flex",
                fontFamily: "Space Mono",
                fontSize: 14,
                fontWeight: 400,
                color: YELLOW,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              TODAY&apos;S RESULT
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 0 }}>
              <span
                style={{
                  fontFamily: "Anton",
                  fontSize: 220,
                  color: CORAL,
                  lineHeight: 0.85,
                  letterSpacing: "-0.02em",
                }}
              >
                {wins}
              </span>
              {/* Em-dash separator */}
              <div
                style={{
                  display: "flex",
                  width: 52,
                  height: 12,
                  background: MUTED,
                  margin: "0 14px",
                  marginBottom: 54,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "Anton",
                  fontSize: 220,
                  color: CREAM,
                  lineHeight: 0.85,
                  letterSpacing: "-0.02em",
                }}
              >
                {losses}
              </span>
            </div>
          </div>

          {/* Perfect season callout */}
          {perfect && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                border: `3px solid ${YELLOW}`,
                background: YELLOW,
                padding: "16px 28px",
                boxShadow: `4px 4px 0 ${INK}`,
              }}
            >
              <span style={{ fontFamily: "Anton", fontSize: 52, color: INK, lineHeight: 1 }}>
                82-0
              </span>
              <span
                style={{
                  fontFamily: "Space Mono",
                  fontSize: 13,
                  fontWeight: 700,
                  color: INK,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                UNDEFEATED
              </span>
            </div>
          )}
        </div>

        {/* Bottom strip: "CAN YOU BEAT IT?" hook + rule + footer */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Hook row */}
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <span
              style={{
                fontFamily: "Oswald",
                fontWeight: 700,
                fontSize: 56,
                color: CORAL,
                lineHeight: 1,
                textTransform: "uppercase",
                letterSpacing: "-0.01em",
              }}
            >
              CAN YOU BEAT IT?
            </span>
            <div style={{ flex: 1, height: 3.5, background: CORAL, display: "flex" }} />
          </div>
          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span
                style={{
                  fontFamily: "Oswald",
                  fontWeight: 700,
                  fontSize: 22,
                  color: CREAM,
                  textTransform: "uppercase",
                }}
              >
                daily82.com
              </span>
              <span style={{ fontFamily: "Space Mono", fontSize: 13, color: MUTED }}>
                A daily basketball draft puzzle
              </span>
            </div>
            <span
              style={{
                fontFamily: "Permanent Marker",
                fontSize: 26,
                color: YELLOW,
              }}
            >
              new puzzle daily
            </span>
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts, headers: cacheHeaders },
  );
}
