import { PRIORITY_RANK } from "@/lib/constants";
import type { StatusCategory, TaskFilters, TaskRow, ViewConfig } from "@/types";

export interface ViewCtx {
  userId: string;
  /** status id -> category, used for overdue / "done" logic */
  categoryOf: (statusId: string) => StatusCategory | undefined;
  /** today as YYYY-MM-DD in the viewer's locale */
  today: string;
  nowMs?: number;
}

export const isDone = (t: Pick<TaskRow, "status_id">, ctx: ViewCtx) => ctx.categoryOf(t.status_id) === "done";

export const isTaskOverdue = (t: Pick<TaskRow, "status_id" | "due_date">, ctx: ViewCtx) =>
  !!t.due_date && t.due_date < ctx.today && !isDone(t, ctx);

function plusDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function countActiveFilters(f: TaskFilters | undefined) {
  if (!f) return 0;
  return (
    (f.q ? 1 : 0) + (f.status?.length ? 1 : 0) + (f.assignee?.length ? 1 : 0) + (f.reporter?.length ? 1 : 0) +
    (f.priority?.length ? 1 : 0) + (f.type?.length ? 1 : 0) + (f.label?.length ? 1 : 0) + (f.due ? 1 : 0) + (f.quick ? 1 : 0)
  );
}

export function applyFilters(tasks: TaskRow[], f: TaskFilters | undefined, ctx: ViewCtx): TaskRow[] {
  if (!f || countActiveFilters(f) === 0) return tasks;
  const q = f.q?.trim().toLowerCase();
  const weekEnd = plusDays(ctx.today, 7);
  const recentCutoff = (ctx.nowMs ?? Date.now()) - 7 * 24 * 3600 * 1000;
  return tasks.filter((t) => {
    if (q && !(t.key.toLowerCase().includes(q) || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))) {
      return false;
    }
    if (f.status?.length && !f.status.includes(t.status_id)) return false;
    if (f.assignee?.length) {
      const hit = f.assignee.some((a) => (a === "unassigned" ? !t.assignee_id : t.assignee_id === a));
      if (!hit) return false;
    }
    if (f.reporter?.length && !(t.reporter_id && f.reporter.includes(t.reporter_id))) return false;
    if (f.priority?.length && !f.priority.includes(t.priority)) return false;
    if (f.type?.length && !f.type.includes(t.type)) return false;
    if (f.label?.length && !t.labels.some((l) => f.label!.includes(l.id))) return false;
    if (f.due) {
      if (f.due === "none" && t.due_date) return false;
      if (f.due === "today" && t.due_date !== ctx.today) return false;
      if (f.due === "overdue" && !isTaskOverdue(t, ctx)) return false;
      if (f.due === "week" && !(t.due_date && t.due_date >= ctx.today && t.due_date <= weekEnd)) return false;
    }
    switch (f.quick) {
      case "mine": if (t.assignee_id !== ctx.userId) return false; break;
      case "created": if (t.reporter_id !== ctx.userId) return false; break;
      case "unassigned": if (t.assignee_id) return false; break;
      case "recent": if (new Date(t.updated_at).getTime() < recentCutoff) return false; break;
    }
    return true;
  });
}

export function sortTasks(tasks: TaskRow[], sort: ViewConfig["sort"] | undefined): TaskRow[] {
  if (!sort) return [...tasks].sort((a, b) => a.position - b.position || a.number - b.number);
  const dir = sort.dir === "asc" ? 1 : -1;
  const cmp = (a: TaskRow, b: TaskRow): number => {
    switch (sort.field) {
      case "due_date": return a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : 0;
      case "priority": return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      case "created_at": return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
      case "updated_at": return a.updated_at < b.updated_at ? -1 : a.updated_at > b.updated_at ? 1 : 0;
      case "title": return a.title.localeCompare(b.title);
    }
  };
  return [...tasks].sort((a, b) => {
    if (sort.field === "due_date") {
      // tasks without a due date always sort last, regardless of direction
      if (!a.due_date && !b.due_date) return a.number - b.number;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
    }
    return cmp(a, b) * dir || a.number - b.number;
  });
}

export interface TaskGroup {
  id: string;
  label: string;
  color?: string;
  tasks: TaskRow[];
}

export function groupTasks(
  tasks: TaskRow[],
  group: NonNullable<ViewConfig["group"]>,
  lookups: {
    statuses: Array<{ id: string; name: string; color: string }>;
    people: Map<string, string>;
    labels: Array<{ id: string; name: string; color: string }>;
    priorities: Array<{ id: string; name: string; color: string }>;
  },
): TaskGroup[] {
  if (group === "none") return [{ id: "all", label: "All tasks", tasks }];
  const out = new Map<string, TaskGroup>();
  const ensure = (id: string, label: string, color?: string) => {
    if (!out.has(id)) out.set(id, { id, label, color, tasks: [] });
    return out.get(id)!;
  };
  if (group === "status") lookups.statuses.forEach((s) => ensure(s.id, s.name, s.color));
  if (group === "priority") lookups.priorities.forEach((p) => ensure(p.id, p.name, p.color));
  for (const t of tasks) {
    if (group === "status") ensure(t.status_id, "Unknown").tasks.push(t);
    else if (group === "priority") ensure(t.priority, t.priority).tasks.push(t);
    else if (group === "assignee") {
      if (!t.assignee_id) ensure("unassigned", "Unassigned").tasks.push(t);
      else ensure(t.assignee_id, lookups.people.get(t.assignee_id) ?? "Unknown").tasks.push(t);
    } else if (group === "label") {
      if (t.labels.length === 0) ensure("none", "No label").tasks.push(t);
      for (const l of t.labels) ensure(l.id, l.name, l.color).tasks.push(t);
    }
  }
  const arr = [...out.values()];
  // keep empty columns for status/priority (they are meaningful), drop the rest
  return group === "status" || group === "priority" ? arr : arr.filter((g) => g.tasks.length);
}

/** Midpoint position between two neighbours; used when a card is dropped between others. */
export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return Date.now() / 1000;
  if (before === undefined) return (after as number) - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

/** Attach subtask counts to a flat list. */
export function withSubtaskCounts<T extends { id: string; parent_id: string | null; status_id: string }>(
  tasks: T[],
  ctx: ViewCtx,
): Array<T & { subtask_total: number; subtask_done: number }> {
  const total = new Map<string, number>();
  const done = new Map<string, number>();
  for (const t of tasks) {
    if (!t.parent_id) continue;
    total.set(t.parent_id, (total.get(t.parent_id) ?? 0) + 1);
    if (isDone(t, ctx)) done.set(t.parent_id, (done.get(t.parent_id) ?? 0) + 1);
  }
  return tasks.map((t) => ({ ...t, subtask_total: total.get(t.id) ?? 0, subtask_done: done.get(t.id) ?? 0 }));
}
