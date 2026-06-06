import type { SimResult, SimRosterLine, BracketPlayer } from "./types";

// Draw a branded result card to a PNG (no deps). Square 1080 for share sheets.
export async function buildShareImage(
  result: SimResult,
  roster: SimRosterLine[],
  label: string,
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
    `${result.netRating >= 0 ? "+" : ""}${result.netRating} net`,
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
  tier?: string; // S / AA / A / B / C / D — omitted if ineligible
  modeLabel?: string; // which tournament — "DAILY 06-05-26" / "CLASSIC" / "HOOPIQ"
  roster: BracketPlayer[];
  sixthMan?: BracketPlayer;
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

  // Roster — five starters, captain flagged with a ★ CAPTAIN badge.
  let y = 560;
  ctx.font = f(26, "normal");
  ctx.fillStyle = muted;
  ctx.textAlign = "left";
  // Lift the section label well clear of the first row (was a cramped 28px gap).
  ctx.fillText("STARTERS", 110, y - 48);
  ctx.font = f(34, "normal");
  for (const p of args.roster) {
    ctx.fillStyle = orange;
    ctx.fillText(`${p.team} '${String(p.season).slice(2)}`, 110, y);
    ctx.fillStyle = ink;
    const nm = p.name.length > 24 ? p.name.slice(0, 23) + "…" : p.name;
    ctx.fillText(nm, 290, y);
    if (p.captain) {
      // Measure the NAME at its own font (34) before switching to the badge
      // font — otherwise the badge gets placed using the smaller font's width
      // and lands on top of the end of the name.
      const nameWidth = ctx.measureText(nm).width;
      ctx.font = f(22);
      ctx.fillStyle = ink;
      ctx.fillText("★ CAPTAIN", 290 + nameWidth + 24, y);
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
    ctx.fillText(
      `${args.sixthMan.team} '${String(args.sixthMan.season).slice(2)}`,
      110,
      y,
    );
    ctx.fillStyle = ink;
    ctx.fillText(args.sixthMan.name, 290, y);
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
