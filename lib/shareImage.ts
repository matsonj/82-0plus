import type { SimResult, SimRosterLine, BracketPlayer } from "./types";

// Draw a branded result card to a PNG (no deps). Square 1080 for share sheets.
// `isDaily` redacts the roster: in the Daily Challenge everyone plays the SAME five
// team/era rolls, so revealing which player you took from each slot spoils the
// puzzle. Daily cards instead show the team's nine aggregate category stats.
//
// SLAM EDITORIAL theme — 90s hoops-magazine: newsprint cream ground, warm ink,
// two screaming spot inks (flame-red + press-yellow), hard offset shadows, zero
// radius. Anton for big display, Archivo for the wordmark, Oswald for labels,
// Space Mono for ALL data/numerals, Special Elite for the dateline eyebrow.
// Mirrors the Paper mocks (artboards GIU/GRO/GPC/GUS-0) and the OG route tokens.

// ---- SLAM palette (hex literals — canvas takes strings, not CSS vars) -------
const INK = "#15110E"; // warm near-black — type, borders, rules
const PAPER = "#EDE7D8"; // newsprint ground
const CORAL = "#E5261F"; // flame-red — primary accent, wins, wordmark box
const TEAL = "#1E8E5A"; // brighter court green — positive net / margin
const YELLOW = "#F2B705"; // press-yellow — champion / captain / team-bar label
const CAPTAIN_TEXT = "#C28E00"; // darkened yellow so the [C] pill text clears AA
const HAIRLINE = "#C9C0AE"; // muted dividers / row rules
const MUTED = "#7A7060"; // secondary labels (large)
const MUTED_DK = "#5C564B"; // dateline / small caption (darkened for <16px AA)
const BAR_NUM = "#CFC5AD"; // secondary numbers on the dark TEAM/GAME bar

// ---- Canvas geometry --------------------------------------------------------
const W = 1080;
const H = 1080;
const PAD = 28; // outer cream margin (Tailwind p-7)
const FRAME_X = PAD + 2; // inner ink border (2px) inset
const SIDE = 60; // content inset from frame (px-15)
const CONTENT_L = FRAME_X + SIDE; // left content edge (≈90)
const CONTENT_R = W - FRAME_X - SIDE; // right content edge (≈990)

// ---- Font resolution --------------------------------------------------------
// next/font self-hosts each family under a HASHED family name and exposes it via
// the CSS variable declared in app/layout.tsx (e.g. --font-anton). We can't
// import those font objects from here (layout.tsx is out of scope), so we read
// the resolved variable off <html> at runtime and feed the family list straight
// into the canvas `font` shorthand. Fallbacks keep the card legible if a variable
// is ever missing.
type Voice = "cover" | "wordmark" | "label" | "mono" | "byline";

const FONT_VARS: Record<Voice, { varName: string; fallback: string }> = {
  cover: { varName: "--font-anton", fallback: '"Arial Narrow", sans-serif' },
  wordmark: { varName: "--font-archivo", fallback: '"Arial Black", sans-serif' },
  label: { varName: "--font-oswald", fallback: '"Arial Narrow", sans-serif' },
  mono: { varName: "--font-space-mono", fallback: "Menlo, ui-monospace, monospace" },
  byline: { varName: "--font-special-elite", fallback: '"Courier New", monospace' },
};

function resolveFamilies(): Record<Voice, string> {
  const root =
    typeof document !== "undefined" ? document.documentElement : null;
  const cs = root ? getComputedStyle(root) : null;
  const out = {} as Record<Voice, string>;
  for (const voice of Object.keys(FONT_VARS) as Voice[]) {
    const { varName, fallback } = FONT_VARS[voice];
    const resolved = cs?.getPropertyValue(varName).trim();
    // The CSS var already includes its own fallback chain; append ours too.
    out[voice] = resolved ? `${resolved}, ${fallback}` : fallback;
  }
  return out;
}

