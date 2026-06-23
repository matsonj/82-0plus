import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/components/ui/classNames";

export function PageHeader({
  eyebrowLeft,
  eyebrowRight,
  kicker,
  title,
  description,
  aside,
  afterTitle,
  className,
  eyebrowClassName,
  contentClassName,
  kickerClassName,
  titleClassName,
  titleStyle,
  descriptionClassName,
  eyebrowVariant = "rule",
}: {
  eyebrowLeft?: ReactNode;
  eyebrowRight?: ReactNode;
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  afterTitle?: ReactNode;
  className?: string;
  eyebrowClassName?: string;
  contentClassName?: string;
  kickerClassName?: string;
  titleClassName?: string;
  titleStyle?: CSSProperties;
  descriptionClassName?: string;
  eyebrowVariant?: "rule" | "line";
}) {
  const hasEyebrow = eyebrowLeft != null || eyebrowRight != null;

  return (
    <header className={cx("relative z-10", className)}>
      {hasEyebrow && (
        <div
          className={cx(
            "flex items-end justify-between pb-2",
            eyebrowVariant === "rule"
              ? "md-rule-double"
              : "border-b border-[var(--md-paper-3)]",
            eyebrowClassName,
          )}
        >
          <span className="md-folio uppercase">{eyebrowLeft}</span>
          {eyebrowRight != null && (
            <span className="md-folio uppercase">{eyebrowRight}</span>
          )}
        </div>
      )}

      <div
        className={cx(
          hasEyebrow && "mt-5",
          aside != null && "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
          contentClassName,
        )}
      >
        <div>
          {kicker && (
            <span className={cx(kickerClassName ?? "md-kicker--marker block")}>
              {kicker}
            </span>
          )}
          <h1
            className={cx("font-cover mt-1 uppercase", titleClassName)}
            style={titleStyle}
          >
            {title}
          </h1>
          {afterTitle}
          {description && (
            <p
              className={cx(
                "mt-3 max-w-lg text-[14px] leading-relaxed sm:text-[15px]",
                descriptionClassName,
              )}
            >
              {description}
            </p>
          )}
        </div>

        {aside}
      </div>
    </header>
  );
}
