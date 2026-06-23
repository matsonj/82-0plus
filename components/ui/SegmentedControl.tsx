import type { ReactNode } from "react";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className ?? ""}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className="border-2 border-[var(--md-ink)] px-2 py-1 font-cond text-[11px] font-semibold uppercase tracking-[0.08em]"
          style={{
            background: value === option.value ? "var(--md-ink)" : "var(--md-white)",
            color: value === option.value ? "var(--md-white)" : "var(--md-ink)",
            cursor: "pointer",
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
