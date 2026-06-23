import type { ReactNode } from "react";
import { cx } from "@/components/ui/classNames";

export function ModalFrame({
  title,
  onClose,
  children,
  footer,
  maxWidth = "max-w-sm",
  className,
  overlayClassName,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  className?: string;
  overlayClassName?: string;
}) {
  return (
    <div
      className={cx("fixed inset-0 z-50 flex items-center justify-center p-4", overlayClassName)}
      style={{ background: "rgba(21,17,14,0.75)" }}
      onClick={onClose}
    >
      <div
        className={cx("w-full p-5", maxWidth, className)}
        style={{
          background: "var(--md-white)",
          border: "2px solid var(--md-ink)",
          boxShadow: "var(--md-shadow-lg)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3
            className="font-archivo leading-tight"
            style={{ fontSize: 20, fontWeight: 800, fontVariationSettings: '"wdth" 88' }}
          >
            {title}
          </h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="font-mono text-[16px] text-[var(--md-ink-muted)] hover:text-[var(--md-coral)]"
          >
            ✕
          </button>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}
