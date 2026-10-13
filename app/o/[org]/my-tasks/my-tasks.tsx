"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SimpleSelect } from "@/components/app/simple-select";
import { DueBadge, PriorityIcon } from "@/components/app/task-chips";
import { orgPath } from "@/lib/paths";
import { Checkbox } from "@/components/ui/checkbox";
import { updateTaskAction } from "@/features/tasks/actions";
import { runAction } from "@/lib/hooks/use-run-action";
import type { StatusCategory, Task, WorkflowStatus } from "@/types";

export type MyTask = Pick<Task, "id" | "key" | "title" | "due_date" | "priority" | "status_id"> & {
  project: { key: string; name: string; space_id: string; color: string };
  status: { name: string; color: string; category: StatusCategory };
};

function plus(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function MyTasks({
  orgSlug, today, showDone, tasks, statuses,
}: { orgSlug: string; today: string; showDone: boolean; tasks: MyTask[]; statuses: WorkflowStatus[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(tasks);
  const [prev, setPrev] = useState(tasks);
  if (prev !== tasks) { setPrev(tasks); setRows(tasks); }

  const week = plus(today, 7);
  const buckets: Array<{ id: string; label: string; items: MyTask[] }> = [
    { id: "overdue", label: "Overdue", items: [] },
    { id: "today", label: "Today", items: [] },
    { id: "week", label: "Next 7 days", items: [] },
    { id: "later", label: "Later", items: [] },
    { id: "none", label: "No due date", items: [] },
    { id: "done", label: "Completed", items: [] },
  ];
  for (const t of rows) {
    const b =
      t.status.category === "done" ? "done"
      : !t.due_date ? "none"
      : t.due_date < today ? "overdue"
      : t.due_date === today ? "today"
      : t.due_date <= week ? "week" : "later";
    buckets.find((x) => x.id === b)!.items.push(t);
  }

  async function setStatus(t: MyTask, statusId: string) {
    const target = statuses.find((s) => s.id === statusId);
    if (!target) return;
    const before = rows;
    setRows((r) => r.map((x) => (x.id === t.id ? { ...x, status_id: statusId, status: { name: target.name, color: target.color, category: target.category } } : x)));
    const r = await runAction(() => updateTaskAction(t.id, { statusId }), false);
    if (!r.ok) setRows(before);
    router.refresh();
  }

  async function toggleDone(t: MyTask, on: boolean) {
    const options = statuses.filter((s) => s.space_id === t.project.space_id);
    const target = on ? options.find((s) => s.category === "done") : options.find((s) => s.is_default);
    if (target) await setStatus(t, target.id);
  }

  const total = rows.filter((r) => r.status.category !== "done").length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My Tasks</h1>
          <p className="text-sm text-muted-foreground">{total} open task{total === 1 ? "" : "s"} assigned to you</p>
        </div>
        <Link href={showDone ? orgPath(orgSlug, "/my-tasks") : `${orgPath(orgSlug, "/my-tasks")}?done=1`} className="text-sm text-primary hover:underline">
          {showDone ? "Hide completed" : "Show completed"}
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <CheckCircle2 className="mx-auto mb-2 size-8 text-emerald-500" />
          <p className="font-medium">Nothing on your plate</p>
          <p className="text-sm text-muted-foreground">Tasks assigned to you will appear here.</p>
        </div>
      ) : (
        buckets.filter((b) => b.items.length).map((b) => (
          <section key={b.id} aria-labelledby={`b-${b.id}`}>
            <h2 id={`b-${b.id}`} className={`mb-2 text-sm font-semibold ${b.id === "overdue" ? "text-red-600 dark:text-red-400" : ""}`}>
              {b.label} <span className="font-normal text-muted-foreground">{b.items.length}</span>
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {b.items.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 p-3">
                  <Checkbox checked={t.status.category === "done"} onCheckedChange={(c) => toggleDone(t, Boolean(c))} aria-label={`Mark ${t.key} ${t.status.category === "done" ? "not done" : "done"}`} />
                  <PriorityIcon priority={t.priority} />
                  <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                  <Link href={orgPath(orgSlug, `/t/${t.key}`)} className={`min-w-0 flex-1 truncate font-medium hover:underline ${t.status.category === "done" ? "text-muted-foreground line-through" : ""}`}>{t.title}</Link>
                  <Link href={orgPath(orgSlug, `/p/${t.project.key}`)} className="hidden items-center gap-1.5 text-xs text-muted-foreground hover:underline sm:flex">
                    <span className="size-2 rounded-full" style={{ backgroundColor: t.project.color }} />{t.project.name}
                  </Link>
                  <DueBadge due={t.due_date} overdue={b.id === "overdue"} done={b.id === "done"} />
                  <SimpleSelect size="sm" className="w-36" value={t.status_id} aria-label={`Status of ${t.key}`}
                    onChange={(s) => setStatus(t, s)}
                    options={statuses.filter((s) => s.space_id === t.project.space_id).map((s) => ({ value: s.id, label: s.name }))} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
