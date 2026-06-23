"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { copyText } from "@/lib/copyText";

export function CopyLinkField({
  label,
  value,
  copiedLabel = "Copied!",
  copyLabel = "Copy",
  hint,
}: {
  label: string;
  value: string;
  copiedLabel?: string;
  copyLabel?: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <span className="font-cond text-xs font-semibold uppercase tracking-[0.18em] text-[var(--md-ink-muted)]">
        {label}
      </span>
      <div className="flex items-stretch gap-2">
        <input
          readOnly
          value={value}
          className="md-input flex-1 text-[13px]"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={async () => {
            if (await copyText(value)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }
          }}
        >
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
      {hint && (
        <span className="font-mono text-[11px] text-[var(--md-ink-muted)]">
          {hint}
        </span>
      )}
    </div>
  );
}
