import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { decodeShare } from "@/lib/shareCode";

export const runtime = "nodejs";

// Brand palette (mirrors lib/shareImage.ts).
const INK = "#383838";
const PAPER = "#F4EFEA";
const PAPER_3 = "#E4DBD0";
const TEAL = "#16AA98";
const CORAL = "#FF7169";
const ORANGE = "#A45916";
const MUTED = "#818181";

const W = 1200;
const H = 630;

// Read fonts once per cold start instead of on every request.
const fontsPromise = Promise.all([
  readFile(join(process.cwd(), "assets/fonts/SpaceMono-Regular.ttf")),
  readFile(join(process.cwd(), "assets/fonts/SpaceMono-Bold.ttf")),
]);

function clampName(name: string): string {
  return name.length > 24 ? name.slice(0, 23) + "…" : name;
}

// reached round: 0 = lost R1 … 4 = champion (mirrors DailyShareTourn).
function reachedPhrase(r: number): string {
  return ["FIRST ROUND", "SEMIFINALS", "CONFERENCE FINALS", "RUNNER-UP", "CHAMPION"][
    Math.max(0, Math.min(4, r))
  ];
}

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("r");
  const data = code ? decodeShare(code) : null;

  const [regular, bold] = await fontsPromise;

  // Fallback card when the payload is missing/corrupt — still on-brand.
  const wins = data?.w ?? 0;
  const losses = data?.l ?? 82;
  const net = data?.n ?? 0;
  const perfect = data?.p ?? false;
  const label = (data?.m ?? "82-0+").toUpperCase();
  const roster = data?.r ?? [];
  const netColor = net >= 0 ? TEAL : CORAL;

  // Tournament share: a daily-tournament link unfurls as the TOURNAMENT card
  // (reg-season record + playoff record + realized margin), not the plain daily
  // card. Driven by the signed token's tournament run, threaded via `tn`.
  const tn = data?.tn;
  if (tn) {
    const sharerName = clampName(data?.u || "A player").toUpperCase();
    const marginColor = tn.n >= 0 ? TEAL : CORAL;
    const StatCol = ({ heading, value }: { heading: string; value: string }) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
        <div style={{ display: "flex", fontSize: 26, color: MUTED }}>{heading}</div>
        <div style={{ display: "flex", fontSize: 110, fontWeight: 700, lineHeight: 1, marginTop: 6 }}>
          {value}
        </div>
      </div>
    );
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%", height: "100%", display: "flex", flexDirection: "column",
            backgroundColor: PAPER, color: INK, fontFamily: "Space Mono", padding: 36,
          }}
        >
          <div
            style={{
              display: "flex", flexDirection: "column", flex: 1,
              border: `8px solid ${INK}`, padding: "28px 44px",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", fontSize: 38, fontWeight: 700 }}>🦆 82-0+ TOURNAMENT</div>
              <div style={{ display: "flex", fontSize: 24, color: MUTED }}>{label}</div>
            </div>

            {/* Sharer + reached round */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 18 }}>
              <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1 }}>{sharerName}</div>
              <div style={{ display: "flex", fontSize: 26, color: ORANGE, marginTop: 8 }}>
                {reachedPhrase(tn.r)}
              </div>
            </div>

            {/* Reg season + playoffs */}
            <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
              <StatCol heading="REG SEASON" value={`${wins}–${losses}`} />
              <StatCol heading="PLAYOFFS" value={`${tn.w}–${tn.l}`} />
            </div>

            {/* Margin + footer */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: marginColor }}>
                {tn.n >= 0 ? "+" : ""}{tn.n.toFixed(1)} playoff margin
              </div>
              <div style={{ display: "flex", fontSize: 22, color: MUTED }}>daily82.com</div>
            </div>
          </div>
        </div>
      ),
      {
        width: W, height: H,
        fonts: [
          { name: "Space Mono", data: regular, weight: 400, style: "normal" },
          { name: "Space Mono", data: bold, weight: 700, style: "normal" },
        ],
        headers: { "Cache-Control": "public, immutable, no-transform, max-age=31536000" },
      },
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: PAPER,
          color: INK,
          fontFamily: "Space Mono",
          padding: 36,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            border: `8px solid ${INK}`,
            padding: "28px 44px",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>
              🦆 82-0+
            </div>
            <div style={{ display: "flex", fontSize: 24, color: MUTED }}>
              {label}
            </div>
          </div>

          {/* Body: big record + net on the left, roster on the right */}
          <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                width: 420,
                justifyContent: "center",
              }}
            >
              <div style={{ display: "flex", fontSize: 150, fontWeight: 700, lineHeight: 1 }}>
                {wins}–{losses}
              </div>
              <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: netColor, marginTop: 8 }}>
                {net >= 0 ? "+" : ""}
                {net.toFixed(1)} net
              </div>
              {perfect ? (
                <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: TEAL, marginTop: 14 }}>
                  🏆 PERFECT SEASON
                </div>
              ) : (
                <div style={{ display: "flex", fontSize: 22, color: MUTED, marginTop: 14 }}>
                  82-0 needs ≈ +15.2 net
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingLeft: 28 }}>
              {roster.map((p, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    fontSize: 25,
                    padding: "9px 0",
                    borderBottom: i < roster.length - 1 ? `2px solid ${PAPER_3}` : "none",
                  }}
                >
                  <div style={{ display: "flex" }}>
                    <span style={{ color: ORANGE }}>
                      {p.t} &rsquo;{String(p.s).slice(2)}
                    </span>
                    <span style={{ marginLeft: 12 }}>{clampName(p.name)}</span>
                  </div>
                  <div style={{ display: "flex", color: MUTED, marginLeft: 12 }}>
                    {p.pts}/{p.reb}/{p.ast}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 22,
              color: MUTED,
            }}
          >
            <div style={{ display: "flex" }}>Powered by MotherDuck Game Quality</div>
            <div style={{ display: "flex" }}>daily82.com</div>
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Space Mono", data: regular, weight: 400, style: "normal" },
        { name: "Space Mono", data: bold, weight: 700, style: "normal" },
      ],
      headers: { "Cache-Control": "public, immutable, no-transform, max-age=31536000" },
    },
  );
}
