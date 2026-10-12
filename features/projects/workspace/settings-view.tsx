"use client";

import { Archive, ArchiveRestore, Copy, Trash2, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormError, SubmitButton } from "@/components/app/form-field";
import { SimpleSelect } from "@/components/app/simple-select";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  archiveProjectAction, deleteProjectAction, duplicateProjectAction, setProjectMemberAction, updateProjectAction,
} from "@/features/projects/actions";
import { PRIORITIES, PRIORITY_LABEL, PROJECT_STATUS_LABEL } from "@/lib/constants";
import { runAction } from "@/lib/hooks/use-run-action";
import type { ProjectRole, ProjectStatus, TaskPriority } from "@/types";
import { personName, useWorkspace } from "./context";
import { suggestKey } from "@/features/projects/create-project-dialog";

export function SettingsView({ projectMembers }: { projectMembers: Array<{ user_id: string; role: ProjectRole }> }) {
  const w = useWorkspace();
  const router = useRouter();
  const p = w.project;
  const [name, setName] = useState(p.name);
  const [description, setDescription] = useState(p.description ?? "");
  const [leadId, setLeadId] = useState(p.lead_id ?? "none");
  const [start, setStart] = useState(p.start_date ?? "");
  const [due, setDue] = useState(p.due_date ?? "");
  const [priority, setPriority] = useState<TaskPriority>(p.priority);
  const [status, setStatus] = useState<ProjectStatus>(p.status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [dupName, setDupName] = useState(`${p.name} (copy)`);
  const [dupKey, setDupKey] = useState(suggestKey(p.name + " 2"));
  const [dupTasks, setDupTasks] = useState(false);
  const [confirmKey, setConfirmKey] = useState("");
  const [addUser, setAddUser] = useState("");
  const [addRole, setAddRole] = useState<ProjectRole>("member");
  const disabled = !w.canManage;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const r = await runAction(() =>
      updateProjectAction(p.id, { name, description, leadId: leadId === "none" ? null : leadId, startDate: start, dueDate: due, priority, status }),
    );
    setPending(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  const memberIds = new Set(projectMembers.map((m) => m.user_id));
  const candidates = w.members.filter((m) => !memberIds.has(m.id));

  return (
    <div className="max-w-3xl space-y-8">
      {disabled && <p className="rounded-md border bg-muted/50 p-3 text-sm">Only project leads, space admins and organization admins can change these settings.</p>}
      <form onSubmit={save} className="space-y-4">
        <h2 className="text-base font-semibold">General</h2>
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label="Name" htmlFor="ps-name"><Input id="ps-name" value={name} disabled={disabled} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Key" htmlFor="ps-key" hint="Cannot be changed"><Input id="ps-key" value={p.key} disabled className="font-mono" /></Field>
        </div>
        <Field label="Description" htmlFor="ps-desc"><Textarea id="ps-desc" rows={3} value={description} disabled={disabled} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project lead" htmlFor="ps-lead">
            <SimpleSelect id="ps-lead" className="w-full" disabled={disabled} value={leadId} onChange={setLeadId}
              options={[{ value: "none", label: "No lead" }, ...w.members.map((m) => ({ value: m.id, label: personName(m) }))]} />
          </Field>
          <Field label="Status" htmlFor="ps-status">
            <SimpleSelect id="ps-status" className="w-full" disabled={disabled} value={status} onChange={setStatus}
              options={(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s] }))} />
          </Field>
          <Field label="Start date" htmlFor="ps-start"><Input id="ps-start" type="date" value={start} disabled={disabled} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Due date" htmlFor="ps-due"><Input id="ps-due" type="date" value={due} disabled={disabled} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Priority" htmlFor="ps-prio">
            <SimpleSelect id="ps-prio" className="w-full" disabled={disabled} value={priority} onChange={setPriority}
              options={PRIORITIES.map((x) => ({ value: x, label: PRIORITY_LABEL[x] }))} />
          </Field>
        </div>
        {!disabled && <SubmitButton pending={pending}>Save changes</SubmitButton>}
      </form>

      <section className="space-y-3" aria-labelledby="members-h">
        <div>
          <h2 id="members-h" className="text-base font-semibold">Project access</h2>
          <p className="text-sm text-muted-foreground">
            Organization members can already work in projects of public spaces. Add people here to give guests access, make someone read-only
            (viewer), or name additional leads.
          </p>
        </div>
        <ul className="divide-y rounded-lg border">
          {projectMembers.length === 0 && <li className="p-3 text-sm text-muted-foreground">No explicit members.</li>}
          {projectMembers.map((m) => {
            const person = w.people.get(m.user_id);
            return (
              <li key={m.user_id} className="flex items-center gap-3 p-2.5">
                <UserAvatar name={person?.full_name} email={person?.email} src={person?.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{personName(person)}</p>
                  <p className="truncate text-xs text-muted-foreground">{person?.email}</p>
                </div>
                <SimpleSelect size="sm" className="w-28" disabled={disabled} value={m.role}
                  onChange={async (role) => { await runAction(() => setProjectMemberAction(p.id, m.user_id, role)); router.refresh(); }}
                  options={[{ value: "lead", label: "Lead" }, { value: "member", label: "Member" }, { value: "viewer", label: "Viewer" }]} />
                {!disabled && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${personName(person)}`}
                    onClick={async () => { await runAction(() => setProjectMemberAction(p.id, m.user_id, null)); router.refresh(); }}><X /></Button>
                )}
              </li>
            );
          })}
        </ul>
        {!disabled && (
          <div className="flex flex-wrap gap-2">
            <SimpleSelect className="w-56" placeholder="Add a person…" value={addUser || null} onChange={setAddUser}
              options={candidates.map((m) => ({ value: m.id, label: `${personName(m)}${m.role === "guest" ? " (guest)" : ""}` }))} />
            <SimpleSelect className="w-28" value={addRole} onChange={setAddRole}
              options={[{ value: "lead", label: "Lead" }, { value: "member", label: "Member" }, { value: "viewer", label: "Viewer" }]} />
            <Button variant="outline" disabled={!addUser}
              onClick={async () => { const r = await runAction(() => setProjectMemberAction(p.id, addUser, addRole)); if (r.ok) { setAddUser(""); router.refresh(); } }}>
              <UserPlus /> Add
            </Button>
          </div>
        )}
      </section>

      {!disabled && (
        <section className="space-y-3 rounded-lg border border-destructive/30 p-4" aria-labelledby="danger-h">
          <h2 id="danger-h" className="text-base font-semibold text-destructive">Danger zone</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDupOpen(true)}><Copy /> Duplicate project</Button>
            <Button variant="outline"
              onClick={async () => { const r = await runAction(() => archiveProjectAction(p.id, !p.archived_at)); if (r.ok) router.refresh(); }}>
              {p.archived_at ? <><ArchiveRestore /> Restore project</> : <><Archive /> Archive project</>}
            </Button>
            <Button variant="destructive" onClick={() => setDelOpen(true)}><Trash2 /> Delete project</Button>
          </div>
          {p.archived_at && <p className="text-xs text-muted-foreground">This project is archived and hidden from navigation.</p>}
        </section>
      )}

      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate project</DialogTitle>
            <DialogDescription>Creates a new project in the same space. You become its lead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Name" htmlFor="dup-name"><Input id="dup-name" value={dupName} onChange={(e) => setDupName(e.target.value)} /></Field>
            <Field label="Key" htmlFor="dup-key"><Input id="dup-key" className="font-mono uppercase" maxLength={10} value={dupKey} onChange={(e) => setDupKey(e.target.value.toUpperCase())} /></Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dupTasks} onChange={(e) => setDupTasks(e.target.checked)} /> Copy open tasks (without comments or attachments)
            </label>
          </div>
          <DialogFooter>
            <Button onClick={async () => {
              const r = await runAction(() => duplicateProjectAction(p.id, dupName, dupKey, dupTasks));
              if (r.ok) { setDupOpen(false); router.push(`/o/${w.orgSlug}/p/${r.data.key}`); router.refresh(); }
            }}>Duplicate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {p.name}?</DialogTitle>
            <DialogDescription>This permanently deletes the project, all its tasks, comments and attachments records. Type <strong>{p.key}</strong> to confirm.</DialogDescription>
          </DialogHeader>
          <Input aria-label="Type the project key to confirm" value={confirmKey} onChange={(e) => setConfirmKey(e.target.value)} />
          <DialogFooter>
            <Button variant="destructive" disabled={confirmKey !== p.key}
              onClick={async () => { const r = await runAction(() => deleteProjectAction(p.id)); if (r.ok) { router.replace(`/o/${w.orgSlug}/spaces`); router.refresh(); } }}>
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
