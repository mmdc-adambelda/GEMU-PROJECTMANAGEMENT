"use client";

import { Archive, ArchiveRestore, Lock, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field } from "@/components/app/form-field";
import { AppIcon, ICON_KEYS } from "@/components/app/icon";
import { SimpleSelect } from "@/components/app/simple-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { createWorkspaceAction, deleteWorkspaceAction, setWorkspaceMembersAction, updateWorkspaceAction } from "@/features/orgs/actions";
import type { MemberLite } from "@/lib/data/project";
import { runAction } from "@/lib/hooks/use-run-action";
import { isOrgAdmin } from "@/lib/permissions";
import type { OrgRole, Workspace } from "@/types";

function WorkspaceCard({ ws, members, memberIds, admin }: { ws: Workspace; members: MemberLite[]; memberIds: string[]; admin: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(ws.name);
  const [desc, setDesc] = useState(ws.description ?? "");
  const [icon, setIcon] = useState(ws.icon);
  const [priv, setPriv] = useState(ws.is_private);
  const [selected, setSelected] = useState(new Set(memberIds));
  const dirty = name !== ws.name || desc !== (ws.description ?? "") || icon !== ws.icon || priv !== ws.is_private;
  const membersDirty = selected.size !== memberIds.length || memberIds.some((m) => !selected.has(m));

  return (
    <li className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SimpleSelect size="sm" className="w-28" disabled={!admin} value={icon} onChange={setIcon} aria-label="Icon"
          options={ICON_KEYS.map((k) => ({ value: k, label: k, icon: <AppIcon name={k} className="size-4" /> }))} />
        <Input aria-label="Workspace name" className="w-56" value={name} disabled={!admin} maxLength={100} onChange={(e) => setName(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><Switch checked={priv} disabled={!admin} onCheckedChange={setPriv} /> <Lock className="size-3.5" /> Private</label>
        {ws.archived_at && <span className="rounded bg-muted px-1.5 text-xs">Archived</span>}
        {admin && (
          <div className="ml-auto flex gap-1">
            {dirty && <Button size="sm" onClick={async () => { const r = await runAction(() => updateWorkspaceAction(ws.id, { name, description: desc, icon, isPrivate: priv })); if (r.ok) router.refresh(); }}>Save</Button>}
            <Button variant="ghost" size="icon-sm" aria-label={ws.archived_at ? "Restore workspace" : "Archive workspace"}
              onClick={async () => { const r = await runAction(() => updateWorkspaceAction(ws.id, { archived: !ws.archived_at })); if (r.ok) router.refresh(); }}>
              {ws.archived_at ? <ArchiveRestore /> : <Archive />}
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Delete workspace"
              onClick={async () => { if (confirm(`Delete workspace “${ws.name}” and everything in it?`)) { const r = await runAction(() => deleteWorkspaceAction(ws.id)); if (r.ok) router.refresh(); } }}><Trash2 /></Button>
          </div>
        )}
      </div>
      <Input aria-label="Workspace description" placeholder="Description (optional)" value={desc} disabled={!admin} maxLength={500} onChange={(e) => setDesc(e.target.value)} />
      {priv ? (
        <details className="rounded-md border p-3" open>
          <summary className="cursor-pointer text-sm font-medium">Who can access this workspace ({selected.size})</summary>
          <p className="mb-2 mt-1 text-xs text-muted-foreground">Organization admins always have access. Everyone else needs to be ticked here.</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {members.filter((m) => m.role !== "owner" && m.role !== "admin").map((m) => (
              <li key={m.id}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={selected.has(m.id)} disabled={!admin}
                    onCheckedChange={(c) => setSelected((s) => { const n = new Set(s); if (c) n.add(m.id); else n.delete(m.id); return n; })} />
                  {m.full_name || m.email}
                </label>
              </li>
            ))}
          </ul>
          {membersDirty && admin && (
            <Button size="sm" className="mt-2" onClick={async () => { const r = await runAction(() => setWorkspaceMembersAction(ws.id, [...selected])); if (r.ok) router.refresh(); }}>Save access</Button>
          )}
        </details>
      ) : (
        <p className="text-xs text-muted-foreground">Visible to all organization members (guests only see what is shared with them).</p>
      )}
    </li>
  );
}

export function WorkspacesManager({
  orgId, role, workspaces, memberIds, members,
}: { orgId: string; role: OrgRole; workspaces: Workspace[]; memberIds: Record<string, string[]>; members: MemberLite[] }) {
  const router = useRouter();
  const admin = isOrgAdmin(role);
  const [name, setName] = useState("");
  return (
    <div className="space-y-6">
      {!admin && <p className="rounded-md border bg-muted/50 p-3 text-sm">Only organization admins can create or change workspaces.</p>}
      {workspaces.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No workspaces yet.</p>
      ) : (
        <ul className="space-y-3">
          {workspaces.map((w) => <WorkspaceCard key={`${w.id}-${w.name}-${w.is_private}-${w.icon}-${w.description}`} ws={w} members={members} memberIds={memberIds[w.id] ?? []} admin={admin} />)}
        </ul>
      )}
      {admin && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const r = await runAction(() => createWorkspaceAction(orgId, { name }));
          if (r.ok) { setName(""); router.refresh(); }
        }}>
          <Field label="New workspace" htmlFor="ws-new" className="min-w-64"><Input id="ws-new" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="e.g. Customer Projects" /></Field>
          <Button type="submit" variant="outline" disabled={!name.trim()}><Plus /> Create workspace</Button>
        </form>
      )}
    </div>
  );
}
