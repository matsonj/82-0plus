import type { HTMLAttributes } from "react";
import { cx } from "@/components/ui/classNames";

export function LoadingState({
  children,
  spacingClassName = "py-20",
  textClassName = "font-cond text-sm uppercase tracking-widest",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  spacingClassName?: string;
  textClassName?: string;
}) {
  return (
    <div
      className={cx(
        "text-center text-[var(--md-ink-muted)]",
        spacingClassName,
        textClassName,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
