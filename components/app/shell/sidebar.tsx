"use client";

import {
  BarChart3, BookOpen, Check, ChevronDown, ChevronRight, ChevronsUpDown, FolderKanban, Home, Inbox,
  LayoutDashboard, Layers, ListChecks, PanelLeftClose, PanelLeftOpen, Plus, Settings, Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { IconTile } from "@/components/app/icon";
import { LogoMark } from "@/components/app/logo";
import { useShell } from "@/components/app/shell/shell-context";
import { orgPath } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { setActiveWorkspaceAction } from "@/features/account/workspace-actions";
import { cn } from "@/lib/utils";

function NavLink({
  href, icon, label, collapsed, badge, exact,
}: { href: string; icon: ReactNode; label: string; collapsed: boolean; badge?: number; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <span className="shrink-0 [&_svg]:size-4">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
      {!!badge && badge > 0 && (
        <span
          className={cn(
            "ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground",
            collapsed && "absolute right-1 top-0.5 ml-0",
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function OrgSwitcher({ collapsed }: { collapsed: boolean }) {
  const { org, orgs } = useShell();
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className={cn(
              "flex w-full items-center gap-2 rounded-md p-1.5 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
              collapsed && "justify-center",
            )}
            aria-label="Switch organization"
          />
        }
      >
        {org.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logo_url} alt="" className="size-8 shrink-0 rounded-lg object-cover" />
        ) : (
          <LogoMark />
        )}
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{org.name}</span>
              <span className="block truncate text-xs text-muted-foreground">Organization</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {orgs.map((o) => (
          <DropdownMenuItem key={o.org.id} onClick={() => router.push(orgPath(o.org.slug))}>
            <span className="truncate">{o.org.name}</span>
            {o.org.id === org.id && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/onboarding?new=1")}>
          <Plus /> Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkspaceSwitcher() {
  const { org, data, activeWorkspaceId } = useShell();
  const router = useRouter();
  const [, start] = useTransition();
  const active = data.workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  function choose(id: string | null) {
    start(async () => {
      await setActiveWorkspaceAction(org.id, id);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="flex w-full items-center gap-2 rounded-md border border-sidebar-border px-2.5 py-1.5 text-left text-sm outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring" />
        }
      >
        <Layers className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{active ? active.name : "All workspaces"}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Workspace</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => choose(null)}>
          All workspaces {!active && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        {data.workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onClick={() => choose(w.id)}>
            <span className="truncate">{w.name}</span>
            {active?.id === w.id && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
        {data.workspaces.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">No workspaces yet.</p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push(orgPath(org.slug, "/settings/workspaces"))}>
          <Settings /> Manage workspaces
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SpaceTree() {
  const { org, data, activeWorkspaceId } = useShell();
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const spaces = useMemo(
    () => data.spaces.filter((s) => !activeWorkspaceId || s.workspace_id === activeWorkspaceId),
    [data.spaces, activeWorkspaceId],
  );
  if (spaces.length === 0) {
    return <p className="px-2.5 py-1 text-xs text-muted-foreground">No spaces yet.</p>;
  }
  return (
    <ul className="space-y-0.5">
      {spaces.map((s) => {
        const projects = data.projects.filter((p) => p.space_id === s.id);
        const hasActive = projects.some((p) => pathname.startsWith(orgPath(org.slug, `/p/${p.key}`)));
        const isOpen = open[s.id] ?? hasActive;
        return (
          <li key={s.id}>
            <div className="flex items-center">
              <button
                onClick={() => setOpen((o) => ({ ...o, [s.id]: !isOpen }))}
                className="rounded p-1 text-muted-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={isOpen ? `Collapse ${s.name}` : `Expand ${s.name}`}
                aria-expanded={isOpen}
              >
                {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              </button>
              <Link
                href={orgPath(org.slug, `/spaces/${s.id}`)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-sidebar-accent"
              >
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="truncate">{s.name}</span>
              </Link>
            </div>
            {isOpen && (
              <ul className="ml-6 border-l border-sidebar-border pl-2">
                {projects.map((p) => {
                  const href = orgPath(org.slug, `/p/${p.key}`);
                  const active = pathname.startsWith(href);
                  return (
                    <li key={p.id}>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent",
                          active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                        )}
                      >
                        <span className="font-mono text-[10px] text-muted-foreground">{p.key}</span>
                        <span className="truncate">{p.name}</span>
                      </Link>
                    </li>
                  );
                })}
                {projects.length === 0 && <li className="px-1.5 py-1 text-xs text-muted-foreground">No projects</li>}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function SidebarContent({
  collapsed, onToggle, mobile = false,
}: { collapsed: boolean; onToggle?: () => void; mobile?: boolean }) {
  const { org, data } = useShell();
  const c = mobile ? false : collapsed;
  const base = orgPath(org.slug);
  return (
    <div className="flex h-full flex-col gap-3 py-3">
      <div className="px-2">
        <OrgSwitcher collapsed={c} />
      </div>
      {!c && (
        <div className="px-3">
          <WorkspaceSwitcher />
        </div>
      )}
      <nav aria-label="Primary" className="space-y-0.5 px-2">
        <NavLink href={base} exact icon={<Home />} label="Home" collapsed={c} />
        <NavLink href={`${base}/my-tasks`} icon={<ListChecks />} label="My Tasks" collapsed={c} />
        <NavLink href={`${base}/inbox`} icon={<Inbox />} label="Inbox" collapsed={c} badge={data.unread} />
        <NavLink href={`${base}/spaces`} exact icon={<FolderKanban />} label="Spaces" collapsed={c} />
        <NavLink href={`${base}/dashboards`} icon={<LayoutDashboard />} label="Dashboards" collapsed={c} />
        <NavLink href={`${base}/reports`} icon={<BarChart3 />} label="Reports" collapsed={c} />
        <NavLink href={`${base}/team`} icon={<Users />} label="Team" collapsed={c} />
      </nav>

      {!c && (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3">
          {data.recentProjects.length > 0 && (
            <section aria-labelledby="recent-heading">
              <h2 id="recent-heading" className="mb-1 px-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Recent projects
              </h2>
              <ul className="space-y-0.5">
                {data.recentProjects.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={orgPath(org.slug, `/p/${p.key}`)}
                      className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[13px] hover:bg-sidebar-accent"
                    >
                      <IconTile name={p.icon} color={p.color} className="size-5 rounded" />
                      <span className="truncate">{p.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="spaces-heading">
            <h2 id="spaces-heading" className="mb-1 px-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Spaces
            </h2>
            <SpaceTree />
          </section>
        </div>
      )}
      {c && <div className="flex-1" />}

      <div className="space-y-0.5 px-2">
        <NavLink href={`${base}/settings`} icon={<Settings />} label="Settings" collapsed={c} />
        <NavLink href={`${base}/help`} icon={<BookOpen />} label="Help & docs" collapsed={c} />
        {!mobile && onToggle && (
          <Button
            variant="ghost"
            size={c ? "icon" : "default"}
            onClick={onToggle}
            className={cn("w-full text-muted-foreground", !c && "justify-start gap-2.5 px-2.5")}
            aria-label={c ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={c}
          >
            {c ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!c && "Collapse"}
          </Button>
        )}
      </div>
    </div>
  );
}

export function useToastError() {
  return (msg: string) => toast.error(msg);
}
