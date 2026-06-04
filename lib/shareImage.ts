import type { SimResult, SimRosterLine } from "./types";

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
