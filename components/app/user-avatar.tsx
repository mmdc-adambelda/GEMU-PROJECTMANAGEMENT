import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function initials(name: string | null | undefined, email?: string | null) {
  const src = (name?.trim() || email?.split("@")[0] || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function UserAvatar({
  name,
  email,
  src,
  className,
}: {
  name?: string | null;
  email?: string | null;
  src?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-7", className)} title={name || email || undefined}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback className="text-[10px] font-medium">{initials(name, email)}</AvatarFallback>
    </Avatar>
  );
}
