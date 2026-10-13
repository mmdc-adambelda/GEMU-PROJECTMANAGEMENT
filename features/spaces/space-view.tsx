"use client";

import { Archive, ArchiveRestore, Lock, Plus, Trash2, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, SubmitButton } from "@/components/app/form-field";
import { IconTile } from "@/components/app/icon";
import { ColorPicker, IconPicker } from "@/components/app/pickers";
import { useShell } from "@/components/app/shell/shell-context";
import { orgPath } from "@/lib/paths";
import { SimpleSelect } from "@/components/app/simple-select";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CreateProjectDialog } from "@/features/projects/create-project-dialog";
import { deleteSpaceAction, setSpaceMemberAction, updateSpaceAction } from "@/features/spaces/actions";
import { AutomationsEditor, type ExecutionLite } from "@/features/spaces/automations-editor";
import { FieldsEditor } from "@/features/spaces/fields-editor";
import { WorkflowEditor } from "@/features/spaces/workflow-editor";
import { ActivityList } from "@/components/app/activity-list";
import type { MemberLite } from "@/lib/data/project";
import { runAction } from "@/lib/hooks/use-run-action";
import { isOrgAdmin } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type {
  ActivityEntry, AutomationRule, CustomFieldDefinition, Project, ProjectStats, Space, SpaceRole, WorkflowStatus, WorkflowTransition,
} from "@/types";

type Tab = "projects" | "workflow" | "fields" | "automations" | "members" | "activity" | "settings";

interface Props {
  space: Space;
  workspaceName: string;
  projects: Array<Project & { stats: ProjectStats | null }>;
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
  fields: CustomFieldDefinition[];
  rules: AutomationRule[];
  executions: ExecutionLite[];
  members: MemberLite[];
  spaceMembers: Array<{ user_id: string; role: SpaceRole }>;
  activity: ActivityEntry[];
  access: { can_manage: boolean; can_create_project: boolean };
  initialTab: Tab;
}

