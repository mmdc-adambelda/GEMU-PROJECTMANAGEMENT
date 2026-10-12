"use client";

import { ArrowDown, ArrowUp, Plus, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SimpleSelect } from "@/components/app/simple-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  createStatusAction, deleteStatusAction, reorderStatusesAction, setDefaultStatusAction, setTransitionsAction, updateStatusAction,
} from "@/features/spaces/actions";
import { runAction } from "@/lib/hooks/use-run-action";
import type { StatusCategory, WorkflowStatus, WorkflowTransition } from "@/types";

const CATEGORIES: Array<{ value: StatusCategory; label: string }> = [
  { value: "todo", label: "To Do" }, { value: "in_progress", label: "In Progress" }, { value: "done", label: "Done" },
];
const REQUIRED = [
  { id: "assignee", label: "Assignee" }, { id: "due_date", label: "Due date" },
  { id: "estimate", label: "Estimate" }, { id: "resolution", label: "Resolution" },
];

function StatusRow({
  s, index, total, canManage, onMove, onDelete,
}: { s: WorkflowStatus; index: number; total: number; canManage: boolean; onMove: (dir: -1 | 1) => void; onDelete: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(s.name);
  const [wip, setWip] = useState(s.wip_limit ? String(s.wip_limit) : "");
  const save = async (patch: Parameters<typeof updateStatusAction>[1]) => {
    const r = await runAction(() => updateStatusAction(s.id, patch), false);
    if (r.ok) router.refresh();
    return r.ok;
  };
  return (
    <li className="flex flex-wrap items-center gap-2 p-2.5">
      <input type="color" aria-label={`Color of ${s.name}`} value={s.color} disabled={!canManage}
        onChange={(e) => void save({ color: e.target.value })} className="size-7 cursor-pointer rounded border bg-transparent p-0.5" />
      <Input aria-label={`Name of ${s.name}`} className="w-44" value={name} disabled={!canManage} maxLength={50}
        onChange={(e) => setName(e.target.value)}
        onBlur={async () => { if (name.trim() && name.trim() !== s.name) { if (!(await save({ name: name.trim() }))) setName(s.name); } else setName(s.name); }} />
      <SimpleSelect size="sm" className="w-36" disabled={!canManage} value={s.category} aria-label={`Category of ${s.name}`}
        onChange={(category) => save({ category })} options={CATEGORIES} />
      <Input aria-label={`WIP limit of ${s.name}`} className="w-24" type="number" min={1} placeholder="WIP limit" value={wip} disabled={!canManage}
        onChange={(e) => setWip(e.target.value)}
        onBlur={() => { const v = wip ? Number(wip) : null; if (v !== s.wip_limit) void save({ wipLimit: v }); }} />
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input type="radio" name="default-status" checked={s.is_default} disabled={!canManage}
          onChange={async () => { const r = await runAction(() => setDefaultStatusAction(s.space_id, s.id), false); if (r.ok) router.refresh(); }} />
        <Star className="size-3.5" /> Default
      </label>
      {canManage && (
        <div className="ml-auto flex">
          <Button variant="ghost" size="icon-sm" aria-label={`Move ${s.name} up`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp /></Button>
          <Button variant="ghost" size="icon-sm" aria-label={`Move ${s.name} down`} disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown /></Button>
          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${s.name}`} disabled={s.is_default} onClick={onDelete}><Trash2 /></Button>
        </div>
      )}
    </li>
  );
}

function TransitionRow({
  from, statuses, rules, canManage, spaceId,
}: { from: WorkflowStatus; statuses: WorkflowStatus[]; rules: Map<string, string[]>; canManage: boolean; spaceId: string }) {
  const router = useRouter();
  const [state, setState] = useState(rules);
  const [dirty, setDirty] = useState(false);
  const others = statuses.filter((s) => s.id !== from.id);
  const unrestricted = state.size === 0;

  const toggle = (id: string, on: boolean) => {
    const n = new Map(state);
    if (on) n.set(id, n.get(id) ?? []); else n.delete(id);
    setState(n); setDirty(true);
  };
  const setReq = (id: string, req: string, on: boolean) => {
    const n = new Map(state);
    const cur = n.get(id) ?? [];
    n.set(id, on ? [...cur, req] : cur.filter((x) => x !== req));
    setState(n); setDirty(true);
  };

  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex w-36 items-center gap-1.5 text-sm font-medium"><span className="size-2.5 rounded-full" style={{ backgroundColor: from.color }} />{from.name}</span>
        <span className="text-muted-foreground" aria-hidden>→</span>
        <span className="text-xs text-muted-foreground">{unrestricted ? "Any status (no restrictions)" : "Only the checked statuses"}</span>
        {dirty && canManage && (
          <Button size="sm" className="ml-auto" onClick={async () => {
            const r = await runAction(() => setTransitionsAction(spaceId, from.id, [...state.entries()].map(([to, required]) => ({ to, required }))));
            if (r.ok) { setDirty(false); router.refresh(); }
          }}>Save</Button>
        )}
      </div>
      <ul className="flex flex-wrap gap-2">
        {others.map((o) => {
          const on = state.has(o.id);
          return (
            <li key={o.id} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
              <label className="flex cursor-pointer items-center gap-1.5">
                <Checkbox checked={on} disabled={!canManage} onCheckedChange={(c) => toggle(o.id, Boolean(c))} />
                <span className="size-2 rounded-full" style={{ backgroundColor: o.color }} />{o.name}
              </label>
              {on && canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="xs" aria-label={`Required fields for ${from.name} to ${o.name}`} />}>
                    {(state.get(o.id)?.length ?? 0) > 0 ? `${state.get(o.id)!.length} req.` : "req."}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Required to make this move</DropdownMenuLabel>
                    {REQUIRED.map((r) => (
                      <DropdownMenuCheckboxItem key={r.id} checked={state.get(o.id)?.includes(r.id) ?? false} onCheckedChange={(c) => setReq(o.id, r.id, Boolean(c))}>
                        {r.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

export function WorkflowEditor({
  spaceId, statuses, transitions, canManage,
}: { spaceId: string; statuses: WorkflowStatus[]; transitions: WorkflowTransition[]; canManage: boolean }) {
  const router = useRouter();
  const sorted = [...statuses].sort((a, b) => a.position - b.position);
  const [name, setName] = useState("");
  const [cat, setCat] = useState<StatusCategory>("in_progress");
  const [delTarget, setDelTarget] = useState<WorkflowStatus | null>(null);
  const [reassign, setReassign] = useState("");

  async function move(i: number, dir: -1 | 1) {
    const ids = sorted.map((s) => s.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    const r = await runAction(() => reorderStatusesAction(spaceId, ids), false);
    if (r.ok) router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="st-h">
        <div>
          <h2 id="st-h" className="text-base font-semibold">Statuses</h2>
          <p className="text-sm text-muted-foreground">
            These columns are shared by every project in this space. The category drives progress, overdue and completion tracking.
            The WIP limit is a visual warning on the board, not a hard block.
          </p>
        </div>
        <ul className="divide-y rounded-xl border bg-card">
          {sorted.map((s, i) => (
            <StatusRow key={`${s.id}-${s.name}-${s.color}-${s.category}-${s.wip_limit}-${s.is_default}`} s={s} index={i} total={sorted.length} canManage={canManage}
              onMove={(d) => move(i, d)} onDelete={() => { setDelTarget(s); setReassign(""); }} />
          ))}
        </ul>
        {canManage && (
          <form className="flex flex-wrap gap-2" onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const r = await runAction(() => createStatusAction({ spaceId, name, category: cat }));
            if (r.ok) { setName(""); router.refresh(); }
          }}>
            <Input aria-label="New status name" placeholder="New status name" className="w-56" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
            <SimpleSelect className="w-40" value={cat} onChange={setCat} options={CATEGORIES} aria-label="Category of new status" />
            <Button type="submit" variant="outline" disabled={!name.trim()}><Plus /> Add status</Button>
          </form>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="tr-h">
        <div>
          <h2 id="tr-h" className="text-base font-semibold">Allowed transitions</h2>
          <p className="text-sm text-muted-foreground">
            By default a task can move from any status to any other. Tick the statuses a task may move to from each status to restrict the workflow,
            and mark fields that must be filled in (for example <em>Resolution</em> when moving to Done). Rules are enforced by the database, so they
            apply to the board, the list, bulk edits and the API.
          </p>
        </div>
        <ul className="divide-y rounded-xl border bg-card">
          {sorted.map((s) => (
            <TransitionRow key={`${s.id}-${transitions.filter((t) => t.from_status_id === s.id).map((t) => t.to_status_id + t.required_fields.join()).join("|")}`}
              from={s} statuses={sorted} canManage={canManage} spaceId={spaceId}
              rules={new Map(transitions.filter((t) => t.from_status_id === s.id).map((t) => [t.to_status_id, t.required_fields]))} />
          ))}
        </ul>
      </section>

      <Dialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{delTarget?.name}”?</DialogTitle>
            <DialogDescription>
              Tasks currently in this status must be moved first. Choose where they should go; if no task uses the status you can leave it empty.
            </DialogDescription>
          </DialogHeader>
          <SimpleSelect className="w-full" placeholder="Move existing tasks to…" value={reassign || null} onChange={setReassign}
            options={sorted.filter((s) => s.id !== delTarget?.id).map((s) => ({ value: s.id, label: s.name }))} />
          <DialogFooter>
            <Button variant="destructive" onClick={async () => {
              const r = await runAction(() => deleteStatusAction(delTarget!.id, reassign || null));
              if (r.ok) { setDelTarget(null); router.refresh(); }
            }}>Delete status</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
