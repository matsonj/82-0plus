"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  validateName,
  validatePin,
  NAME_MAX_LEN,
} from "@/lib/tournamentValidation";
import { getSavedUser, saveUser } from "@/lib/tournamentSession";
import {
  PRIVATE_SIZES,
  type PrivateMode,
  type PrivateSize,
  type PrivateBoardMode,
} from "@/lib/privateTournament";
import { copyText } from "@/lib/copyText";
import { SITE_URL } from "@/lib/site";

// A single manual board slot the admin is filling: a decade (from /api/decades)
// + a team chosen from /api/private-tournament/teams?decade=. Distinctness +
// per-decade cap are checked client-side for instant feedback; the server
// re-validates playability.
interface ManualSlot {
  team: string;
  decade: number | null;
}

const MAX_PER_DECADE = 2;

// Client mirror of validateManualBoard (lib/privateBoard.ts) for instant form
// feedback. Returns null when the six are legal, else a short reason.
function manualReason(slots: ManualSlot[]): string | null {
  if (slots.some((s) => !s.team || s.decade === null)) {
    return "every slot needs a decade and a team";
  }
  const teams = new Set(slots.map((s) => s.team));
  if (teams.size !== slots.length) return "six distinct teams — no repeats";
  const per = new Map<number, number>();
  for (const s of slots) {
    const n = (per.get(s.decade!) ?? 0) + 1;
    per.set(s.decade!, n);
    if (n > MAX_PER_DECADE) return "a decade can appear at most twice";
  }
  return null;
}

