import { Waypoints } from "lucide-react";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex size-8 items-center justify-center rounded-lg text-white", className)}
      style={{ backgroundColor: brand.logoColor }}
      aria-hidden
    >
      <Waypoints className="size-4" />
    </span>
  );
}

export function Logo({ className, showName = true }: { className?: string; showName?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      {showName && <span className="text-base font-semibold tracking-tight">{brand.name}</span>}
    </span>
  );
}
