import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "@/components/ui/classNames";

export function TextField({
  label,
  hint,
  inputClassName,
  labelClassName,
  hintClassName,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: ReactNode;
  inputClassName?: string;
  labelClassName?: string;
  hintClassName?: string;
}) {
  return (
    <label className={cx("flex flex-col gap-1", className)}>
      <span
        className={cx(
          "font-cond text-xs font-semibold uppercase tracking-[0.18em] text-[var(--md-ink-muted)]",
          labelClassName,
        )}
      >
        {label}
      </span>
      <input className={cx("md-input", inputClassName)} {...props} />
      {hint && (
        <span
          className={cx(
            "font-mono text-[11px] text-[var(--md-ink-muted)]",
            hintClassName,
          )}
        >
          {hint}
        </span>
      )}
    </label>
  );
}