export function PrivateTournamentCreate({
  onCancel,
}: {
  onCancel?: () => void;
}) {
  // Admin account — the signed-in user who hosts the tournament. Prefilled from
  // the saved session; if none, the admin must enter their account creds.
  const [adminName, setAdminName] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [hasSaved, setHasSaved] = useState(false);

  // The tournament's OWN identity (distinct from the admin account). A name may
  // repeat across tournaments as long as the PIN differs.
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");

  // Tournament options.
  const [mode, setMode] = useState<PrivateMode>("hoopiq");
  const [size, setSize] = useState<PrivateSize>(8);
  const [boardMode, setBoardMode] = useState<PrivateBoardMode>("blind");

  // Manual board picker.
  const [decades, setDecades] = useState<number[]>([]);
  const [slots, setSlots] = useState<ManualSlot[]>(
    Array.from({ length: 6 }, () => ({ team: "", decade: null })),
  );
  // Cache of teams-per-decade so each slot's team dropdown can populate without
  // refetching a decade we already loaded.
  const [teamsByDecade, setTeamsByDecade] = useState<Record<number, string[]>>(
    {},
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    tournamentId: string;
    shareUrl: string;
  } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Restore the admin's saved account on mount.
  useEffect(() => {
    const saved = getSavedUser();
    if (saved) {
      setAdminName(saved.username);
      setAdminPin(saved.pin);
      setHasSaved(true);
    }
  }, []);

  // Load decades the first time Manual is chosen (for the slot dropdowns).
  useEffect(() => {
    if (boardMode !== "manual" || decades.length > 0) return;
    let active = true;
    fetch("/api/decades")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.decades) setDecades(d.decades as number[]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [boardMode, decades.length]);

  // Lazily fetch the playable teams for a decade (cached). Called when a slot's
  // decade is chosen.
  const ensureTeams = useCallback(
    async (decade: number) => {
      if (teamsByDecade[decade]) return;
      try {
        const r = await fetch(
          `/api/private-tournament/teams?decade=${decade}`,
        );
        if (!r.ok) return;
        const d = (await r.json()) as { teams: string[] };
        setTeamsByDecade((cur) => ({ ...cur, [decade]: d.teams ?? [] }));
      } catch {
        /* a missing list just leaves the dropdown empty; server re-validates */
      }
    },
    [teamsByDecade],
  );

  const adminNameCheck = validateName(adminName);
  const adminPinOk = validatePin(adminPin);
  const nameCheck = validateName(name);
  const pinOk = validatePin(pin);
  const manualErr = boardMode === "manual" ? manualReason(slots) : null;
  const canSubmit =
    adminNameCheck.ok &&
    adminPinOk &&
    nameCheck.ok &&
    pinOk &&
    manualErr === null &&
    !submitting;

  const setSlot = (i: number, patch: Partial<ManualSlot>) =>
    setSlots((cur) => cur.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      // The create route authenticates the admin via adminName/adminPin, and
      // stores the tournament's own identity from name/pin.
      const payload: Record<string, unknown> = {
        adminName,
        adminPin,
        name,
        pin,
        mode,
        size,
        boardMode,
      };
      if (boardMode === "manual") {
        payload.manualSlots = slots.map((s) => ({
          team: s.team,
          decade: s.decade,
        }));
      }
      const res = await fetch("/api/private-tournament/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Couldn't create that tournament.");
        return;
      }
      const data = (await res.json()) as {
        tournamentId: string;
        shareUrl: string;
      };
      // Remember the admin account so the next action doesn't re-ask.
      saveUser({ username: adminName, pin: adminPin });
      setHasSaved(true);
      setCreated(data);
    } catch {
      setError("Couldn't create that tournament right now. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Success: show the share link + a way into the lobby. ----
  if (created) {
    const fullShare = `${SITE_URL}${created.shareUrl}`;
    return (
      <div className="md-card md-card--lift mx-auto flex w-full max-w-md flex-col gap-4 p-5">
        <div className="text-center">
          <div className="md-capsule md-capsule--teal mb-2">
            Tournament created
          </div>
          <div className="font-display text-2xl font-bold break-words">
            {name}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            Share link
          </span>
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={fullShare}
              className="md-input flex-1 text-[13px]"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              className="md-btn md-btn--sm md-btn--secondary"
              onClick={async () => {
                if (await copyText(fullShare)) {
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 1500);
                }
              }}
            >
              {linkCopied ? "Copied!" : "Copy"}
            </button>
          </div>
          <span className="font-display text-[11px] text-[var(--md-ink-muted)]">
            Anyone with the link can join — no PIN needed to draft.
          </span>
        </div>
        <Link
          href={created.shareUrl}
          className="md-btn md-btn--lg md-btn--teal"
        >
          Open the lobby
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="md-card md-card--lift mx-auto flex w-full max-w-md flex-col gap-4 p-5"
    >
      <div>
        <div className="font-display text-xl font-bold">
          Create a private tournament
        </div>
        <p className="mt-1 text-[13px] text-[var(--md-ink-muted)]">
          Invite friends with a link. Everyone drafts the same six-team board.
        </p>
      </div>

      {/* Admin account — who hosts. From the saved session, else collected. */}
      {hasSaved ? (
        <div className="flex items-center justify-between gap-2 border-2 border-[var(--md-ink)] bg-[var(--md-paper-2)] px-3 py-2">
          <span className="font-display text-[13px]">
            Hosting as{" "}
            <strong className="text-[var(--md-orange-deep)]">
              {adminName}
            </strong>
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-2 border-dashed border-[var(--md-ink)] p-3">
          <span className="font-display text-[11px] uppercase tracking-wide text-[var(--md-ink-muted)]">
            Your account (the host)
          </span>
          <label className="flex flex-col gap-1">
            <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
              Your name
            </span>
            <input
              className="md-input md-input--name"
              value={adminName}
              maxLength={NAME_MAX_LEN}
              autoCapitalize="characters"
              onChange={(e) =>
                setAdminName(
                  e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ""),
                )
              }
              placeholder="PHILJACKSON"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
              Your PIN
            </span>
            <input
              className="md-input"
              value={adminPin}
              type="password"
              inputMode="numeric"
              maxLength={6}
              onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ""))}
              placeholder="4–6 digits"
            />
            <span className="font-display text-[11px] text-[var(--md-ink-muted)]">
              {adminPin.length > 0 && !adminPinOk
                ? "PIN must be 4–6 digits"
                : "Your account PIN — how you log back in."}
            </span>
          </label>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          Tournament name
        </span>
        <input
          className="md-input md-input--name"
          value={name}
          maxLength={NAME_MAX_LEN}
          autoCapitalize="characters"
          onChange={(e) =>
            setName(e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ""))
          }
          placeholder="FRIDAY NIGHT HOOPS"
        />
        <span className="font-display text-[11px] text-[var(--md-ink-muted)]">
          {name.length > 0 && !nameCheck.ok
            ? nameCheck.reason
            : "The tournament's name · letters, numbers, spaces · 16 max"}
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          Tournament PIN
        </span>
        <input
          className="md-input"
          value={pin}
          type="password"
          inputMode="numeric"
          maxLength={6}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="4–6 digits"
        />
        <span className="font-display text-[11px] text-[var(--md-ink-muted)]">
          {pin.length > 0 && !pinOk
            ? "PIN must be 4–6 digits"
            : "Find the tournament later by its name + this PIN."}
        </span>
      </label>

      {/* Mode. */}
      <div className="flex flex-col gap-1">
        <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          Mode
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("hoopiq")}
            className="md-card p-2 text-left"
            style={{
              background:
                mode === "hoopiq" ? "var(--md-ink)" : "var(--md-white)",
              color: mode === "hoopiq" ? "var(--md-white)" : "var(--md-ink)",
              borderWidth: mode === "hoopiq" ? 3 : 2,
              cursor: "pointer",
            }}
          >
            <div className="font-display text-sm font-bold">Ranked</div>
            <div className="font-display text-[10px] opacity-80">
              Stats hidden
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMode("classic")}
            className="md-card p-2 text-left"
            style={{
              background:
                mode === "classic" ? "var(--md-yellow)" : "var(--md-white)",
              borderWidth: mode === "classic" ? 3 : 2,
              cursor: "pointer",
            }}
          >
            <div className="font-display text-sm font-bold">Classic</div>
            <div className="font-display text-[10px] text-[var(--md-ink-muted)]">
              Stats shown
            </div>
          </button>
        </div>
      </div>

      {/* Size. */}
      <div className="flex flex-col gap-1">
        <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          Field size
        </span>
        <div className="flex flex-wrap gap-2">
          {PRIVATE_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className="border-2 border-[var(--md-ink)] px-3 py-1.5 font-display text-sm font-bold"
              style={{
                background: size === s ? "var(--md-ink)" : "var(--md-white)",
                color: size === s ? "var(--md-white)" : "var(--md-ink)",
                cursor: "pointer",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Board mode. */}
      <div className="flex flex-col gap-1">
        <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          Board
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setBoardMode("blind")}
            className="md-card p-2 text-left"
            style={{
              background:
                boardMode === "blind" ? "var(--md-yellow)" : "var(--md-white)",
              borderWidth: boardMode === "blind" ? 3 : 2,
              cursor: "pointer",
            }}
          >
            <div className="font-display text-sm font-bold">Blind</div>
            <div className="font-display text-[10px] text-[var(--md-ink-muted)]">
              Auto-generated six
            </div>
          </button>
          <button
            type="button"
            onClick={() => setBoardMode("manual")}
            className="md-card p-2 text-left"
            style={{
              background:
                boardMode === "manual" ? "var(--md-yellow)" : "var(--md-white)",
              borderWidth: boardMode === "manual" ? 3 : 2,
              cursor: "pointer",
            }}
          >
            <div className="font-display text-sm font-bold">Manual</div>
            <div className="font-display text-[10px] text-[var(--md-ink-muted)]">
              Pick the six teams
            </div>
          </button>
        </div>
      </div>

      {/* Manual board: decade-first dropdown, then a team dropdown for that decade. */}
      {boardMode === "manual" && (
        <div className="flex flex-col gap-2 border-2 border-dashed border-[var(--md-ink)] p-3">
          <span className="font-display text-[11px] text-[var(--md-ink-muted)]">
            Slots 1–5 are the starters [G · FLEX · W · FLEX · B]; slot 6 is the
            bench (sixth man). Pick a decade, then a team.
          </span>
          {slots.map((s, i) => {
            const teams = s.decade !== null ? teamsByDecade[s.decade] : undefined;
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 shrink-0 font-display text-[11px] font-bold text-[var(--md-ink-muted)]">
                  {i === 5 ? "6th" : i + 1}
                </span>
                <select
                  value={s.decade ?? ""}
                  onChange={(e) => {
                    const decade = e.target.value
                      ? Number(e.target.value)
                      : null;
                    // Reset the team when the decade changes (it may not exist
                    // in the new decade), then load that decade's teams.
                    setSlot(i, { decade, team: "" });
                    if (decade !== null) void ensureTeams(decade);
                  }}
                  className="border-2 border-[var(--md-ink)] bg-[var(--md-white)] px-2 py-1.5 font-display text-sm"
                  style={{ cursor: "pointer" }}
                >
                  <option value="">decade…</option>
                  {decades.map((d) => (
                    <option key={d} value={d}>
                      {d}s
                    </option>
                  ))}
                </select>
                <select
                  value={s.team}
                  disabled={s.decade === null}
                  onChange={(e) => setSlot(i, { team: e.target.value })}
                  className="flex-1 border-2 border-[var(--md-ink)] bg-[var(--md-white)] px-2 py-1.5 font-display text-sm font-bold disabled:opacity-50"
                  style={{ cursor: s.decade === null ? "default" : "pointer" }}
                >
                  <option value="">
                    {s.decade === null
                      ? "pick a decade first"
                      : teams === undefined
                        ? "loading teams…"
                        : "team…"}
                  </option>
                  {(teams ?? []).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
          {manualErr && (
            <span className="font-display text-[11px] text-[var(--md-coral)]">
              {manualErr}
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="border-2 border-[var(--md-coral)] bg-[var(--md-white)] p-2 font-display text-sm text-[var(--md-coral)]">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="md-btn md-btn--teal"
          disabled={!canSubmit}
        >
          {submitting ? "Creating…" : "Create tournament"}
        </button>
        {onCancel && (
          <button
            type="button"
            className="md-btn md-btn--secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
