import type { HTMLAttributes } from "react";
import { cx } from "@/components/ui/classNames";

export function LoadingState({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "py-20 text-center font-cond text-sm uppercase tracking-widest text-[var(--md-ink-muted)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
