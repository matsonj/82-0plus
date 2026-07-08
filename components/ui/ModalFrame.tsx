"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/Card";
import { cx } from "@/components/ui/classNames";

export function ModalFrame({
  title,
  subtitle,
  onClose,
  children,
  footer,
  maxWidth = "max-w-sm",
  paddingClassName = "p-5",
  className,
  headerClassName,
  titleClassName,
  titleStyle,
  closeClassName,
  closeStyle,
  overlayClassName,
  overlayStyle,
  panelStyle,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  paddingClassName?: string;
  className?: string;
  headerClassName?: string;
  titleClassName?: string;
  titleStyle?: CSSProperties;
  closeClassName?: string;
  closeStyle?: CSSProperties;
  overlayClassName?: string;
  overlayStyle?: CSSProperties;
  panelStyle?: CSSProperties;
}) {
  // Portal to <body> so the modal escapes any page stacking context (e.g. the
  // footer bleeding over it). Mirrors PlayerCard. Mounted-gated for SSR safety.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const overlay = (
    <div
      className={cx("fixed inset-0 z-50 flex items-center justify-center p-4", overlayClassName)}
      style={{ background: "var(--md-overlay)", ...overlayStyle }}
      onClick={onClose}
    >
      <Card
        lift
        className={cx("w-full", paddingClassName, maxWidth, className)}
        style={panelStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={cx("flex items-start justify-between gap-3", headerClassName)}>
          <div className="flex min-w-0 flex-col gap-1">
            <h3
              className={cx("leading-tight", titleClassName ?? "font-archivo")}
              style={{
                fontSize: 20,
                fontWeight: 800,
                fontVariationSettings: '"wdth" 88',
                ...titleStyle,
              }}
            >
              {title}
            </h3>
            {subtitle}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={cx(
              "text-[16px] text-[var(--md-ink-muted)] hover:text-[var(--md-coral)]",
              closeClassName ?? "font-mono",
            )}
            style={closeStyle}
          >
            ✕
          </button>
        </div>
        {children}
        {footer}
      </Card>
    </div>
  );

  if (!mounted) return null;
  return createPortal(overlay, document.body);
}
