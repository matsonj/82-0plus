import type { ReactNode } from "react";
import { GlobalHeader } from "@/components/GlobalHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { cx } from "@/components/ui/classNames";

type PageWidth = "narrow" | "standard" | "wide" | "home" | "play";

const WIDTH_CLASS: Record<PageWidth, string> = {
  narrow: "max-w-3xl",
  standard: "max-w-5xl",
  wide: "max-w-6xl",
  home: "max-w-3xl md:max-w-6xl",
  play: "max-w-5xl",
};

export function PageShell({
  children,
  width = "wide",
  className,
  paddingClassName = "px-4 pb-12 sm:pb-16",
  footer = true,
  footerCentered = false,
  footerSticky = true,
  footerClassName,
  headerRight,
  onSignIn,
  onHowToPlay,
}: {
  children: ReactNode;
  width?: PageWidth;
  className?: string;
  paddingClassName?: string;
  footer?: boolean;
  footerCentered?: boolean;
  footerSticky?: boolean;
  footerClassName?: string;
  headerRight?: ReactNode;
  onSignIn?: () => void;
  onHowToPlay?: () => void;
}) {
  return (
    <main
      className={cx(
        "relative mx-auto flex min-h-full flex-col",
        paddingClassName,
        WIDTH_CLASS[width],
        className,
      )}
    >
      <div className="md-sunbeam" />
      <GlobalHeader
        right={headerRight}
        onSignIn={onSignIn}
        onHowToPlay={onHowToPlay}
      />
      {children}
      {footer && (
        <SiteFooter
          centered={footerCentered}
          sticky={footerSticky}
          className={footerClassName}
        />
      )}
    </main>
  );
}
