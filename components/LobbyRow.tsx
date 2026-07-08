import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

// Shared shell for the tournament-lobby lists. The My-Teams rows
// (TeamRow / TeamCard) and the private-lobby rows (PrivateRowDesktop /
// PrivateCardMobile) are the same shape: a leading crown/status lane, a
// name + subtitle block, the "run" stat lanes, and a right-hand stamp.
//
// These are FIXED semantic slots — callers supply slot CONTENT only, never
// layout/styling. The one meaningful visual variation is the mine/attention
// highlight, expressed as a semantic `highlight` prop rather than a style
// escape hatch. Desktop rows (`hidden md:block`) and mobile cards
// (`md:hidden`) never render together, and the My-Teams vs private lists live
// on separate tabs, so both families share one canonical layout.

export type LobbyHighlight = "none" | "champion" | "cloaked";

const ROW_STYLE: Record<LobbyHighlight, CSSProperties | undefined> = {
  none: undefined,
  champion: { background: "var(--md-paper-2)" },
  cloaked: {
    borderLeft: "3px solid var(--md-coral)",
    background: "color-mix(in srgb, var(--md-coral) 6%, transparent)",
  },
};

const CARD_STYLE: Record<LobbyHighlight, CSSProperties | undefined> = {
  none: undefined,
  champion: { borderColor: "var(--md-yellow)", boxShadow: "4px 4px 0 0 var(--md-yellow)" },
  cloaked: { borderColor: "var(--md-coral)", boxShadow: "4px 4px 0 0 var(--md-coral)" },
};

// Discriminated union: a row/card is either a Link (private lobby, navigates)
// or a button (My-Teams, opens a bracket in place).
type Interaction = { href: string } | { onClick: () => void; disabled?: boolean };

// ── Desktop row ───────────────────────────────────────────────────────────────
interface LobbyRowSlots {
  highlight?: LobbyHighlight;
  /** Crown / unread-dot lane (fixed 20px). */
  leading?: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  /** The stat lanes ("THE RUN" / PLAYOFF + OUTCOME), pre-composed by the caller. */
  run: ReactNode;
  /** Right-hand stamp / CTA column. */
  stamp: ReactNode;
}

const ROW_CLASS =
  "group flex w-full items-center gap-4 border-b border-[var(--md-paper-3)] px-4 py-3 text-left transition-colors hover:bg-[var(--md-paper-2)]";

export function LobbyRow(props: LobbyRowSlots & Interaction) {
  const { highlight = "none", leading, title, subtitle, run, stamp } = props;
  const body = (
    <>
      <span className="w-5 shrink-0 text-center">{leading}</span>
      <span className="flex min-w-0 flex-[2] flex-col">
        <span
          className="font-archivo truncate leading-tight"
          style={{ fontSize: 15, fontWeight: 800, fontVariationSettings: '"wdth" 100' }}
        >
          {title}
        </span>
        <span className="font-byline text-[11px] text-[var(--md-ink-muted)]">{subtitle}</span>
      </span>
      {run}
      {stamp}
    </>
  );
  if ("href" in props) {
    return (
      <Link href={props.href} className={ROW_CLASS} style={ROW_STYLE[highlight]}>
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={`${ROW_CLASS} disabled:opacity-60`}
      style={ROW_STYLE[highlight]}
    >
      {body}
    </button>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────
interface LobbyCardSlots {
  highlight?: LobbyHighlight;
  leading?: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  /** Right-hand stamp column in the header. */
  stamp: ReactNode;
  /** Card body below the header (record band + outcome footer). */
  children: ReactNode;
}

// Hand-rolled `.md-card` (not <Card>) is JUSTIFIED here: this element IS the
// interactive Link/button root, and <Card> renders its own div — nesting a div
// inside a button/anchor when the button/anchor itself needs the card chrome
// isn't an option, so the class is applied directly to the interactive tag.
const CARD_CLASS =
  "md-card w-full overflow-hidden p-0 text-left transition-transform hover:translate-x-[-2px] hover:translate-y-[-2px]";

function LobbyCardBody({ leading, title, subtitle, stamp, children }: Omit<LobbyCardSlots, "highlight">) {
  return (
    <>
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {leading}
            <span
              className="font-archivo truncate leading-tight"
              style={{ fontSize: 16, fontWeight: 800, fontVariationSettings: '"wdth" 100' }}
            >
              {title}
            </span>
          </div>
          <div className="mt-0.5 font-byline text-[11px] text-[var(--md-ink-muted)]">{subtitle}</div>
        </div>
        {stamp}
      </div>
      {children}
    </>
  );
}

export function LobbyCard(props: LobbyCardSlots & Interaction) {
  const { highlight = "none" } = props;
  if ("href" in props) {
    return (
      <Link href={props.href} className={CARD_CLASS} style={CARD_STYLE[highlight]}>
        <LobbyCardBody {...props} />
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={`${CARD_CLASS} disabled:opacity-60`}
      style={CARD_STYLE[highlight]}
    >
      <LobbyCardBody {...props} />
    </button>
  );
}
