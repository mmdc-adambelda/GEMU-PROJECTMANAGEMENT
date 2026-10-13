"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShell } from "@/components/app/shell/shell-context";
import { orgPath } from "@/lib/paths";
import { cn } from "@/lib/utils";

export function SettingsNav() {
  const { org } = useShell();
  const pathname = usePathname();
  const items = [
    { href: orgPath(org.slug, "/settings"), label: "General", exact: true },
    { href: orgPath(org.slug, "/settings/members"), label: "Members & invitations" },
    { href: orgPath(org.slug, "/settings/workspaces"), label: "Workspaces" },
  ];
  return (
    <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto border-b">
      {items.map((i) => {
        const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}
            className={cn("-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground", active && "border-primary font-medium text-foreground")}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
