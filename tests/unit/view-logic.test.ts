import { describe, expect, it } from "vitest";
import { applyFilters, countActiveFilters, groupTasks, positionBetween, sortTasks, withSubtaskCounts, type ViewCtx } from "@/lib/tasks/view-logic";
import { fmtMinutes, parseDuration } from "@/lib/utils/dates";
import type { StatusCategory, TaskRow } from "@/types";

const cats: Record<string, StatusCategory> = { todo: "todo", doing: "in_progress", done: "done" };
const ctx: ViewCtx = { userId: "me", categoryOf: (id) => cats[id], today: "2026-06-15", nowMs: Date.parse("2026-06-15T12:00:00Z") };

let n = 0;
const task = (p: Partial<TaskRow>): TaskRow => ({
  id: `t${++n}`, org_id: "o", project_id: "p", number: n, key: `DEV-${n}`, title: `Task ${n}`, description: "",
  status_id: "todo", priority: "medium", type: "task", assignee_id: null, reporter_id: null, parent_id: null,
  start_date: null, due_date: null, estimate_minutes: null, resolution: null, completed_at: null, archived_at: null,
  position: n, created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-01T00:00:00Z", labels: [], subtask_total: 0, subtask_done: 0, ...p,
});

describe("applyFilters", () => {
  const tasks = [
    task({ title: "Fix login bug", assignee_id: "me", due_date: "2026-06-10" }),
    task({ title: "Write docs", status_id: "done", due_date: "2026-06-01" }),
    task({ title: "Deploy", assignee_id: "bob", due_date: "2026-06-15", reporter_id: "me", priority: "high" }),
    task({ title: "Plan", due_date: "2026-06-20", updated_at: "2026-06-14T00:00:00Z", labels: [{ id: "l1", name: "x", color: "#fff", org_id: "o" }] }),
  ];
  it("returns everything with no filters", () => {
    expect(applyFilters(tasks, {}, ctx)).toHaveLength(4);
    expect(countActiveFilters({})).toBe(0);
  });
  it("matches text on key and title, case-insensitively", () => {
    expect(applyFilters(tasks, { q: "LOGIN" }, ctx).map((t) => t.title)).toEqual(["Fix login bug"]);
    expect(applyFilters(tasks, { q: tasks[2].key }, ctx)).toHaveLength(1);
  });
  it("does not count done tasks as overdue", () => {
    expect(applyFilters(tasks, { due: "overdue" }, ctx).map((t) => t.title)).toEqual(["Fix login bug"]);
  });
  it("supports due today / this week", () => {
    expect(applyFilters(tasks, { due: "today" }, ctx).map((t) => t.title)).toEqual(["Deploy"]);
    expect(applyFilters(tasks, { due: "week" }, ctx).map((t) => t.title)).toEqual(["Deploy", "Plan"]);
  });
  it("supports assignee incl. unassigned, and quick filters", () => {
    expect(applyFilters(tasks, { assignee: ["unassigned"] }, ctx)).toHaveLength(2);
    expect(applyFilters(tasks, { assignee: ["bob", "me"] }, ctx)).toHaveLength(2);
    expect(applyFilters(tasks, { quick: "mine" }, ctx).map((t) => t.title)).toEqual(["Fix login bug"]);
    expect(applyFilters(tasks, { quick: "created" }, ctx).map((t) => t.title)).toEqual(["Deploy"]);
    expect(applyFilters(tasks, { quick: "recent" }, ctx).map((t) => t.title)).toEqual(["Plan"]);
  });
  it("combines filters with AND", () => {
    expect(applyFilters(tasks, { priority: ["high"], quick: "created" }, ctx)).toHaveLength(1);
    expect(applyFilters(tasks, { priority: ["high"], quick: "mine" }, ctx)).toHaveLength(0);
    expect(applyFilters(tasks, { label: ["l1"] }, ctx)).toHaveLength(1);
  });
});

describe("sortTasks", () => {
  const a = task({ due_date: "2026-06-20", priority: "low" });
  const b = task({ due_date: null, priority: "highest" });
  const c = task({ due_date: "2026-06-10", priority: "medium" });
  it("keeps tasks without a due date last in both directions", () => {
    expect(sortTasks([a, b, c], { field: "due_date", dir: "asc" }).map((t) => t.id)).toEqual([c.id, a.id, b.id]);
    expect(sortTasks([a, b, c], { field: "due_date", dir: "desc" }).map((t) => t.id)).toEqual([a.id, c.id, b.id]);
  });
  it("sorts by priority rank", () => {
    expect(sortTasks([a, b, c], { field: "priority", dir: "desc" }).map((t) => t.id)).toEqual([b.id, c.id, a.id]);
  });
  it("defaults to board position", () => {
    expect(sortTasks([c, b, a], undefined).map((t) => t.id)).toEqual([a.id, b.id, c.id]);
  });
});

describe("groupTasks", () => {
  const lookups = {
    statuses: [{ id: "todo", name: "To Do", color: "#000" }, { id: "doing", name: "Doing", color: "#000" }],
    people: new Map([["me", "Me"]]),
    labels: [],
    priorities: [],
  };
  it("keeps empty status columns and groups by assignee", () => {
    const ts = [task({ status_id: "todo", assignee_id: "me" }), task({ status_id: "todo" })];
    const byStatus = groupTasks(ts, "status", lookups);
    expect(byStatus.map((g) => [g.id, g.tasks.length])).toEqual([["todo", 2], ["doing", 0]]);
    const byAssignee = groupTasks(ts, "assignee", lookups);
    expect(byAssignee.map((g) => g.label).sort()).toEqual(["Me", "Unassigned"]);
  });
});

describe("misc helpers", () => {
  it("computes subtask counts", () => {
    const parent = task({});
    const kids = [task({ parent_id: parent.id, status_id: "done" }), task({ parent_id: parent.id })];
    const out = withSubtaskCounts([parent, ...kids], ctx);
    expect(out[0].subtask_total).toBe(2);
    expect(out[0].subtask_done).toBe(1);
  });
  it("positions cards between neighbours", () => {
    expect(positionBetween(1, 3)).toBe(2);
    expect(positionBetween(undefined, 5)).toBe(4);
    expect(positionBetween(5, undefined)).toBe(6);
  });
  it("parses and formats durations", () => {
    expect(parseDuration("1h 30m")).toBe(90);
    expect(parseDuration("2h")).toBe(120);
    expect(parseDuration("45")).toBe(45);
    expect(parseDuration("1.5h")).toBe(90);
    expect(parseDuration("abc")).toBeNull();
    expect(fmtMinutes(90)).toBe("1h 30m");
    expect(fmtMinutes(120)).toBe("2h");
  });
});
