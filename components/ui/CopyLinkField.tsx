"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/Button";
import { cx } from "@/components/ui/classNames";
import { copyText } from "@/lib/copyText";

export function CopyLinkField({
  label,
  value,
  copiedLabel = "Copied!",
  copyLabel = "Copy",
  hint,
  layout = "field",
  buttonVariant = "secondary",
  buttonSize = "sm",
  buttonFullWidth = false,
  buttonClassName,
  buttonStyle,
  buttonPrefix,
  displayValue,
  displayClassName,
  displayStyle,
}: {
  label?: ReactNode;
  value: string;
  copiedLabel?: string;
  copyLabel?: string;
  hint?: ReactNode;
  layout?: "field" | "button";
  buttonVariant?: ButtonVariant;
  buttonSize?: ButtonSize;
  buttonFullWidth?: boolean;
  buttonClassName?: string;
  buttonStyle?: CSSProperties;
  buttonPrefix?: ReactNode;
  displayValue?: ReactNode;
  displayClassName?: string;
  displayStyle?: CSSProperties;
}) {
  const [copied, setCopied] = useState(false);

  const copyButton = (
    <Button
      type="button"
      size={buttonSize}
      variant={buttonVariant}
      fullWidth={buttonFullWidth}
      className={buttonClassName}
      style={buttonStyle}
      onClick={async () => {
        if (await copyText(value)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
    >
      {buttonPrefix}
      {copied ? copiedLabel : copyLabel}
    </Button>
  );

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <span className="font-cond text-xs font-semibold uppercase tracking-[0.18em] text-[var(--md-ink-muted)]">
          {label}
        </span>
      )}
      {layout === "button" ? (
        <>
          {copyButton}
          {displayValue && (
            <div
              className={cx("font-mono text-[12px]", displayClassName)}
              style={displayStyle}
            >
              {displayValue}
            </div>
          )}
        </>
      ) : (
        <div className="flex items-stretch gap-2">
          <input
            readOnly
            value={value}
            className="md-input flex-1 text-[13px]"
            onFocus={(event) => event.currentTarget.select()}
          />
          {copyButton}
        </div>
      )}
      {hint && (
        <span className="font-mono text-[11px] text-[var(--md-ink-muted)]">
          {hint}
        </span>
      )}
    </div>
  );
}
