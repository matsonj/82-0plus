import { MOTHERDUCK_URL } from "@/lib/site";
import { cx } from "@/components/ui/classNames";

export function SiteFooter({
  centered = false,
  sticky = true,
  className,
}: {
  centered?: boolean;
  sticky?: boolean;
  className?: string;
}) {
  if (centered) {
    return (
      <footer
        className={cx(
          "relative z-10 pt-16 text-center",
          sticky && "mt-auto",
          className,
        )}
      >
        <div className="md-rule-double mb-6" />
        <FooterCopy />
      </footer>
    );
  }

  return (
    <footer
      className={cx(
        "relative z-10 flex flex-col gap-1 border-t border-[var(--md-ink)] pt-5 text-[var(--md-ink-muted)] sm:flex-row sm:items-center sm:justify-between",
        sticky && "mt-auto",
        className,
      )}
    >
      <FooterCopy split />
    </footer>
  );
}

function FooterCopy({ split = false }: { split?: boolean }) {
  return (
    <>
      <p className="font-byline text-[12px] tracking-[0.02em] text-[var(--md-ink-muted)]">
        Powered by{" "}
        <a
          href={MOTHERDUCK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[var(--md-ink)]"
        >
          MotherDuck
        </a>{" "}
        · <span className="font-mono">nba_box_scores_v2</span>
      </p>
      <p
        className={
          split
            ? "font-byline text-[12px] tracking-[0.02em] text-[var(--md-ink-muted)]"
            : "mt-1 font-byline text-[11px] text-[var(--md-ink-muted)]"
        }
      >
        An independent project{split ? " — " : ", "}not affiliated with or endorsed by the NBA.
      </p>
    </>
  );
}
