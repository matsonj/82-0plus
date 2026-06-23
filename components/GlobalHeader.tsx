"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSavedUser, subscribeSession } from "@/lib/tournamentSession";
import {
  privateModeLabel,
  formatPrivateEntryStatus,
} from "@/lib/tournamentLabels";
import type { PrivateMode } from "@/lib/privateTournament";

// One private-tournament summary as returned by /api/private-tournament/notifications.
interface NotifSummary {
  tournamentId: string;
  tournamentName: string;
  status: string;
  mode: string;
  size: number;
  expiresAt: string;
  entryStatus: string;
  championName: string | null;
}

interface NotifResponse {
  pending: NotifSummary[];
  completedUnviewed: NotifSummary[];
  any: boolean;
}

// Re-poll the badge feed at this cadence while the tab is open (light — the
// feed is cheap and a stale-by-a-minute dot is fine).
const POLL_MS = 60_000;

// A one-off "what's new" note surfaced in the alerts panel. It pops the bell and
// shows for any visitor who hasn't seen it yet — until they OPEN the panel (which
// marks it seen) OR until it expires, whichever comes first. Bump `id` for the
// next changelog; the old localStorage key is then naturally ignored.
const CHANGELOG = {
  id: "2026-06-22-team-codes",
  label: "Changelog · 6/22/2026",
  text: "Fixed historical team codes — relocated franchises now show their era-correct team (e.g. Vancouver Grizzlies as VAN, Minneapolis Lakers as MNL, the original Charlotte Hornets as CHH).",
  // 7 days after publish, at Pacific midnight (≈ 2026-06-29 07:00 UTC). After
  // this it never shows again, even for someone who never opened the panel.
  expires: Date.parse("2026-06-29T07:00:00Z"),
} as const;
const CHANGELOG_KEY = `changelog-seen:${CHANGELOG.id}`;

