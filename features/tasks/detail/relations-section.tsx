"use client";

import { Ban, GitBranch, Link2, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchTasksAction } from "@/features/tasks/detail-actions";
import { addDependencyAction, createTaskAction, removeDependencyAction, updateTaskAction } from "@/features/tasks/actions";
import { runAction } from "@/lib/hooks/use-run-action";
import type { SubtaskRow, TaskLite } from "@/lib/data/task-detail";
import type { WorkflowStatus } from "@/types";
import { personLabel, type DetailEnv } from "./env";

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((100 * done) / total) : 0;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Subtask progress">
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      {done}/{total}
    </div>
  );
}

export function SubtasksSection({
  parentId, subtasks, env, onChanged, onOpen,
}: { parentId: string; subtasks: SubtaskRow[]; env: DetailEnv; onChanged: () => void; onOpen: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const catOf = (s: string) => env.statuses.find((x) => x.id === s)?.category;
  const done = subtasks.filter((s) => catOf(s.status_id) === "done").length;
  const doneStatus: WorkflowStatus | undefined = env.statuses.find((s) => s.category === "done");
  const openStatus: WorkflowStatus | undefined = env.statuses.find((s) => s.is_default);

  async function toggle(s: SubtaskRow, on: boolean) {
    const target = on ? doneStatus : openStatus;
    if (!target) return;
    const r = await runAction(() => updateTaskAction(s.id, { statusId: target.id }), false);
    if (r.ok) onChanged();
  }

  return (
    <section aria-labelledby="sub-h" className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 id="sub-h" className="flex items-center gap-2 text-sm font-semibold"><GitBranch className="size-4" /> Subtasks</h3>
        {subtasks.length > 0 && <Progress done={done} total={subtasks.length} />}
      </div>
      <ul className="space-y-1">
        {subtasks.map((s) => (
          <li key={s.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
            <Checkbox checked={catOf(s.status_id) === "done"} disabled={!env.canEdit} onCheckedChange={(c) => toggle(s, Boolean(c))} aria-label={`Mark ${s.key} done`} />
            <span className="font-mono text-xs text-muted-foreground">{s.key}</span>
            <button className="min-w-0 flex-1 truncate text-left text-sm hover:underline" onClick={() => onOpen(s.id)}>{s.title}</button>
            {s.assignee_id && <UserAvatar name={personLabel(env.members.find((m) => m.id === s.assignee_id))} className="size-5" />}
          </li>
        ))}
      </ul>
      {env.canEdit && (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            const r = await runAction(() => createTaskAction({ projectId: env.project.id, title, parentId }), false);
            if (r.ok) { setTitle(""); onChanged(); }
          }}
        >
          <Input aria-label="New subtask title" placeholder="Add a subtask…" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
          <Button type="submit" size="sm" variant="outline" disabled={!title.trim()}><Plus /> Add</Button>
        </form>
      )}
    </section>
  );
}

function TaskPicker({ orgId, excludeIds, onPick }: { orgId: string; excludeIds: string[]; onPick: (t: TaskLite) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Array<{ id: string; key: string; title: string; project_id: string }>>([]);
  const excluded = excludeIds.join(",");
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      const r = await searchTasksAction(orgId, q);
      if (r.ok) setRes(r.data.filter((x) => !excluded.split(",").includes(x.id)));
    }, 200);
    return () => clearTimeout(t);
  }, [q, orgId, excluded]);
  return (
    <div className="space-y-2">
      <Input autoFocus aria-label="Search tasks" placeholder="Search by key or title…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="max-h-56 overflow-y-auto">
        {(q.trim().length < 2 ? [] : res).map((t) => (
          <li key={t.id}>
            <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => onPick({ ...t, status_id: "" })}>
              <span className="font-mono text-xs text-muted-foreground">{t.key}</span><span className="truncate">{t.title}</span>
            </button>
          </li>
        ))}
        {q.trim().length >= 2 && res.length === 0 && <li className="px-2 py-1.5 text-sm text-muted-foreground">No matching tasks.</li>}
      </ul>
    </div>
  );
}

export function DependenciesSection({
  taskId, blockedBy, blocking, env, onChanged, onOpen,
}: { taskId: string; blockedBy: TaskLite[]; blocking: TaskLite[]; env: DetailEnv; onChanged: () => void; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const doneIds = new Set(env.statuses.filter((s) => s.category === "done").map((s) => s.id));
  return (
    <section aria-labelledby="dep-h" className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 id="dep-h" className="flex items-center gap-2 text-sm font-semibold"><Link2 className="size-4" /> Dependencies</h3>
        {env.canEdit && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger render={<Button variant="outline" size="sm" />}><Plus /> Blocked by</PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <TaskPicker orgId={env.orgId} excludeIds={[taskId, ...blockedBy.map((b) => b.id)]}
                onPick={async (t) => { const r = await runAction(() => addDependencyAction(taskId, t.id)); if (r.ok) { setOpen(false); onChanged(); } }} />
            </PopoverContent>
          </Popover>
        )}
      </div>
      {blockedBy.length === 0 && blocking.length === 0 && <p className="text-sm text-muted-foreground">No dependencies.</p>}
      {blockedBy.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Blocked by</p>
          <ul className="space-y-1">
            {blockedBy.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-sm">
                <Ban className={doneIds.has(b.status_id) ? "size-3.5 text-emerald-500" : "size-3.5 text-red-500"} aria-label={doneIds.has(b.status_id) ? "Resolved" : "Blocking"} />
                <span className="font-mono text-xs text-muted-foreground">{b.key}</span>
                <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onOpen(b.id)}>{b.title}</button>
                {env.canEdit && <Button variant="ghost" size="icon-xs" aria-label={`Remove dependency on ${b.key}`}
                  onClick={async () => { const r = await runAction(() => removeDependencyAction(taskId, b.id), false); if (r.ok) onChanged(); }}><X /></Button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {blocking.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Blocks</p>
          <ul className="space-y-1">
            {blocking.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{b.key}</span>
                <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onOpen(b.id)}>{b.title}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