function ProjectsTab({ space, projects, access, orgSlug }: Pick<Props, "space" | "projects" | "access"> & { orgSlug: string }) {
  const [showArchived, setShowArchived] = useState(false);
  const list = projects.filter((p) => showArchived || !p.archived_at);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold">Projects</h2>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground"><Switch checked={showArchived} onCheckedChange={setShowArchived} /> Show archived</label>
        {access.can_create_project && <CreateProjectDialog defaultSpaceId={space.id} trigger={<Button size="sm"><Plus /> New project</Button>} />}
      </div>
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="font-medium">No projects in this space yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Projects hold tasks and offer list, board, calendar and timeline views.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <li key={p.id}>
              <Link href={orgPath(orgSlug, `/p/${p.key}`)} className={cn("block h-full space-y-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring", p.archived_at && "opacity-60")}>
                <div className="flex items-center gap-3">
                  <IconTile name={p.icon} color={p.color} className="size-9" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{p.key}{p.archived_at ? " · archived" : ""}</p>
                  </div>
                </div>
                {p.description && <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                <div>
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>{p.stats?.done_tasks ?? 0}/{p.stats?.total_tasks ?? 0} done</span>
                    <span>{p.stats?.progress_pct ?? 0}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={p.stats?.progress_pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.name} progress`}>
                    <div className="h-full rounded-full" style={{ width: `${p.stats?.progress_pct ?? 0}%`, backgroundColor: p.color }} />
                  </div>
                  {!!p.stats?.overdue_tasks && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{p.stats.overdue_tasks} overdue</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MembersTab({ space, members, spaceMembers, canManage }: Pick<Props, "space" | "members" | "spaceMembers"> & { canManage: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [role, setRole] = useState<SpaceRole>("member");
  const ids = new Set(spaceMembers.map((m) => m.user_id));
  const owner = members.find((m) => m.id === space.owner_id);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Members & access</h2>
        <p className="text-sm text-muted-foreground">
          {space.is_private
            ? "This space is private: only organization admins, the owner and the people listed here can see it."
            : "This space is visible to all members of the workspace. Add people here to make them space admins, read-only viewers, or to share it with guests."}
        </p>
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {owner && (
          <li className="flex items-center gap-3 p-2.5">
            <UserAvatar name={owner.full_name} email={owner.email} src={owner.avatar_url} />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{owner.full_name || owner.email}</p><p className="text-xs text-muted-foreground">Space owner</p></div>
          </li>
        )}
        {spaceMembers.map((m) => {
          const p = members.find((x) => x.id === m.user_id);
          return (
            <li key={m.user_id} className="flex items-center gap-3 p-2.5">
              <UserAvatar name={p?.full_name} email={p?.email} src={p?.avatar_url} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{p?.full_name || p?.email}</p><p className="truncate text-xs text-muted-foreground">{p?.email}</p></div>
              <SimpleSelect size="sm" className="w-28" disabled={!canManage} value={m.role}
                onChange={async (r) => { const x = await runAction(() => setSpaceMemberAction(space.id, m.user_id, r)); if (x.ok) router.refresh(); }}
                options={[{ value: "admin", label: "Admin" }, { value: "member", label: "Member" }, { value: "viewer", label: "Viewer" }]} />
              {canManage && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${p?.full_name ?? "member"}`}
                onClick={async () => { const x = await runAction(() => setSpaceMemberAction(space.id, m.user_id, null)); if (x.ok) router.refresh(); }}><X /></Button>}
            </li>
          );
        })}
        {spaceMembers.length === 0 && !owner && <li className="p-3 text-sm text-muted-foreground">No explicit members.</li>}
      </ul>
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <SimpleSelect className="w-60" placeholder="Add a person…" value={user || null} onChange={setUser}
            options={members.filter((m) => !ids.has(m.id)).map((m) => ({ value: m.id, label: `${m.full_name || m.email}${m.role === "guest" ? " (guest)" : ""}` }))} />
          <SimpleSelect className="w-28" value={role} onChange={setRole} options={[{ value: "admin", label: "Admin" }, { value: "member", label: "Member" }, { value: "viewer", label: "Viewer" }]} />
          <Button variant="outline" disabled={!user} onClick={async () => { const x = await runAction(() => setSpaceMemberAction(space.id, user, role)); if (x.ok) { setUser(""); router.refresh(); } }}><UserPlus /> Add</Button>
        </div>
      )}
    </div>
  );
}