// Ensure the (swap-deferred) web fonts are actually downloaded before fillText.
// `document.fonts.ready` only settles fonts already requested by rendered DOM, so
// any family the page hasn't painted yet (e.g. the Archivo wordmark width, the
// Special Elite dateline) could fall back. Force a load of each role at a
// representative size/weight, then await the FontFaceSet settling.
async function ensureFonts(fam: Record<Voice, string>): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const probes = [
    `400 64px ${fam.cover}`,
    `900 48px ${fam.wordmark}`,
    `600 24px ${fam.label}`,
    `700 24px ${fam.label}`,
    `700 48px ${fam.mono}`,
    `400 48px ${fam.mono}`,
    `400 18px ${fam.byline}`,
  ];
  try {
    await Promise.all(probes.map((p) => document.fonts.load(p)));
  } catch {
    /* best-effort */
  }
  try {
    await document.fonts.ready;
  } catch {
    /* best-effort */
  }
}

// ---- Shared chrome ----------------------------------------------------------
type Ctx = CanvasRenderingContext2D;

/** Newsprint ground, faint flame halftone circle top-right, double frame:
 *  ink 2px rule with a hairline outline offset 5px outside it. */
function drawGround(ctx: Ctx): void {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // Faint flame circle (the OG/Paper "halftone" motif) — clip to the frame so it
  // never bleeds past the border.
  ctx.save();
  ctx.beginPath();
  ctx.rect(FRAME_X, FRAME_X, W - 2 * FRAME_X, H - 2 * FRAME_X);
  ctx.clip();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = CORAL;
  ctx.beginPath();
  ctx.arc(W - PAD - 40, PAD + 40, 130, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Hairline outline (the "outline offset 5px" of the Tailwind frame).
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD - 5, PAD - 5, W - 2 * (PAD - 5), H - 2 * (PAD - 5));
  // Ink rule.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(PAD + 1, PAD + 1, W - 2 * (PAD + 1), H - 2 * (PAD + 1));
}

/** "DAILY 82" lockup: ink box (cream "DAILY") + flame box ("82"), 3px ink stroke
 *  with a hard 6px flame offset shadow. Returns the lockup's bottom-y. */
function drawWordmark(
  ctx: Ctx,
  fam: Record<Voice, string>,
  topY: number,
  scale = 1,
): number {
  const fs = Math.round(36 * scale); // Archivo black ~36px in the mocks
  const padY = Math.round(13 * scale);
  const padX = Math.round(15 * scale);
  const boxH = fs + padY * 2;

  ctx.save();
  // Archivo is a width-axis variable font; expand it to echo wdth 125. Guarded —
  // unsupported engines simply ignore fontStretch.
  try {
    (ctx as Ctx & { fontStretch?: string }).fontStretch = "expanded";
  } catch {
    /* no-op */
  }
  ctx.font = `900 ${fs}px ${fam.wordmark}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const dailyTxt = "DAILY";
  const eightTxt = "82";
  const dailyW = ctx.measureText(dailyTxt).width;
  const eightW = ctx.measureText(eightTxt).width;
  const boxDailyW = dailyW + padX * 2;
  const boxEightW = eightW + padX * 2;
  const x = CONTENT_L;
  const y = topY;

  // Hard flame offset shadow (6px), behind both boxes.
  ctx.fillStyle = CORAL;
  ctx.fillRect(x + 6, y + 6, boxDailyW + boxEightW, boxH);

  // Ink box ("DAILY").
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, boxDailyW, boxH);
  // Flame box ("82").
  ctx.fillStyle = CORAL;
  ctx.fillRect(x + boxDailyW, y, boxEightW, boxH);
  // 3px ink stroke around the whole lockup.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, boxDailyW + boxEightW, boxH);

  // Cream text on both boxes (baseline near box bottom).
  ctx.fillStyle = PAPER;
  const textY = y + padY + fs * 0.8;
  ctx.fillText(dailyTxt, x + padX, textY);
  ctx.fillText(eightTxt, x + boxDailyW + padX, textY);
  ctx.restore();

  return y + boxH;
}

/** Ink pill, top-right, with an Oswald uppercase label (the mode / dateline). */
function drawEyebrowPill(
  ctx: Ctx,
  fam: Record<Voice, string>,
  text: string,
  centerY: number,
): void {
  const label = text.toUpperCase();
  const fs = 18;
  ctx.save();
  ctx.font = `600 ${fs}px ${fam.label}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "0.22em";
  const tw = ctx.measureText(label).width + fs * 0.22; // approx tracking add
  const padX = 18;
  const padY = 12;
  const boxW = tw + padX * 2;
  const boxH = fs + padY * 2;
  const x = CONTENT_R - boxW;
  const y = centerY - boxH / 2;
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillStyle = PAPER;
  ctx.fillText(label, x + padX, y + boxH / 2 + 1);
  ctx.restore();
}

