import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "@/components/ui/classNames";

type NoticeTone = "neutral" | "error" | "success";

export function Notice({
  tone = "neutral",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: NoticeTone;
  children: ReactNode;
}) {
  const color =
    tone === "error"
      ? "border-[var(--md-coral)] text-[var(--md-coral)]"
      : tone === "success"
        ? "border-[var(--md-teal)] text-[var(--md-teal)]"
        : "border-[var(--md-ink)] text-[var(--md-ink-muted)]";

  return (
    <div
      className={cx(
        "border-2 bg-[var(--md-white)] p-2 font-mono text-sm",
        color,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
