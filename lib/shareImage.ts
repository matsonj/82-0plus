import type { SimResult, SimRosterLine, BracketPlayer } from "./types";

// Draw a branded result card to a PNG (no deps). Square 1080 for share sheets.
// `isDaily` redacts the roster: in the Daily Challenge everyone plays the SAME five
// team/era rolls, so revealing which player you took from each slot spoils the
// puzzle. Daily cards instead show the team's nine aggregate category stats.
export async function buildShareImage(
  result: SimResult,
  roster: SimRosterLine[],
  label: string,
  isDaily = false,
): Promise<Blob | null> {
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  try {
    await document.fonts.ready;
  } catch {
    /* fonts best-effort */
  }

  const ink = "#383838";
  const paper = "#F4EFEA";
  const teal = "#16AA98";
  const coral = "#FF7169";
  const orange = "#A45916";
  const muted = "#818181";
  const mono = '"Space Mono", ui-monospace, monospace';
  const f = (px: number, weight = "bold") => `${weight} ${px}px ${mono}`;

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 10;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  ctx.textAlign = "center";
  ctx.fillStyle = ink;
  ctx.font = f(52);
  ctx.fillText("🦆 82-0+", W / 2, 130);

  ctx.font = f(30, "normal");
  ctx.fillStyle = muted;
  ctx.fillText(label.toUpperCase(), W / 2, 182);

  ctx.fillStyle = ink;
  ctx.font = f(200);
  ctx.fillText(`${result.wins}–${result.losses}`, W / 2, 400);

  ctx.font = f(42);
  ctx.fillStyle = result.netRating >= 0 ? teal : coral;
  ctx.fillText(
    `${result.netRating >= 0 ? "+" : ""}${result.netRating} ${isDaily ? "proj. margin" : "net"}`,
    W / 2,
    470,
  );

  let y = 540;
  if (result.perfect) {
    ctx.fillStyle = teal;
    ctx.font = f(40);
    ctx.fillText("🏆 PERFECT SEASON", W / 2, y);
    y += 60;
  }

  if (isDaily) {
    // Daily: hide the roster entirely, show the team's nine category totals in a
    // 3×3 grid so the card is rich without revealing any pick.
    const b = result.teamBox;
    const cells: [string, string][] = [
      ["PTS", `${b.pts}`], ["REB", `${b.reb}`], ["AST", `${b.ast}`],
      ["STL", `${b.stl}`], ["BLK", `${b.blk}`], ["3PM", `${b.fg3m}`],
      ["FG%", `${b.fgPct}`], ["FT%", `${b.ftPct}`], ["TOV", `${b.tov}`],
    ];
    ctx.textAlign = "center";
    ctx.fillStyle = muted;
    ctx.font = f(28, "normal");
    ctx.fillText("TEAM · PER GAME", W / 2, y + 6);
    y += 70;
    const cols = 3;
    const colW = (W - 220) / cols;
    for (let i = 0; i < cells.length; i++) {
      const [lbl, val] = cells[i];
      const cx = 110 + colW * (i % cols) + colW / 2;
      const ry = y + Math.floor(i / cols) * 118;
      ctx.fillStyle = ink;
      ctx.font = f(58);
      ctx.fillText(val, cx, ry);
      ctx.fillStyle = muted;
      ctx.font = f(26, "normal");
      ctx.fillText(lbl, cx, ry + 36);
    }
  } else {
    // Roster
    ctx.textAlign = "left";
    ctx.font = f(34, "normal");
    for (const r of roster) {
      ctx.fillStyle = orange;
      ctx.fillText(`${r.team} '${String(r.best_season).slice(2)}`, 110, y);
      ctx.fillStyle = ink;
      const name =
        r.player_name.length > 22
          ? r.player_name.slice(0, 21) + "…"
          : r.player_name;
      ctx.fillText(name, 290, y);
      ctx.textAlign = "right";
      ctx.fillStyle = muted;
      ctx.fillText(`${r.pts}/${r.reb}/${r.ast}`, W - 110, y);
      ctx.textAlign = "left";
      y += 66;
    }
  }

  ctx.textAlign = "center";
  ctx.fillStyle = muted;
  ctx.font = f(34, "normal");
  ctx.fillText("82-0plus.vercel.app", W / 2, H - 70);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/** A tournament result card: team name, reg-season + playoff records, the five
 *  (captain flagged) and the sixth man. Square 1080 PNG, same branded style. */
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
  tier?: string; // S / AA / A / B / C / D — omitted if ineligible (and for daily, which is tier-less)
  modeLabel?: string; // which tournament — "DAILY 06-05-26" / "CLASSIC" / "RANKED"
  roster: BracketPlayer[];
  sixthMan?: BracketPlayer;
  // Daily cards reveal nothing about the picks: pass the team's 9 category stats +
  // the ACTUAL playoff scoring margin instead of the roster.
  box?: { pts: number; reb: number; ast: number; stl: number; blk: number; fgPct: number; ftPct: number; tov: number; fg3m: number };
  actualMargin?: number;
}): Promise<Blob | null> {
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    await document.fonts.ready;
  } catch {
    /* fonts best-effort */
  }

  const ink = "#383838";
  const paper = "#F4EFEA";
  const teal = "#16AA98";
  const yellow = "#FFDE00";
  const orange = "#A45916";
  const muted = "#818181";
  const mono = '"Space Mono", ui-monospace, monospace';
  const f = (px: number, weight = "bold") => `${weight} ${px}px ${mono}`;

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 10;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  ctx.textAlign = "center";
  ctx.fillStyle = ink;
  ctx.font = f(46);
  ctx.fillText("🦆 82-0+ TOURNAMENT", W / 2, 120);

  // Team name (clamp size to fit).
  const name = args.teamName.toUpperCase();
  ctx.font = f(name.length > 12 ? 64 : 84);
  ctx.fillStyle = ink;
  ctx.fillText(name, W / 2, 230);

  // Tier · seed · conference · which tournament. (Champion status is shown by
  // the trophy banner / playoff record, so the mode goes here, not "CHAMPION".)
  ctx.font = f(34, "normal");
  ctx.fillStyle = args.isChampion ? teal : muted;
  const tierPrefix = args.tier ? `${args.tier}-TIER · ` : "";
  const tail = (args.modeLabel ?? args.reachedLabel).toUpperCase();
  ctx.fillText(
    `${tierPrefix}#${args.seed} ${args.conference.toUpperCase()} · ${tail}`,
    W / 2,
    288,
  );

  // Records: reg season + playoffs, side by side.
  const colL = W * 0.3;
  const colR = W * 0.7;
  ctx.font = f(26, "normal");
  ctx.fillStyle = muted;
  ctx.fillText("REG SEASON", colL, 372);
  ctx.fillText("PLAYOFFS", colR, 372);
  ctx.font = f(72);
  ctx.fillStyle = ink;
  ctx.fillText(`${args.regWins}–${args.regLosses}`, colL, 446);
  ctx.fillText(`${args.playoffWins}–${args.playoffLosses}`, colR, 446);

  if (args.box) {
    // Daily: NEVER reveal the picks. Show the team's nine category stats + the
    // ACTUAL playoff scoring margin in their place. Even vertical rhythm: a rule
    // under the records, an aligned header row, then a balanced 3×3 grid.
    const b = args.box;

    // Divider between the records and the team stats.
    ctx.strokeStyle = "#E1D6CB"; // paper-3
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(110, 512);
    ctx.lineTo(W - 110, 512);
    ctx.stroke();

    // Header row: section label (left) + actual margin (right), shared baseline.
    const headY = 560;
    ctx.textAlign = "left";
    ctx.fillStyle = muted;
    ctx.font = f(28, "normal");
    ctx.fillText("TEAM · PER GAME", 110, headY);
    if (typeof args.actualMargin === "number") {
      const m = args.actualMargin;
      ctx.textAlign = "right";
      ctx.fillStyle = m >= 0 ? teal : "#FF7169";
      ctx.font = f(28);
      ctx.fillText(`${m >= 0 ? "+" : ""}${m.toFixed(1)} margin (actual)`, W - 110, headY);
    }

    const cells: [string, string][] = [
      ["PTS", `${b.pts}`], ["REB", `${b.reb}`], ["AST", `${b.ast}`],
      ["STL", `${b.stl}`], ["BLK", `${b.blk}`], ["3PM", `${b.fg3m}`],
      ["FG%", `${b.fgPct}`], ["FT%", `${b.ftPct}`], ["TOV", `${b.tov}`],
    ];
    ctx.textAlign = "center";
    const cols = 3;
    const colW = (W - 220) / cols;
    const top = 648; // value baseline of the first row
    // Whatever sits below the grid sets the floor: the champion banner (top at
    // H-152) when present, otherwise just the footer (H-56). Shrink the row pitch
    // so the last row's label (top + 2*rowH + 40) always clears it with a gap —
    // a fixed 132 made the third row collide with the TOURNAMENT CHAMPION banner.
    const bottomGuard = args.isChampion ? H - 152 : H - 56;
    const rowH = Math.min(132, Math.floor((bottomGuard - 80 - top) / 2));
    for (let i = 0; i < cells.length; i++) {
      const [lbl, val] = cells[i];
      const cx = 110 + colW * (i % cols) + colW / 2;
      const ry = top + Math.floor(i / cols) * rowH;
      ctx.fillStyle = ink;
      ctx.font = f(60);
      ctx.fillText(val, cx, ry);
      ctx.fillStyle = muted;
      ctx.font = f(26, "normal");
      ctx.fillText(lbl, cx, ry + 40);
    }
  } else {
    // Roster — five starters, captain flagged with a [C] pill, then the sixth man.
    let y = 560;
    ctx.font = f(26, "normal");
    ctx.fillStyle = muted;
    ctx.textAlign = "left";
    ctx.fillText("STARTERS", 110, y - 48);
    ctx.font = f(34, "normal");
    for (const p of args.roster) {
      ctx.fillStyle = orange;
      ctx.fillText(`${p.team} '${String(p.season).slice(2)}`, 110, y);
      ctx.fillStyle = ink;
      const nm = p.name.length > 24 ? p.name.slice(0, 23) + "…" : p.name;
      ctx.fillText(nm, 290, y);
      if (p.captain) {
        const nameWidth = ctx.measureText(nm).width;
        const px = 290 + nameWidth + 16;
        const pw = 30;
        const ph = 30;
        const py = y - 26;
        ctx.fillStyle = yellow;
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 3;
        ctx.strokeRect(px, py, pw, ph);
        ctx.fillStyle = ink;
        ctx.font = f(20);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("C", px + pw / 2, py + ph / 2 + 1);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.font = f(34, "normal");
      }
      y += 60;
    }
    if (args.sixthMan) {
      y += 8;
      ctx.fillStyle = muted;
      ctx.font = f(26, "normal");
      ctx.fillText("SIXTH MAN", 110, y);
      y += 44;
      ctx.fillStyle = orange;
      ctx.font = f(34, "normal");
      ctx.fillText(`${args.sixthMan.team} '${String(args.sixthMan.season).slice(2)}`, 110, y);
      ctx.fillStyle = ink;
      ctx.fillText(args.sixthMan.name, 290, y);
    }
  }

  if (args.isChampion) {
    // Champion banner near the bottom — size the box to the TEXT (was a fixed
    // 460px that the label overflowed).
    const label = "🏆 TOURNAMENT CHAMPION";
    ctx.font = f(40);
    const textW = ctx.measureText(label).width;
    const padX = 28;
    const boxW = textW + padX * 2;
    const boxH = 64;
    const boxX = W / 2 - boxW / 2;
    const boxY = H - 152;
    ctx.fillStyle = yellow;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4;
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = ink;
    ctx.fillText(label, W / 2, boxY + boxH / 2);
    ctx.textBaseline = "alphabetic"; // restore for the footer
  }

  ctx.textAlign = "center";
  ctx.fillStyle = muted;
  ctx.font = f(30, "normal");
  ctx.fillText("82-0plus.vercel.app", W / 2, H - 56);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