function SettingsTab({ space, members, canManage }: Pick<Props, "space" | "members"> & { canManage: boolean }) {
  const router = useRouter();
  const { org, role } = useShell();
  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description ?? "");
  const [color, setColor] = useState(space.color);
  const [icon, setIcon] = useState(space.icon);
  const [isPrivate, setPrivate] = useState(space.is_private);
  const [owner, setOwner] = useState(space.owner_id ?? "");
  const [pending, setPending] = useState(false);
  return (
    <div className="max-w-2xl space-y-8">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const r = await runAction(() => updateSpaceAction(space.id, { name, description, color, icon, isPrivate, ...(owner ? { ownerId: owner } : {}) }));
        setPending(false);
        if (r.ok) router.refresh();
      }}>
        <Field label="Name" htmlFor="sp-name"><Input id="sp-name" value={name} disabled={!canManage} onChange={(e) => setName(e.target.value)} maxLength={100} /></Field>
        <Field label="Description" htmlFor="sp-desc"><Textarea id="sp-desc" rows={3} value={description} disabled={!canManage} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Owner" htmlFor="sp-owner">
          <SimpleSelect id="sp-owner" className="w-full" disabled={!canManage} value={owner || null} onChange={setOwner}
            options={members.filter((m) => m.role !== "guest").map((m) => ({ value: m.id, label: m.full_name || m.email }))} />
        </Field>
        <div className="space-y-1.5"><span className="text-sm font-medium">Color</span><ColorPicker value={color} onChange={setColor} /></div>
        <div className="space-y-1.5"><span className="text-sm font-medium">Icon</span><IconPicker value={icon} onChange={setIcon} color={color} /></div>
        <label className="flex items-start justify-between gap-4 rounded-md border p-3">
          <span><span className="block text-sm font-medium">Private space</span><span className="block text-xs text-muted-foreground">Hidden from members who are not added to it.</span></span>
          <Switch checked={isPrivate} disabled={!canManage} onCheckedChange={setPrivate} />
        </label>
        {canManage && <SubmitButton pending={pending}>Save changes</SubmitButton>}
      </form>
      {canManage && (
        <section className="space-y-3 rounded-lg border border-destructive/30 p-4">
          <h2 className="text-base font-semibold text-destructive">Danger zone</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={async () => { const r = await runAction(() => updateSpaceAction(space.id, { archived: !space.archived_at })); if (r.ok) router.refresh(); }}>
              {space.archived_at ? <><ArchiveRestore /> Restore space</> : <><Archive /> Archive space</>}
            </Button>
            {isOrgAdmin(role) && (
              <Button variant="destructive" onClick={async () => {
                if (!confirm(`Delete “${space.name}” with all its projects and tasks? This cannot be undone.`)) return;
                const r = await runAction(() => deleteSpaceAction(space.id));
                if (r.ok) { router.replace(orgPath(org.slug, "/spaces")); router.refresh(); }
              }}><Trash2 /> Delete space</Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export function SpaceView(props: Props) {
  const { space, access } = props;
  const { org, role } = useShell();
  const [tab, setTab] = useState<Tab>(props.initialTab);
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "projects", label: "Projects" }, { id: "workflow", label: "Workflow" }, { id: "fields", label: "Custom fields" },
    { id: "automations", label: "Automations" }, { id: "members", label: "Members" }, { id: "activity", label: "Activity" }, { id: "settings", label: "Settings" },
  ];
  const go = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  };
  const people = new Map(props.members.map((m) => [m.id, m]));
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <IconTile name={space.icon} color={space.color} className="size-10" />
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 truncate text-xl font-semibold tracking-tight">
            {space.name}
            {space.is_private && <Lock className="size-4 text-muted-foreground" aria-label="Private space" />}
            {space.archived_at && <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal">Archived</span>}
          </h1>
          <p className="text-sm text-muted-foreground">{props.workspaceName}{space.description ? ` · ${space.description}` : ""}</p>
        </div>
      </div>
      <nav aria-label="Space sections" className="mt-4 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => go(t.id)} aria-current={tab === t.id ? "page" : undefined}
            className={cn("-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", tab === t.id && "border-primary font-medium text-foreground")}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="pt-6">
        {tab === "projects" && <ProjectsTab space={space} projects={props.projects} access={access} orgSlug={org.slug} />}
        {tab === "workflow" && <WorkflowEditor spaceId={space.id} statuses={props.statuses} transitions={props.transitions} canManage={access.can_manage} />}
        {tab === "fields" && <FieldsEditor orgId={org.id} spaceId={space.id} fields={props.fields} canManage={access.can_manage} isOrgAdmin={isOrgAdmin(role)} />}
        {tab === "automations" && <AutomationsEditor orgId={org.id} spaceId={space.id} rules={props.rules} executions={props.executions} statuses={props.statuses} members={props.members} canManage={access.can_manage} />}
        {tab === "members" && <MembersTab space={space} members={props.members} spaceMembers={props.spaceMembers} canManage={access.can_manage} />}
        {tab === "activity" && <div className="max-w-2xl"><ActivityList entries={props.activity} people={people} /></div>}
        {tab === "settings" && <SettingsTab space={space} members={props.members} canManage={access.can_manage} />}
      </div>
    </div>
  );
}
