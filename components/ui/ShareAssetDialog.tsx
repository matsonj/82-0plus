"use client";

import { useState } from "react";
import { Button, buttonClassName } from "@/components/ui/Button";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { copyText } from "@/lib/copyText";

export function ShareAssetDialog({
  title,
  imageUrl,
  imageAlt,
  downloadName,
  shareLink,
  autoCopied,
  onClose,
}: {
  title: string;
  imageUrl: string;
  imageAlt: string;
  downloadName: string;
  shareLink: string;
  autoCopied: boolean;
  onClose: () => void;
}) {
  const [linkCopied, setLinkCopied] = useState(false);

  return (
    <ModalFrame title={title} onClose={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={imageAlt}
        className="mt-3 w-full border-2 border-[var(--md-ink)]"
      />
      <p className="mt-2 text-center font-mono text-[12px] leading-snug text-[var(--md-ink-muted)]">
        <strong>Right-click to copy and share.</strong>{" "}
        {autoCopied
          ? "The link is already on your clipboard."
          : 'Use "Copy link" below to copy the link.'}
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <a
          className={buttonClassName({ size: "sm", variant: "secondary" })}
          href={imageUrl}
          download={downloadName}
        >
          Download
        </a>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={async () => {
            const ok = await copyText(shareLink);
            if (ok) {
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 1500);
            }
          }}
        >
          {linkCopied ? "Link copied!" : "Copy link"}
        </Button>
        <Button type="button" size="sm" variant="ink" onClick={onClose}>
          Done
        </Button>
      </div>
    </ModalFrame>
  );
}
