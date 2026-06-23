import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "@/components/ui/classNames";

export function TextField({
  label,
  hint,
  inputClassName,
  labelClassName,
  labelColorClassName = "text-[var(--md-ink-muted)]",
  labelTextClassName = "text-xs",
  hintClassName,
  hintColorClassName = "text-[var(--md-ink-muted)]",
  hintTextClassName = "text-[11px]",
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: ReactNode;
  inputClassName?: string;
  labelClassName?: string;
  labelColorClassName?: string;
  labelTextClassName?: string;
  hintClassName?: string;
  hintColorClassName?: string;
  hintTextClassName?: string;
}) {
  return (
    <label className={cx("flex flex-col gap-1", className)}>
      <span
        className={cx(
          "font-cond font-semibold uppercase tracking-[0.18em]",
          labelTextClassName,
          labelColorClassName,
          labelClassName,
        )}
      >
        {label}
      </span>
      <input className={cx("md-input", inputClassName)} {...props} />
      {hint && (
        <span
          className={cx(
            "font-mono",
            hintTextClassName,
            hintColorClassName,
            hintClassName,
          )}
        >
          {hint}
        </span>
      )}
    </label>
  );
}