// The shared site header. Logo + an optional contextual right slot + a
// private-tournament indicator. `right` is for genuinely useful per-page context
// (e.g. the live Classic/Ranked badge while drafting) — not decorative pills.
export function GlobalHeader({
  right,
  onSignIn,
  onHowToPlay,
}: {
  right?: React.ReactNode;
  // Home wires these to its local modals; other pages omit them and the
  // masthead falls back to a plain Home link (see below).
  onSignIn?: () => void;
  onHowToPlay?: () => void;
}) {
  const pathname = usePathname();
  // "My Teams" stays in the nav even on its own page (a stable masthead reads
  // better than a link that vanishes when you land there) — just flagged as the
  // current page for a11y.
  const onMyTeams = pathname === "/tournament";
  const [notif, setNotif] = useState<NotifResponse | null>(null);
  // The signed-in identity drives the masthead's Sign In vs. name chip. Read
  // client-side only (localStorage) so the first render stays hydration-safe.
  const [user, setUser] = useState<{ username: string; pin: string } | null>(null);
  const [open, setOpen] = useState(false);
  // Mobile nav: the desktop link row is hidden below sm, so a hamburger exposes
  // My Teams / How to Play / Player Cards on small screens.
  const [menuOpen, setMenuOpen] = useState(false);
  // Changelog: `unread` pops the bell + survives reloads (localStorage); `viewing`
  // keeps the note rendered for the session in which it was first opened, so it
  // doesn't vanish the instant the panel opens.
  const [changelogUnread, setChangelogUnread] = useState(false);
  const [changelogViewing, setChangelogViewing] = useState(false);
  // Guards against overlapping polls (visibility + interval can fire together).
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    const user = getSavedUser();
    setUser(user);
    if (!user) {
      setNotif(null);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/private-tournament/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: user.username, pin: user.pin }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as NotifResponse;
      setNotif(data);
    } catch {
      /* a missed poll is harmless — the next one self-heals */
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Poll on mount, when the tab becomes visible again, and on a light interval.
  useEffect(() => {
    void poll();
    const onVis = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(id);
    };
  }, [poll]);

  // Update the masthead the instant the session changes (sign-in / log-out in
  // this tab, or another tab) — re-polling refreshes the name chip and alerts.
  useEffect(() => subscribeSession(() => void poll()), [poll]);

  // Surface the changelog on mount for anyone who hasn't seen it and isn't past
  // the 7-day window. Reads localStorage, so it runs client-side only.
  useEffect(() => {
    try {
      if (!localStorage.getItem(CHANGELOG_KEY) && Date.now() < CHANGELOG.expires) {
        setChangelogUnread(true);
      }
    } catch {
      /* localStorage unavailable (private mode) — just skip the changelog */
    }
  }, []);

  // Opening the panel counts as "seeing" the changelog: persist it (so it never
  // pops again) but keep it visible for this open session.
  const openPanel = useCallback(() => {
    setOpen(true);
    if (changelogUnread) {
      setChangelogViewing(true);
      setChangelogUnread(false);
      try {
        localStorage.setItem(CHANGELOG_KEY, "1");
      } catch {
        /* ignore */
      }
    }
  }, [changelogUnread]);
  const closePanel = useCallback(() => {
    setOpen(false);
    setChangelogViewing(false);
  }, []);

  const pending = notif?.pending ?? [];
  const completed = notif?.completedUnviewed ?? [];
  const count = pending.length + completed.length;
  const any = !!notif?.any;
  // The bell pops for private activity OR an unseen changelog.
  const pop = any || changelogUnread;

  // Shared masthead nav-link treatment (Oswald caps on ink).
  const navCls =
    "font-cond text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--md-paper)] transition-colors hover:text-[var(--md-coral)]";
  // Mobile menu row — full-width tap target, hairline-divided.
  const mobileLinkCls =
    "block border-b border-[#3a322a] py-3 text-left font-cond text-[15px] font-semibold uppercase tracking-[0.12em] text-[var(--md-paper)] transition-colors hover:text-[var(--md-coral)]";
  // Mobile menu rows (order mirrors the desktop nav). Sign In folds in here too —
  // the standalone chip/button is hidden below sm so the bar stays uncluttered.
  const menuItems: { label: string; href?: string; action?: () => void }[] = [
    { label: "My Teams", href: "/tournament" },
    onHowToPlay
      ? { label: "How to Play", action: onHowToPlay }
      : { label: "How to Play", href: "/?howto=1" },
    { label: "Player Cards", href: "/cards" },
    ...(!user
      ? [onSignIn ? { label: "Sign In", action: onSignIn } : { label: "Sign In", href: "/" }]
      : []),
  ];

  return (
    // Full-bleed ink masthead: breaks out of the page container to the viewport
    // edges, then re-centers its content to align with the page below.
    <header
      className="relative z-30 mb-6 bg-[var(--md-ink)] text-[var(--md-paper)] sm:mb-8"
      style={{ width: "100vw", marginLeft: "calc(50% - 50vw)" }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        {/* Wordmark lockup: DAILY (ink) + 82 (flame), cream box, flame offset. */}
        <Link href="/" aria-label="daily82 home" className="flex shrink-0">
          <span
            className="flex border-[2.5px] border-[var(--md-paper)]"
            style={{ boxShadow: "5px 5px 0 0 var(--md-coral)" }}
          >
            <span className="flex items-center bg-[var(--md-ink)] py-[5px] pl-[14px] pr-[11px]">
              <span
                className="font-archivo leading-none text-[var(--md-paper)]"
                style={{ fontSize: 26, fontWeight: 900, fontVariationSettings: '"wdth" 125', letterSpacing: "-0.01em" }}
              >
                DAILY
              </span>
            </span>
            <span className="flex items-center bg-[var(--md-coral)] py-[5px] pl-[11px] pr-[12px]">
              <span
                className="font-archivo leading-none text-[var(--md-paper)]"
                style={{ fontSize: 26, fontWeight: 900, fontVariationSettings: '"wdth" 125', letterSpacing: "-0.02em" }}
              >
                82
              </span>
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-3 sm:gap-6">
          <nav className="hidden items-center gap-6 sm:flex">
            <Link
              href="/tournament"
              aria-current={onMyTeams ? "page" : undefined}
              className={navCls}
            >
              My Teams
            </Link>
            {onHowToPlay ? (
              <button type="button" onClick={onHowToPlay} className={navCls} style={{ cursor: "pointer" }}>
                How to Play
              </button>
            ) : (
              <Link href="/?howto=1" className={navCls}>
                How to Play
              </Link>
            )}
            <Link href="/cards" className={navCls}>
              Player Cards
            </Link>
          </nav>

          {right}

          <span className="hidden h-6 w-px bg-[#3a322a] sm:block" />

          {/* Alerts: a press-yellow star at rest, flame when there's activity. */}
          <div className="relative">
            <button
              type="button"
              aria-label={pop ? "Alerts (new activity)" : "Alerts"}
              onClick={() => (open ? closePanel() : openPanel())}
              className="relative flex h-10 w-10 items-center justify-center border-2 border-[#3a322a] bg-[var(--md-ink-2)] transition-transform hover:-translate-y-0.5"
              style={{ cursor: "pointer" }}
            >
              <span
                aria-hidden
                className="font-display leading-none transition-colors"
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: pop ? "var(--md-coral)" : "var(--md-yellow)",
                }}
              >
                ✶
              </span>
            </button>

          {open && (
            <div
              className="md-card md-card--lift absolute right-0 z-30 mt-2 w-72 p-3 text-left"
              style={{ background: "var(--md-white)" }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                  Alerts
                </span>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={closePanel}
                  className="font-display text-sm text-[var(--md-ink-muted)] hover:text-[var(--md-coral)]"
                >
                  ✕
                </button>
              </div>

              {changelogViewing && (
                <div
                  className="md-card mb-2 flex flex-col gap-0.5 p-2"
                  style={{ background: "var(--md-paper-2)" }}
                >
                  <span className="font-display text-[10px] font-bold uppercase tracking-wide text-[var(--md-blue)]">
                    {CHANGELOG.label}
                  </span>
                  <span className="text-[12px] leading-snug text-[var(--md-ink)]">
                    {CHANGELOG.text}
                  </span>
                </div>
              )}

              <span className="font-display text-[10px] font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                Private tournaments
              </span>
              <div className="mt-1">
                {!getSavedUser() ? (
                  <p className="text-[12px] text-[var(--md-ink-muted)]">
                    Enter a private tournament to see alerts here.
                  </p>
                ) : count === 0 ? (
                  <p className="text-[12px] text-[var(--md-ink-muted)]">
                    Nothing needs your attention right now.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {pending.map((t) => (
                      <NotifRow key={t.tournamentId} t={t} kind="pending" />
                    ))}
                    {completed.map((t) => (
                      <NotifRow key={t.tournamentId} t={t} kind="completed" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          </div>

          {user ? (
            <Link
              href="/tournament"
              title="Your teams"
              className="hidden max-w-[140px] truncate border-2 border-[var(--md-paper)] bg-[var(--md-paper)] px-3 py-2 font-cond text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--md-ink)] transition-colors hover:border-[var(--md-coral)] hover:bg-[var(--md-coral)] hover:text-[var(--md-paper)] sm:inline-block"
            >
              {user.username}
            </Link>
          ) : onSignIn ? (
            <button
              type="button"
              onClick={onSignIn}
              style={{ cursor: "pointer" }}
              className="hidden border-2 border-[var(--md-paper)] bg-[var(--md-paper)] px-4 py-2 font-cond text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--md-ink)] transition-colors hover:border-[var(--md-coral)] hover:bg-[var(--md-coral)] hover:text-[var(--md-paper)] sm:inline-block"
            >
              Sign In
            </button>
          ) : (
            <Link
              href="/"
              className="hidden border-2 border-[var(--md-paper)] bg-[var(--md-paper)] px-4 py-2 font-cond text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--md-ink)] transition-colors hover:border-[var(--md-coral)] hover:bg-[var(--md-coral)] hover:text-[var(--md-paper)] sm:inline-block"
            >
              Sign In
            </Link>
          )}

          {/* Mobile menu toggle — exposes the link row that's hidden below sm. */}
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-[#3a322a] bg-[var(--md-ink-2)] transition-transform hover:-translate-y-0.5 sm:hidden"
            style={{ cursor: "pointer" }}
          >
            {menuOpen ? (
              <span aria-hidden className="font-cond text-[18px] font-bold leading-none text-[var(--md-paper)]">
                ✕
              </span>
            ) : (
              <span aria-hidden className="flex flex-col gap-[3px]">
                <span className="block h-[2px] w-[18px] bg-[var(--md-paper)]" />
                <span className="block h-[2px] w-[18px] bg-[var(--md-paper)]" />
                <span className="block h-[2px] w-[18px] bg-[var(--md-paper)]" />
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Mobile nav sheet — full-bleed ink panel under the masthead, flame top rule. */}
      {menuOpen && (
        <nav className="absolute left-0 right-0 top-full z-40 border-t-2 border-[var(--md-coral)] bg-[var(--md-ink)] sm:hidden">
          <div className="mx-auto flex max-w-6xl flex-col px-4 py-1">
            {menuItems.map((it, i) => {
              const cls = `${mobileLinkCls} w-full ${i === menuItems.length - 1 ? "border-b-0" : ""}`;
              return it.href ? (
                <Link key={it.label} href={it.href} onClick={() => setMenuOpen(false)} className={cls}>
                  {it.label}
                </Link>
              ) : (
                <button
                  key={it.label}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    it.action?.();
                  }}
                  className={cls}
                  style={{ cursor: "pointer" }}
                >
                  {it.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}

function NotifRow({
  t,
  kind,
}: {
  t: NotifSummary;
  kind: "pending" | "completed";
}) {
  const label = privateModeLabel(t.mode as PrivateMode);
  return (
    <Link
      href={`/p/${t.tournamentId}`}
      className="md-card flex flex-col gap-0.5 p-2 transition-transform hover:translate-x-[-1px] hover:translate-y-[-1px]"
      style={{ background: "var(--md-paper-2)" }}
    >
      <span className="font-display text-[13px] font-bold leading-tight break-words">
        {t.tournamentName}
      </span>
      <span className="font-display text-[10px] uppercase tracking-wide text-[var(--md-ink-muted)]">
        {label} ·{" "}
        {kind === "completed"
          ? t.championName
            ? `🏆 ${t.championName}`
            : "Final ready"
          : formatPrivateEntryStatus(t.entryStatus)}
      </span>
    </Link>
  );
}