/** Section header row: Anton title (left) + a small right-aligned tag, with a
 *  2px ink rule underneath. Returns the y just below the rule. */
function drawSectionHeader(
  ctx: Ctx,
  fam: Record<Voice, string>,
  title: string,
  tag: { text: string; color: string; font: "label" | "mono" },
  baselineY: number,
): number {
  ctx.save();
  ctx.textBaseline = "alphabetic";
  // Title — Anton.
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.letterSpacing = "0.01em";
  ctx.font = `400 30px ${fam.cover}`;
  ctx.fillText(title, CONTENT_L, baselineY);
  // Tag — right aligned.
  ctx.textAlign = "right";
  ctx.fillStyle = tag.color;
  if (tag.font === "label") {
    ctx.letterSpacing = "0.18em";
    ctx.font = `600 13px ${fam.label}`;
  } else {
    ctx.letterSpacing = "0.02em";
    ctx.font = `700 18px ${fam.mono}`;
  }
  ctx.fillText(tag.text, CONTENT_R, baselineY);
  ctx.restore();
  // Ink rule.
  const ruleY = baselineY + 12;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CONTENT_L, ruleY);
  ctx.lineTo(CONTENT_R, ruleY);
  ctx.stroke();
  return ruleY;
}

/** Footer: short flame tick over the "daily82.com" Oswald wordmark, centered. */
function drawFooter(ctx: Ctx, fam: Record<Voice, string>): void {
  ctx.save();
  const cx = W / 2;
  const tickY = H - PAD - 86;
  ctx.fillStyle = CORAL;
  ctx.fillRect(cx - 32, tickY, 64, 4);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.letterSpacing = "0.16em";
  ctx.font = `700 24px ${fam.label}`;
  ctx.fillText("DAILY82.COM", cx, tickY + 38);
  ctx.restore();
}

/** The nine-category 3×3 grid (Space Mono values + Oswald labels), centered in
 *  three equal columns between the content margins. `topY` is the value baseline
 *  of the first row. */
function drawStatGrid(
  ctx: Ctx,
  fam: Record<Voice, string>,
  cells: [string, string][],
  topY: number,
  rowH: number,
): void {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const cols = 3;
  const colW = (CONTENT_R - CONTENT_L) / cols;
  for (let i = 0; i < cells.length; i++) {
    const [lbl, val] = cells[i];
    const cx = CONTENT_L + colW * (i % cols) + colW / 2;
    const ry = topY + Math.floor(i / cols) * rowH;
    ctx.fillStyle = INK;
    ctx.letterSpacing = "-0.02em";
    ctx.font = `700 62px ${fam.mono}`;
    ctx.fillText(val, cx, ry);
    ctx.fillStyle = MUTED;
    ctx.letterSpacing = "0.2em";
    ctx.font = `600 16px ${fam.label}`;
    ctx.fillText(lbl, cx, ry + 34);
  }
  ctx.restore();
}

/** Dark ink TEAM / GAME bar: yellow Oswald label + three right-aligned Space Mono
 *  totals (first cream, rest BAR_NUM). Drawn from y `top`; returns its bottom-y. */
