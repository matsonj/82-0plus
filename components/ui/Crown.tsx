import type { CSSProperties } from "react";

/**
 * The single champion-crown renderer for the whole app (issue #115). Two
 * structural variants, since the SVG mark and the plain-text glyph render too
 * differently to unify into one DOM shape without changing a surface's look:
 *
 *  - "svg" (default): the filled crown mark used at the bracket terminus
 *    (desktop + mobile) and the private-tournament standings header. Same
 *    path data everywhere — only `size` and `color` (fill) vary per caller.
 *  - "glyph": the ♛ Unicode character used inline in leaderboard / lookup
 *    rows. `size`/`color` are optional so a caller that relied on inherited
 *    text color/size (no inline style at all) keeps doing so — passing
 *    neither reproduces a bare `<span>♛</span>` exactly.
 */
export function Crown({
  variant = "svg",
  size,
  color,
  className,
  style,
}: {
  variant?: "svg" | "glyph";
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}) {
  if (variant === "glyph") {
    const glyphStyle: CSSProperties = {
      ...(color !== undefined ? { color } : {}),
      ...(size !== undefined ? { fontSize: size } : {}),
      ...style,
    };
    const hasStyle = Object.keys(glyphStyle).length > 0;
    return (
      <span className={className} style={hasStyle ? glyphStyle : undefined}>
        ♛
      </span>
    );
  }

  const s = size ?? 20;
  const fill = color ?? "var(--md-ink)";
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <path d="M3 7L7 11L12 4L17 11L21 7L19.5 19H4.5L3 7Z" fill={fill} />
      <rect x="4.5" y="19.5" width="15" height="2.2" fill={fill} />
    </svg>
  );
}
