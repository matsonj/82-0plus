"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSavedUser } from "@/lib/tournamentSession";
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

// The shared site header. Logo + an optional contextual right slot + a
// private-tournament indicator. `right` is for genuinely useful per-page context
// (e.g. the live Classic/Ranked badge while drafting) — not decorative pills.
export function GlobalHeader({ right }: { right?: React.ReactNode }) {
  const pathname = usePathname();
  // Don't link to "My Teams" from the My Teams page itself.
  const onMyTeams = pathname === "/tournament";
  const [notif, setNotif] = useState<NotifResponse | null>(null);
  const [open, setOpen] = useState(false);
  // Guards against overlapping polls (visibility + interval can fire together).
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    const user = getSavedUser();
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

  const pending = notif?.pending ?? [];
  const completed = notif?.completedUnviewed ?? [];
  const count = pending.length + completed.length;
  const any = !!notif?.any;

  return (
    <header className="relative z-20 flex items-center justify-between py-4 sm:py-5">
      <Link href="/" className="flex items-center gap-2">
        <span className="text-2xl" aria-hidden>
          🦆
        </span>
        <span className="font-display text-lg font-bold tracking-tight">
          82-0<span className="text-[var(--md-orange)]">+</span>
        </span>
      </Link>

      <div className="flex items-center gap-3">
        {right}
        {!onMyTeams && (
          <Link
            href="/tournament"
            className="font-display text-[11px] font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
          >
            My Teams
          </Link>
        )}

        {/* The indicator always renders. State is carried by the glyph's color,
            not a separate dot: a calm muted asterisk when there's nothing to
            attend to, a bold coral asterisk that pops when there is. A quiet
            bordered icon button — not a filled pill — so the header stays calm. */}
        <div className="relative">
          <button
            type="button"
            aria-label={
              any
                ? "Private tournament alerts (new activity)"
                : "Private tournament alerts"
            }
            onClick={() => setOpen((o) => !o)}
            className="relative flex h-8 w-8 items-center justify-center border-2 border-[var(--md-ink)] bg-[var(--md-white)] transition-transform hover:-translate-y-0.5"
            style={{ cursor: "pointer" }}
          >
            <span
              aria-hidden
              className="font-display leading-none transition-colors"
              style={{
                fontSize: 18,
                fontWeight: any ? 700 : 400,
                color: any ? "var(--md-coral)" : "var(--md-ink-muted)",
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
                  Private tournaments
                </span>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  className="font-display text-sm text-[var(--md-ink-muted)] hover:text-[var(--md-coral)]"
                >
                  ✕
                </button>
              </div>

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
          )}
        </div>
      </div>
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