function drawTeamGameBar(
  ctx: Ctx,
  fam: Record<Voice, string>,
  totals: [number, number, number],
  top: number,
): number {
  const barH = 78;
  const x = CONTENT_L;
  const w = CONTENT_R - CONTENT_L;
  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(x, top, w, barH);
  // Label.
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = YELLOW;
  ctx.letterSpacing = "0.16em";
  ctx.font = `600 20px ${fam.label}`;
  ctx.fillText("TEAM / GAME", x + 24, top + barH / 2 + 1);
  // Three right-aligned numbers in fixed lanes.
  ctx.textAlign = "right";
  ctx.font = `700 24px ${fam.mono}`;
  ctx.letterSpacing = "-0.01em";
  const laneR = x + w - 24;
  const laneW = 96;
  const cols = [BAR_NUM, BAR_NUM, PAPER]; // rightmost→leftmost: AST, REB, PTS
  const vals = [totals[2], totals[1], totals[0]]; // AST, REB, PTS (right to left)
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = cols[i];
    ctx.fillText(vals[i].toFixed(1), laneR - i * laneW, top + barH / 2 + 1);
  }
  ctx.restore();
  return top + barH;
}

/** One roster row: fixed team/season col (flame), player name (ink), optional
 *  right-aligned PTS/REB/AST stats (muted) or a captain [C] pill. Bottom hairline
 *  unless `last`. `y` is the text baseline; returns the next row's baseline. */
function drawRosterRow(
  ctx: Ctx,
  fam: Record<Voice, string>,
  opts: {
    teamSeason: string;
    name: string;
    stats?: string; // "18.0 / 5.3 / 4.5" — Classic reg-season only
    captain?: boolean;
    last?: boolean;
    pitch?: number; // row-to-row advance (default 64)
  },
  y: number,
): number {
  const rowH = opts.pitch ?? 64;
  const teamColW = 96; // fixed lane (Tailwind w-24)
  const nameX = CONTENT_L + teamColW + 18; // grow col left pad (pl-4.5)

  ctx.save();
  ctx.textBaseline = "alphabetic";
  // Team / season.
  ctx.textAlign = "left";
  ctx.fillStyle = CORAL;
  ctx.letterSpacing = "0.02em";
  ctx.font = `700 18px ${fam.mono}`;
  ctx.fillText(opts.teamSeason, CONTENT_L, y);
  // Player name (clamp).
  ctx.fillStyle = INK;
  ctx.letterSpacing = "-0.01em";
  ctx.font = `700 21px ${fam.mono}`;
  const maxName = opts.stats ? 22 : 26;
  const nm =
    opts.name.length > maxName ? opts.name.slice(0, maxName - 1) + "…" : opts.name;
  ctx.fillText(nm, nameX, y);
  // Trailing: stats OR captain pill.
  if (opts.stats) {
    ctx.textAlign = "right";
    ctx.fillStyle = MUTED;
    ctx.letterSpacing = "0.02em";
    ctx.font = `400 17px ${fam.mono}`;
    ctx.fillText(opts.stats, CONTENT_R, y);
  } else if (opts.captain) {
    const nameW = ctx.measureText(nm).width;
    const pillX = nameX + nameW + 14;
    const pillS = 26;
    const pillY = y - 21;
    ctx.fillStyle = "rgba(242,183,5,0.12)"; // #F2B705 @ 12%
    ctx.fillRect(pillX, pillY, pillS, pillS);
    ctx.strokeStyle = YELLOW;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pillX, pillY, pillS, pillS);
    ctx.fillStyle = CAPTAIN_TEXT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "0.08em";
    ctx.font = `700 13px ${fam.label}`;
    ctx.fillText("C", pillX + pillS / 2 + 1, pillY + pillS / 2 + 1);
  }
  ctx.restore();

  // Bottom hairline.
  if (!opts.last) {
    ctx.strokeStyle = HAIRLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CONTENT_L, y + 18);
    ctx.lineTo(CONTENT_R, y + 18);
    ctx.stroke();
  }
  return y + rowH;
}

