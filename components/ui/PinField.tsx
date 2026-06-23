import type { ComponentProps } from "react";
import { TextField } from "@/components/ui/TextField";

export function normalizePinInput(value: string): string {
  return value.replace(/\D/g, "");
}

export function PinField({
  onChange,
  maxLength = 6,
  placeholder = "4–6 digits",
  ...props
}: Omit<ComponentProps<typeof TextField>, "type" | "inputMode">) {
  return (
    <TextField
      type="password"
      inputMode="numeric"
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(event) => {
        event.currentTarget.value = normalizePinInput(event.currentTarget.value);
        onChange?.(event);
      }}
      {...props}
    />
  );
}
