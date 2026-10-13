"use client";

import { Archive, Lock, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { IconTile } from "@/components/app/icon";
import { useShell } from "@/components/app/shell/shell-context";
import { orgPath } from "@/lib/paths";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateSpaceDialog } from "@/features/spaces/create-space-dialog";
import { cn } from "@/lib/utils";
import type { Space, Workspace } from "@/types";

export function SpacesGrid({
  orgSlug, spaces, workspaces, activeWorkspaceId, counts, owners, showArchived,
}: {
  orgSlug: string;
  spaces: Space[];
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  counts: Record<string, number>;
  owners: Record<string, { name: string; avatar: string | null; email: string }>;
  showArchived: boolean;
}) {
  const { role } = useShell();
  const [q, setQ] = useState("");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const wsName = new Map(workspaces.map((w) => [w.id, w.name]));
  const list = spaces
    .filter((s) => (showArchived ? true : !s.archived_at))
    .filter((s) => !activeWorkspaceId || s.workspace_id === activeWorkspaceId)
    .filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
  const canCreate = role !== "guest";

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Spaces</h1>
          <p className="text-sm text-muted-foreground">
            {activeWorkspaceId ? `In ${wsName.get(activeWorkspaceId)}` : "Across all workspaces"} · {list.length} space{list.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input aria-label="Search spaces" placeholder="Search spaces…" className="w-48" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="inline-flex rounded-md border p-0.5 text-xs" role="group" aria-label="Layout">
            {(["grid", "list"] as const).map((l) => (
              <button key={l} aria-pressed={layout === l} onClick={() => setLayout(l)} className={cn("rounded px-2.5 py-1 capitalize", layout === l ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{l}</button>
            ))}
          </div>
          <Button variant="outline" size="sm" render={<Link href={`${orgPath(orgSlug, "/spaces")}${showArchived ? "" : "?archived=1"}`} />}>
            <Archive /> {showArchived ? "Hide archived" : "Show archived"}
          </Button>
          {canCreate && <CreateSpaceDialog trigger={<Button size="sm"><Plus /> New space</Button>} />}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="font-medium">{spaces.length === 0 ? "No spaces yet" : "No spaces match"}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Spaces are the big areas of your work — Software Development, IT Operations, Customer Success… Each has its own projects and workflow.
          </p>
          {canCreate && spaces.length === 0 && <div className="mt-4"><CreateSpaceDialog trigger={<Button>Create your first space</Button>} /></div>}
        </div>
      ) : (
        <ul className={layout === "grid" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "divide-y rounded-xl border"}>
          {list.map((s) => {
            const owner = s.owner_id ? owners[s.owner_id] : undefined;
            return (
              <li key={s.id} className={layout === "grid" ? "" : "bg-card"}>
                <Link
                  href={orgPath(orgSlug, `/spaces/${s.id}`)}
                  className={cn(
                    "group flex gap-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    layout === "grid" ? "h-full flex-col rounded-xl border bg-card p-4 hover:border-primary/50 hover:shadow-sm" : "items-center p-3 hover:bg-muted/40",
                    s.archived_at && "opacity-60",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <IconTile name={s.icon} color={s.color} className="size-9" />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate font-medium">
                        {s.name}
                        {s.is_private && <Lock className="size-3.5 text-muted-foreground" aria-label="Private" />}
                        {s.archived_at && <span className="rounded bg-muted px-1.5 text-[10px] font-normal">Archived</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{wsName.get(s.workspace_id)}</p>
                    </div>
                  </div>
                  {layout === "grid" && s.description && <p className="line-clamp-2 text-sm text-muted-foreground">{s.description}</p>}
                  <div className={cn("flex items-center gap-3 text-xs text-muted-foreground", layout === "grid" ? "mt-auto" : "ml-auto")}>
                    <span>{counts[s.id] ?? 0} project{(counts[s.id] ?? 0) === 1 ? "" : "s"}</span>
                    {owner && <span className="flex items-center gap-1"><UserAvatar name={owner.name} email={owner.email} src={owner.avatar} className="size-5" />{owner.name}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