// ============================================================================
// Reg-season card (Home result + Classic/Ranked).
// ============================================================================
export async function buildShareImage(
  result: SimResult,
  roster: SimRosterLine[],
  label: string,
  isDaily = false,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const fam = resolveFamilies();
  await ensureFonts(fam);

  drawGround(ctx);
  const wordmarkBottom = drawWordmark(ctx, fam, PAD + 38);
  // Mode pill aligned to the wordmark's vertical center.
  drawEyebrowPill(ctx, fam, label, PAD + 38 + (wordmarkBottom - (PAD + 38)) / 2);

  // ---- Money line: "YOUR FINAL STANDINGS" eyebrow + big W–L + net/margin ----
  const eyebrowY = 232;
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = MUTED_DK;
  ctx.letterSpacing = "0.06em";
  ctx.font = `400 17px ${fam.byline}`;
  ctx.fillText("YOUR FINAL STANDINGS · 82-GAME SEASON", CONTENT_L, eyebrowY);
  ctx.restore();

  // Big W–L baseline. Anton ~210px; wins flame, dash muted, losses ink.
  const scoreY = 420;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.letterSpacing = "-0.02em";
  ctx.font = `400 210px ${fam.cover}`;
  const wins = `${result.wins}`;
  const losses = `${result.losses}`;
  ctx.fillStyle = CORAL;
  ctx.fillText(wins, CONTENT_L, scoreY);
  const winsW = ctx.measureText(wins).width;
  ctx.fillStyle = MUTED;
  ctx.font = `400 150px ${fam.cover}`;
  const dashX = CONTENT_L + winsW + 14;
  ctx.fillText("–", dashX, scoreY);
  const dashW = ctx.measureText("–").width;
  ctx.fillStyle = INK;
  ctx.font = `400 210px ${fam.cover}`;
  const lossX = dashX + dashW + 14;
  ctx.fillText(losses, lossX, scoreY);
  const lossW = ctx.measureText(losses).width;
  ctx.restore();

  // Net rating / proj. margin block, to the right of the score.
  const netX = lossX + lossW + 40;
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = MUTED;
  ctx.letterSpacing = "0.2em";
  ctx.font = `600 15px ${fam.label}`;
  ctx.fillText(isDaily ? "PROJ. MARGIN" : "NET RATING", netX, scoreY - 72);
  const net = result.netRating;
  ctx.fillStyle = net >= 0 ? TEAL : CORAL;
  ctx.letterSpacing = "-0.03em";
  ctx.font = `700 64px ${fam.mono}`;
  ctx.fillText(`${net >= 0 ? "+" : "−"}${Math.abs(net).toFixed(1)}`, netX, scoreY - 8);
  ctx.restore();

  // Perfect-season banner (yellow pill, hard ink shadow) tucked under the score.
  let sectionTop = 560;
  if (result.perfect) {
    ctx.save();
    ctx.font = `700 30px ${fam.label}`;
    ctx.letterSpacing = "0.12em";
    const txt = "PERFECT SEASON";
    const tw = ctx.measureText(txt).width + 30 * 0.12;
    const bw = tw + 56;
    const bh = 56;
    const bx = CONTENT_L;
    const by = 478;
    ctx.fillStyle = INK;
    ctx.fillRect(bx + 5, by + 5, bw, bh);
    ctx.fillStyle = YELLOW;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(txt, bx + bw / 2, by + bh / 2 + 1);
    ctx.restore();
    sectionTop = 588;
  }

  if (isDaily) {
    // DAILY: never reveal the picks — show the nine team category stats instead.
    const b = result.teamBox;
    const cells: [string, string][] = [
      ["PTS", `${b.pts}`], ["REB", `${b.reb}`], ["AST", `${b.ast}`],
      ["STL", `${b.stl}`], ["BLK", `${b.blk}`], ["3PM", `${b.fg3m}`],
      ["FG%", `${b.fgPct}`], ["FT%", `${b.ftPct}`], ["TOV", `${b.tov}`],
    ];
    const ruleY = drawSectionHeader(
      ctx,
      fam,
      "TEAM · PER GAME",
      { text: "NINE CATEGORIES", color: MUTED, font: "label" },
      sectionTop,
    );
    drawStatGrid(ctx, fam, cells, ruleY + 78, 118);
  } else {
    // Classic / Ranked: the roster WITH per-player PTS/REB/AST + a TEAM/GAME bar.
    const ruleY = drawSectionHeader(
      ctx,
      fam,
      "THE ROSTER",
      { text: "PER-GAME · PTS / REB / AST", color: MUTED, font: "label" },
      sectionTop,
    );
    // Five rows fill the band between the section rule and the dark TEAM/GAME bar,
    // which is anchored just above the footer. Pitch is derived from the count so
    // a short roster still reads evenly.
    const barTop = 856; // bar runs 856→934; footer tick sits at ≈966
    const firstY = ruleY + 44;
    const band = barTop - 14 - firstY; // leave a small gap above the bar
    const n = Math.max(roster.length, 1);
    const pitch = Math.min(64, Math.max(44, Math.floor(band / n)));
    let y = firstY;
    for (let i = 0; i < roster.length; i++) {
      const r = roster[i];
      y = drawRosterRow(
        ctx,
        fam,
        {
          teamSeason: `${r.team} '${String(r.best_season).slice(2)}`,
          name: r.player_name,
          stats: `${r.pts.toFixed(1)} / ${r.reb.toFixed(1)} / ${r.ast.toFixed(1)}`,
          pitch,
          last: i === roster.length - 1, // bottom row's rule is the bar's top edge
        },
        y,
      );
    }
    drawTeamGameBar(
      ctx,
      fam,
      [result.teamBox.pts, result.teamBox.reb, result.teamBox.ast],
      barTop,
    );
  }

  drawFooter(ctx, fam);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

// ============================================================================
// Tournament card: team name + tier/seed + reg/playoff records + roster (or, for
// daily, the spoiler-free 9-stat grid + actual margin).
// ============================================================================
export async function buildTournamentShareImage(args: {
  teamName: string;
  conference: string;
  seed: number;
  isChampion: boolean;
  reachedLabel: string;
  regWins: number;
  regLosses: number;
  playoffWins: number;
  playoffLosses: number;
  tier?: string; // S / AA / A / B / C / D — omitted if ineligible (and for daily)
  modeLabel?: string; // "DAILY 06-05-26" / "CLASSIC" / "RANKED"
  roster: BracketPlayer[];
  sixthMan?: BracketPlayer;
  // Daily cards reveal nothing about the picks: pass the team's 9 category stats +
  // the ACTUAL playoff scoring margin instead of the roster.
  box?: { pts: number; reb: number; ast: number; stl: number; blk: number; fgPct: number; ftPct: number; tov: number; fg3m: number };
  actualMargin?: number;
}): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const fam = resolveFamilies();
  await ensureFonts(fam);

  const isDaily = !!args.box;

  drawGround(ctx);
  const wordmarkBottom = drawWordmark(ctx, fam, PAD + 32, 0.85);
  drawEyebrowPill(
    ctx,
    fam,
    "TOURNAMENT",
    PAD + 32 + (wordmarkBottom - (PAD + 32)) / 2,
  );

  // ---- Eyebrow + team name (or "NGMI" for daily bracket exit) --------------
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = MUTED_DK;
  ctx.letterSpacing = "0.06em";
  ctx.font = `400 17px ${fam.byline}`;
  ctx.fillText(
    isDaily ? "YOUR ENTRY · BRACKET RESULT" : "YOUR ENTRY · PLAYOFF RESULT",
    CONTENT_L,
    200,
  );
  ctx.restore();

  // Team name — Anton, clamp the size to fit. Daily uses the bracket roll-up
  // headline ("NGMI" / champion shout) the caller passes as teamName.
  const name = args.teamName.toUpperCase();
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.letterSpacing = "-0.01em";
  // Shrink-to-fit: start at the natural size, then scale down if the name would
  // run past the card's right edge. Team names can be up to 24 chars now, so a
  // fixed size could overflow. measureText scales linearly with the font size,
  // so a single measure of the natural size is enough to compute the fitted one.
  const desiredNameSize = name.length > 14 ? 72 : 96;
  const nameMaxW = CONTENT_R - CONTENT_L;
  ctx.font = `400 ${desiredNameSize}px ${fam.cover}`;
  const measuredNameW = ctx.measureText(name).width;
  const nameSize =
    measuredNameW > nameMaxW
      ? Math.max(40, Math.floor((desiredNameSize * nameMaxW) / measuredNameW))
      : desiredNameSize;
  ctx.font = `400 ${nameSize}px ${fam.cover}`;
  ctx.fillText(name, CONTENT_L, 290);
  ctx.restore();

  // Tier · seed · conference · mode line (Space Mono, flame dot separators).
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "0.04em";
  const parts: { text: string; color: string }[] = [];
  if (args.tier) parts.push({ text: `${args.tier}-TIER`, color: INK });
  parts.push({ text: `#${args.seed} ${args.conference.toUpperCase()}`, color: INK });
  parts.push({ text: (args.modeLabel ?? args.reachedLabel).toUpperCase(), color: MUTED });
  let mx = CONTENT_L;
  const metaY = 338;
  for (let i = 0; i < parts.length; i++) {
    ctx.fillStyle = parts[i].color;
    ctx.font = `700 20px ${fam.mono}`;
    ctx.fillText(parts[i].text, mx, metaY);
    mx += ctx.measureText(parts[i].text).width;
    if (i < parts.length - 1) {
      ctx.fillStyle = CORAL;
      ctx.font = `700 18px ${fam.mono}`;
      ctx.fillText(" · ", mx, metaY);
      mx += ctx.measureText(" · ").width;
    }
  }
  ctx.restore();

  // ---- Two-column records: reg season | playoffs (or bracket) --------------
  const recTop = 398;
  const midX = W / 2;
  const drawRecord = (
    leftX: number,
    title: string,
    w: number,
    l: number,
    winsColor: string,
    subtext?: string,
  ) => {
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    // Label.
    ctx.fillStyle = MUTED;
    ctx.letterSpacing = "0.2em";
    ctx.font = `600 15px ${fam.label}`;
    ctx.fillText(title, leftX, recTop);
    // W–L — Anton 88px.
    const ny = recTop + 92;
    ctx.letterSpacing = "-0.02em";
    ctx.font = `400 88px ${fam.cover}`;
    ctx.fillStyle = winsColor;
    const ws = `${w}`;
    ctx.fillText(ws, leftX, ny);
    const wW = ctx.measureText(ws).width;
    ctx.fillStyle = MUTED;
    ctx.font = `400 64px ${fam.cover}`;
    const dx = leftX + wW + 8;
    ctx.fillText("–", dx, ny);
    const dW = ctx.measureText("–").width;
    ctx.fillStyle = INK;
    ctx.font = `400 88px ${fam.cover}`;
    ctx.fillText(`${l}`, dx + dW + 8, ny);
    // Subtext.
    if (subtext) {
      ctx.fillStyle = MUTED;
      ctx.letterSpacing = "0.04em";
      ctx.font = `700 15px ${fam.mono}`;
      ctx.fillText(subtext, leftX, ny + 36);
    }
    ctx.restore();
  };

  // Vertical hairline between the two columns.
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(midX, recTop - 4);
  ctx.lineTo(midX, recTop + 132);
  ctx.stroke();

  drawRecord(CONTENT_L, "REG SEASON", args.regWins, args.regLosses, CORAL);
  drawRecord(
    midX + 40,
    isDaily ? "BRACKET" : "PLAYOFFS",
    args.playoffWins,
    args.playoffLosses,
    INK,
    args.reachedLabel,
  );

  // ---- Body: daily 9-stat grid (+ actual margin) OR the roster -------------
  const sectionTop = 560;
  if (isDaily && args.box) {
    const b = args.box;
    const cells: [string, string][] = [
      ["PTS", `${b.pts}`], ["REB", `${b.reb}`], ["AST", `${b.ast}`],
      ["STL", `${b.stl}`], ["BLK", `${b.blk}`], ["3PM", `${b.fg3m}`],
      ["FG%", `${b.fgPct}`], ["FT%", `${b.ftPct}`], ["TOV", `${b.tov}`],
    ];
    let tag: { text: string; color: string; font: "label" | "mono" } = {
      text: "NINE CATEGORIES",
      color: MUTED,
      font: "label",
    };
    if (typeof args.actualMargin === "number") {
      const m = args.actualMargin;
      tag = {
        text: `${m >= 0 ? "+" : "−"}${Math.abs(m).toFixed(1)} MARGIN (ACTUAL)`,
        color: m >= 0 ? TEAL : CORAL,
        font: "mono",
      };
    }
    const ruleY = drawSectionHeader(ctx, fam, "TEAM · PER GAME", tag, sectionTop);
    // A daily entry can win its bracket → leave room for the champion banner by
    // tightening the grid pitch when one will be drawn below.
    drawStatGrid(ctx, fam, cells, ruleY + 70, args.isChampion ? 100 : 118);
  } else {
    // Classic / Ranked: starters (captain [C]) + a SIXTH MAN divider + the bench.
    const ruleY = drawSectionHeader(
      ctx,
      fam,
      "THE ROSTER",
      { text: "STARTING FIVE", color: MUTED, font: "label" },
      sectionTop,
    );
    const hasSixth = !!args.sixthMan;
    // The roster band ends above the champion banner (y≈912 when present) or the
    // footer tick (≈966). Fit the starter pitch to the remaining height so the
    // sixth-man block + bench row always clear the chrome below.
    const bandBottom = args.isChampion ? 858 : 936;
    const reserveSixth = hasSixth ? 90 : 0; // divider (≈46) + bench row
    const firstY = ruleY + 46;
    const band = bandBottom - reserveSixth - firstY;
    const n = Math.max(args.roster.length, 1);
    const pitch = Math.min(64, Math.max(42, Math.floor(band / n)));
    let y = firstY;
    for (let i = 0; i < args.roster.length; i++) {
      const p = args.roster[i];
      const isLastStarter = i === args.roster.length - 1;
      y = drawRosterRow(
        ctx,
        fam,
        {
          teamSeason: `${p.team} '${String(p.season).slice(2)}`,
          name: p.name,
          captain: p.captain,
          pitch,
          // Keep a rule under the last starter only if a sixth-man block follows
          // (its own labeled divider takes over otherwise).
          last: isLastStarter && !hasSixth,
        },
        y,
      );
    }
    if (args.sixthMan) {
      // "SIXTH MAN" labeled divider.
      y += 6;
      ctx.save();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#9A8F79";
      ctx.letterSpacing = "0.22em";
      ctx.font = `600 13px ${fam.label}`;
      const lbl = "SIXTH MAN";
      ctx.fillText(lbl, CONTENT_L, y);
      const lblW = ctx.measureText(lbl).width + 13 * 0.22;
      ctx.strokeStyle = HAIRLINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(CONTENT_L + lblW + 14, y);
      ctx.lineTo(CONTENT_R, y);
      ctx.stroke();
      ctx.restore();
      y += 40;
      y = drawRosterRow(
        ctx,
        fam,
        {
          teamSeason: `${args.sixthMan.team} '${String(args.sixthMan.season).slice(2)}`,
          name: args.sixthMan.name,
          pitch: 56,
          last: true,
        },
        y,
      );
    }
  }

  // ---- Champion banner (yellow pill, hard ink shadow) ----------------------
  if (args.isChampion) {
    ctx.save();
    const txt = "TOURNAMENT CHAMPION";
    ctx.font = `700 36px ${fam.label}`;
    ctx.letterSpacing = "0.06em";
    const tw = ctx.measureText(txt).width + 36 * 0.06;
    const padX = 32;
    const bw = tw + padX * 2;
    const bh = 64;
    const bx = W / 2 - bw / 2;
    const by = H - 196; // sits above the footer tick (≈966), clear of the roster
    ctx.fillStyle = INK;
    ctx.fillRect(bx + 5, by + 5, bw, bh);
    ctx.fillStyle = YELLOW;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(txt, W / 2, by + bh / 2 + 1);
    ctx.restore();
  }

  drawFooter(ctx, fam);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
