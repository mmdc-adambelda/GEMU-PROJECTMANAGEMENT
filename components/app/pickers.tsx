"use client";

import { Check } from "lucide-react";
import { AppIcon, ICON_KEYS } from "@/components/app/icon";
import { cn } from "@/lib/utils";

export const SWATCHES = [
  "#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#84cc16", "#eab308",
  "#f97316", "#ef4444", "#ec4899", "#a855f7", "#64748b", "#14b8a6",
];

export function ColorPicker({ value, onChange, label = "Color" }: { value: string; onChange: (c: string) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className="flex size-6 items-center justify-center rounded-full outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          style={{ backgroundColor: c }}
        >
          {value === c && <Check className="size-3.5 text-white" />}
        </button>
      ))}
    </div>
  );
}

export function IconPicker({ value, onChange, color }: { value: string; onChange: (i: string) => void; color?: string }) {
  return (
    <div role="radiogroup" aria-label="Icon" className="grid grid-cols-10 gap-1">
      {ICON_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          aria-label={k}
          onClick={() => onChange(k)}
          className={cn(
            "flex size-8 items-center justify-center rounded-md border border-transparent outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
            value === k && "border-primary bg-primary/10",
          )}
        >
          <AppIcon name={k} className="size-4" color={value === k ? color : undefined} />
        </button>
      ))}
    </div>
  );
}
