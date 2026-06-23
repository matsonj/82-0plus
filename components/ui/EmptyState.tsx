import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

export function EmptyState({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`flex flex-col gap-1 p-5 text-center ${className ?? ""}`}>
      <div
        className="font-archivo leading-tight"
        style={{
          fontSize: 18,
          fontWeight: 800,
          fontVariationSettings: '"wdth" 88',
        }}
      >
        {title}
      </div>
      {children && (
        <p className="mt-1 text-[13px] text-[var(--md-ink-muted)]">{children}</p>
      )}
    </Card>
  );
}
