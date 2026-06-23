import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "@/components/ui/classNames";

type CapsuleTone = "default" | "press" | "yellow" | "teal" | "coral" | "sky" | "violet" | "cobalt" | "ink";

const TONE_CLASS: Record<CapsuleTone, string> = {
  default: "",
  press: "md-capsule--press",
  yellow: "md-capsule--yellow",
  teal: "md-capsule--teal",
  coral: "md-capsule--coral",
  sky: "md-capsule--sky",
  violet: "md-capsule--violet",
  cobalt: "md-capsule--cobalt",
  ink: "md-capsule--ink",
};

export function Capsule({
  tone = "default",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: CapsuleTone;
  children: ReactNode;
}) {
  return (
    <span className={cx("md-capsule", TONE_CLASS[tone], className)} {...props}>
      {children}
    </span>
  );
}
