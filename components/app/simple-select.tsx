"use client";

import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface Option<T extends string = string> {
  value: T;
  label: string;
  /** Optional decorative node rendered before the label in the menu. */
  icon?: ReactNode;
}

/**
 * Thin wrapper over the Base UI select that maps values to labels, so the trigger shows
 * "In Progress" instead of a raw uuid, and a null selection never leaks through.
 */
export function SimpleSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className,
  size = "default",
  disabled,
  id,
  "aria-label": ariaLabel,
}: {
  value: T | null | undefined;
  onChange: (value: T) => void;
  options: Option<T>[];
  placeholder?: string;
  className?: string;
  size?: "sm" | "default";
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  const items = options.map((o) => ({ value: o.value, label: o.label }));
  return (
    <Select
      value={value ?? null}
      items={items}
      disabled={disabled}
      onValueChange={(v) => {
        if (v !== null && v !== undefined) onChange(v as T);
      }}
    >
      <SelectTrigger id={id} size={size} aria-label={ariaLabel} className={cn("min-w-0", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="min-w-44">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.icon}
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
