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

  // Seed · conference · how far (champion glows teal).
  ctx.font = f(34, "normal");
  ctx.fillStyle = args.isChampion ? teal : muted;
  ctx.fillText(
    `#${args.seed} ${args.conference.toUpperCase()} · ${args.reachedLabel.toUpperCase()}`,
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

  // Roster — five starters, captain flagged with ★C.
  let y = 560;
  ctx.font = f(26, "normal");
  ctx.fillStyle = muted;
  ctx.textAlign = "left";
  ctx.fillText("STARTERS", 110, y - 28);
  ctx.font = f(34, "normal");
  for (const p of args.roster) {
    ctx.fillStyle = orange;
    ctx.fillText(`${p.team} '${String(p.season).slice(2)}`, 110, y);
    ctx.fillStyle = ink;
    const nm = p.name.length > 24 ? p.name.slice(0, 23) + "…" : p.name;
    ctx.fillText(nm, 290, y);
    if (p.captain) {
      ctx.fillStyle = ink;
      ctx.font = f(22);
      ctx.fillText("★ CAPTAIN", 290 + ctx.measureText(nm).width + 24, y);
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
    ctx.textAlign = "center";
    ctx.fillStyle = ink;
    ctx.font = f(40);
    // a small champion banner near the bottom
    ctx.fillStyle = yellow;
    ctx.fillRect(W / 2 - 230, H - 150, 460, 60);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4;
    ctx.strokeRect(W / 2 - 230, H - 150, 460, 60);
    ctx.fillStyle = ink;
    ctx.fillText("🏆 TOURNAMENT CHAMPION", W / 2, H - 108);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = muted;
  ctx.font = f(30, "normal");
  ctx.fillText("82-0plus.vercel.app", W / 2, H - 56);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
