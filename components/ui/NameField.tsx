import type { ComponentProps } from "react";
import { TextField } from "@/components/ui/TextField";

function normalizeNameInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9 ]/g, "");
}

export function NameField({
  onChange,
  maxLength = 16,
  placeholder = "PHILJACKSON",
  inputClassName,
  ...props
}: Omit<ComponentProps<typeof TextField>, "type" | "autoCapitalize">) {
  return (
    <TextField
      maxLength={maxLength}
      autoCapitalize="characters"
      placeholder={placeholder}
      inputClassName={`md-input--name ${inputClassName ?? ""}`}
      onChange={(event) => {
        event.currentTarget.value = normalizeNameInput(event.currentTarget.value);
        onChange?.(event);
      }}
      {...props}
    />
  );
}
