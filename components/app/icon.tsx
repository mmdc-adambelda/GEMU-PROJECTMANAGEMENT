import {
  BarChart3, Bookmark, Briefcase, Bug, Calendar, Code2, Folder, Globe, Headphones, Heart, Layers,
  Lightbulb, Megaphone, Rocket, Server, Shield, Star, Target, Users, Zap, type LucideIcon,
} from "lucide-react";

/** Icons a user can pick for workspaces, spaces and projects (stored by key in the database). */
export const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase, layers: Layers, folder: Folder, rocket: Rocket, bug: Bug, megaphone: Megaphone,
  headphones: Headphones, users: Users, code: Code2, server: Server, shield: Shield, heart: Heart,
  star: Star, globe: Globe, zap: Zap, target: Target, bookmark: Bookmark, calendar: Calendar,
  chart: BarChart3, lightbulb: Lightbulb,
};

export const ICON_KEYS = Object.keys(ICONS);

export function AppIcon({ name, className, color }: { name: string; className?: string; color?: string }) {
  const Icon = ICONS[name] ?? Folder;
  return <Icon className={className} style={color ? { color } : undefined} aria-hidden />;
}

export function IconTile({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md ${className ?? ""}`}
      style={{ backgroundColor: `${color}22`, color }}
    >
      <AppIcon name={name} className="size-4" />
    </span>
  );
}
