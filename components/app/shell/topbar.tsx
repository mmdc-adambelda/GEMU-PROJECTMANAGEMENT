"use client";

import { ChevronRight, FolderKanban, Layers, ListPlus, LogOut, Menu, Moon, Plus, Settings, Sun, UserCog, UserPlus } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useSyncExternalStore } from "react";
import { GlobalSearch } from "@/components/app/shell/global-search";
import { NotificationBell } from "@/components/app/shell/notification-bell";
import { SidebarContent } from "@/components/app/shell/sidebar";
import { orgPath, useShell } from "@/components/app/shell/shell-context";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { logoutAction } from "@/app/(auth)/actions";
import { updatePreferencesAction } from "@/features/account/actions";
import { CreateProjectDialog } from "@/features/projects/create-project-dialog";
import { CreateSpaceDialog } from "@/features/spaces/create-space-dialog";
import { CreateTaskDialog } from "@/features/tasks/create-task-dialog";
import { isOrgAdmin } from "@/lib/permissions";

const LABELS: Record<string, string> = {
  "my-tasks": "My Tasks", inbox: "Inbox", spaces: "Spaces", dashboards: "Dashboards", reports: "Reports",
  team: "Team", settings: "Settings", help: "Help & docs", members: "Members", workspaces: "Workspaces",
  invitations: "Invitations", p: "Projects", t: "Tasks",
};

function useCrumbs() {
  const { org, data } = useShell();
  const pathname = usePathname();
  return useMemo(() => {
    const base = orgPath(org.slug);
    const rest = pathname.startsWith(base) ? pathname.slice(base.length).split("/").filter(Boolean) : [];
    const crumbs: Array<{ label: string; href?: string }> = [{ label: org.name, href: base }];
    let href = base;
    for (let i = 0; i < rest.length; i++) {
      const seg = rest[i];
      href += `/${seg}`;
      const prev = rest[i - 1];
      let label = LABELS[seg] ?? seg;
      if (prev === "p") label = data.projects.find((p) => p.key === seg)?.name ?? seg;
      if (prev === "spaces") label = data.spaces.find((s) => s.id === seg)?.name ?? "Space";
      if (prev === "team") label = "Member";
      // "p" and "t" are structural segments: the next crumb names the item
      if ((seg === "p" || seg === "t") && i < rest.length - 1) continue;
      crumbs.push({ label, href: i === rest.length - 1 ? undefined : href });
    }
    return crumbs;
  }, [org, data, pathname]);
}

function Breadcrumbs() {
  const crumbs = useCrumbs();
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center text-sm md:flex">
      <ol className="flex min-w-0 items-center gap-1">
        {crumbs.map((c, i) => (
          <Fragment key={`${c.label}-${i}`}>
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
            <li className="min-w-0">
              {c.href ? (
                <Link href={c.href} className="truncate text-muted-foreground hover:text-foreground">{c.label}</Link>
              ) : (
                <span aria-current="page" className="truncate font-medium">{c.label}</span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => {
        const next = dark ? "light" : "dark";
        setTheme(next);
        void updatePreferencesAction({ theme: next });
      }}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

function QuickCreate() {
  const { role } = useShell();
  const [dialog, setDialog] = useState<"task" | "project" | "space" | null>(null);
  const canCreate = role !== "guest";
  if (!canCreate) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="sm" aria-label="Create" />}>
          <Plus /> <span className="hidden sm:inline">Create</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setDialog("task")}><ListPlus /> Task</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("project")}><FolderKanban /> Project</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("space")}><Layers /> Space</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateTaskDialog open={dialog === "task"} onOpenChange={(o) => setDialog(o ? "task" : null)} />
      <CreateProjectDialog open={dialog === "project"} onOpenChange={(o) => setDialog(o ? "project" : null)} />
      <CreateSpaceDialog open={dialog === "space"} onOpenChange={(o) => setDialog(o ? "space" : null)} />
    </>
  );
}

function UserMenu() {
  const { profile, org, role } = useShell();
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu" />}>
        <UserAvatar name={profile.full_name} email={profile.email} src={profile.avatar_url} className="size-8" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="space-y-0.5">
          <span className="block truncate text-sm font-medium text-foreground">{profile.full_name || profile.email}</span>
          <span className="block truncate font-normal">{profile.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/account")}><UserCog /> Profile & account</DropdownMenuItem>
        {isOrgAdmin(role) && (
          <>
            <DropdownMenuItem onClick={() => router.push(orgPath(org.slug, "/settings"))}><Settings /> Organization settings</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(orgPath(org.slug, "/settings/members"))}><UserPlus /> Invite people</DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={async () => {
            await logoutAction();
            router.replace("/login");
            router.refresh();
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar() {
  // the drawer is open only for the path it was opened on, so navigating closes it
  const pathname = usePathname();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const mobileNav = openedOn === pathname;
  const setMobileNav = (o: boolean) => setOpenedOn(o ? pathname : null);
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:px-4">
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" onClick={() => setMobileNav(true)}>
        <Menu />
      </Button>
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent collapsed={false} mobile />
        </SheetContent>
      </Sheet>
      <Breadcrumbs />
      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2 md:flex-none">
        <div className="min-w-0 flex-1 md:w-72 md:flex-none">
          <GlobalSearch />
        </div>
        <QuickCreate />
        <NotificationBell />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
