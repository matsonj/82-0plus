import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "@/components/ui/classNames";

export function Card({
  lift = false,
  cover = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  lift?: boolean;
  cover?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cx("md-card", lift && "md-card--lift", cover && "md-card--cover", className)}
      {...props}
    >
      {children}
    </div>
  );
}
