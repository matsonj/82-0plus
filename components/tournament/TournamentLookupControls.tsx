import {
  NAME_MAX_LEN,
  TOURNAMENT_NAME_MAX_LEN,
} from "@/lib/tournamentValidation";
import { NameField, PinField } from "@/components/ui";

export type TournamentLookupTab = "all" | "daily" | "hoopiq" | "classic" | "private";

const TAB_LABEL: Record<TournamentLookupTab, string> = {
  all: "All",
  daily: "Daily",
  hoopiq: "Ranked",
  classic: "Classic",
  private: "Private",
};

export function TournamentLookupTabs({
  tab,
  onSelect,
}: {
  tab: TournamentLookupTab;
  onSelect: (tab: TournamentLookupTab) => void;
}) {
  return (
    <div className="flex flex-wrap gap-0 border-b-2 border-[var(--md-ink)]">
      {(["all", "daily", "hoopiq", "classic", "private"] as TournamentLookupTab[]).map((nextTab) => (
        <button
          key={nextTab}
          type="button"
          onClick={() => onSelect(nextTab)}
          className="font-cond px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] transition-colors"
          style={{
            background: tab === nextTab ? "var(--md-ink)" : "transparent",
            color: tab === nextTab ? "var(--md-white)" : "var(--md-ink-muted)",
            cursor: "pointer",
            borderBottom:
              tab === nextTab
                ? "2px solid var(--md-ink)"
                : "2px solid transparent",
            marginBottom: -2,
          }}
        >
          {TAB_LABEL[nextTab]}
        </button>
      ))}
    </div>
  );
}

export function AccountFields({
  name,
  pin,
  onName,
  onPin,
  dark = false,
  nameLabel = "Your name",
  pinLabel = "PIN",
}: {
  name: string;
  pin: string;
  onName: (value: string) => void;
  onPin: (value: string) => void;
  dark?: boolean;
  nameLabel?: string;
  pinLabel?: string;
}) {
  const labelColorClassName = dark
    ? "text-[var(--md-paper-3)]"
    : "text-[var(--md-ink-muted)]";

  return (
    <>
      <NameField
        label={nameLabel}
        value={name}
        maxLength={NAME_MAX_LEN}
        onChange={(event) => onName(event.target.value)}
        labelColorClassName={labelColorClassName}
      />
      <PinField
        label={pinLabel}
        value={pin}
        onChange={(event) => onPin(event.target.value)}
        labelColorClassName={labelColorClassName}
      />
    </>
  );
}

export function TournamentCredentialFields({
  name,
  pin,
  onName,
  onPin,
}: {
  name: string;
  pin: string;
  onName: (value: string) => void;
  onPin: (value: string) => void;
}) {
  return (
    <>
      <NameField
        label="Tournament name"
        value={name}
        maxLength={TOURNAMENT_NAME_MAX_LEN}
        placeholder="FRIDAY NIGHT HOOPS CUP"
        onChange={(event) => onName(event.target.value)}
      />
      <PinField
        label="Tournament PIN"
        value={pin}
        onChange={(event) => onPin(event.target.value)}
      />
    </>
  );
}
