"use client";

import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Columns3, CornerDownRight } from "lucide-react";
import { useMemo, useState } from "react";
import { SimpleSelect } from "@/components/app/simple-select";
import { DueBadge, LabelChip, PriorityIcon, TypeIcon } from "@/components/app/task-chips";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { bulkUpdateTasksAction } from "@/features/tasks/actions";
import { PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL, TYPE_LABEL } from "@/lib/constants";
import { runAction } from "@/lib/hooks/use-run-action";
import { groupTasks, isDone, isTaskOverdue } from "@/lib/tasks/view-logic";
import { fmtMinutes, timeAgo } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import type { TaskPriority, TaskRow, ViewConfig } from "@/types";
import { personName, useWorkspace } from "./context";

const BASE_COLUMNS = [
  { id: "type", label: "Type" },
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "assignee", label: "Assignee" },
  { id: "due", label: "Due" },
  { id: "labels", label: "Labels" },
  { id: "estimate", label: "Estimate" },
  { id: "updated", label: "Updated" },
];
const DEFAULT_COLUMNS = ["status", "priority", "assignee", "due", "labels"];
const SORTABLE: Record<string, NonNullable<ViewConfig["sort"]>["field"]> = {
  title: "title", priority: "priority", due: "due_date", updated: "updated_at",
};
const PAGE = 100;
const bare = "border-transparent bg-transparent shadow-none hover:bg-muted dark:bg-transparent";

function TitleCell({ task }: { task: TaskRow }) {
  const w = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(task.title);
  const done = isDone(task, w.viewCtx);
  if (editing) {
    return (
      <Input
        autoFocus
        aria-label={`Edit title of ${task.key}`}
        value={val}
        maxLength={300}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (val.trim() && val.trim() !== task.title) void w.updateTask(task.id, { title: val.trim() });
          else setVal(task.title);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setVal(task.title); setEditing(false); }
        }}
      />
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      {task.parent_id && <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" aria-label="Subtask" />}
      <button
        type="button"
        onClick={() => w.openTask(task.id)}
        className={cn("min-w-0 truncate text-left font-medium hover:underline", done && "text-muted-foreground line-through")}
      >
        {task.title}
      </button>
      {task.subtask_total > 0 && (
        <span className="shrink-0 text-xs text-muted-foreground">{task.subtask_done}/{task.subtask_total}</span>
      )}
      {w.canEdit && (
        <button type="button" className="shrink-0 text-xs text-muted-foreground opacity-0 hover:text-foreground focus:opacity-100 group-hover/row:opacity-100"
          onClick={() => { setVal(task.title); setEditing(true); }} aria-label={`Rename ${task.key}`}>
          Rename
        </button>
      )}
    </div>
  );
}

export function ListView({ config, onConfig }: { config: ViewConfig; onConfig: (c: ViewConfig) => void }) {
  const w = useWorkspace();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [bulkBusy, setBulkBusy] = useState(false);

  const columns = config.columns ?? DEFAULT_COLUMNS;
  const allColumns = [...BASE_COLUMNS, ...w.fields.map((f) => ({ id: `cf:${f.id}`, label: f.name }))];
  const show = (id: string) => columns.includes(id);
  const toggleColumn = (id: string, on: boolean) =>
    onConfig({ ...config, columns: on ? [...columns, id] : columns.filter((c) => c !== id) });

  const groups = useMemo(
    () =>
      groupTasks(w.tasks, config.group ?? "none", {
        statuses: w.statuses,
        people: new Map(w.members.map((m) => [m.id, personName(m)])),
        labels: w.labels,
        priorities: PRIORITIES.map((p) => ({ id: p, name: PRIORITY_LABEL[p], color: PRIORITY_COLOR[p] })),
      }),
    [w.tasks, w.statuses, w.members, w.labels, config.group],
  );

  const { rendered, visibleIds } = useMemo(() => {
    let budget = limit;
    const ids: string[] = [];
    const out: Array<(typeof groups)[number] & { rows: TaskRow[] }> = [];
    for (const g of groups) {
      const rows = collapsed.has(g.id) ? [] : g.tasks.slice(0, Math.max(budget, 0));
      budget -= rows.length;
      for (const r of rows) ids.push(r.id);
      out.push({ ...g, rows });
    }
    return { rendered: out, visibleIds: ids };
  }, [groups, collapsed, limit]);
  const totalRows = groups.reduce((n, g) => n + (collapsed.has(g.id) ? 0 : g.tasks.length), 0);

  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggleAll = (on: boolean) => setSelected(on ? new Set(visibleIds) : new Set());
  const toggleOne = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  async function bulk(patch: Parameters<typeof bulkUpdateTasksAction>[1]) {
    setBulkBusy(true);
    const r = await runAction(() => bulkUpdateTasksAction([...selected], patch));
    setBulkBusy(false);
    if (r.ok) { setSelected(new Set()); w.refresh(); }
  }

  function sortBy(col: string) {
    const field = SORTABLE[col];
    if (!field) return;
    const cur = config.sort;
    if (!cur || cur.field !== field) return onConfig({ ...config, sort: { field, dir: "asc" } });
    if (cur.dir === "asc") return onConfig({ ...config, sort: { field, dir: "desc" } });
    onConfig({ ...config, sort: undefined });
  }

  const head = (id: string, label: string, className?: string) => {
    const sortable = SORTABLE[id];
    const active = sortable && config.sort?.field === sortable;
    return (
      <TableHead key={id} className={className} aria-sort={active ? (config.sort!.dir === "asc" ? "ascending" : "descending") : undefined}>
        {sortable ? (
          <button type="button" onClick={() => sortBy(id)} className="inline-flex items-center gap-1 hover:text-foreground">
            {label}
            {active && (config.sort!.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
          </button>
        ) : label}
      </TableHead>
    );
  };

  const stateOptions = (t: TaskRow) => {
    const allowed = w.allowedTargets(t.status_id);
    return w.statuses
      .filter((s) => s.id === t.status_id || allowed.has(s.id))
      .map((s) => ({ value: s.id, label: s.name, icon: <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} /> }));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {selected.size > 0 ? `${selected.size} selected` : `${w.tasks.length} task${w.tasks.length === 1 ? "" : "s"}`}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            <Columns3 /> Columns
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            {allColumns.map((c) => (
              <DropdownMenuCheckboxItem key={c.id} checked={show(c.id)} onCheckedChange={(on) => toggleColumn(c.id, Boolean(on))}>
                {c.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {selected.size > 0 && w.canEdit && (
        <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 p-2">
          <span className="px-1 text-sm font-medium">{selected.size} selected</span>
          <SimpleSelect size="sm" className="w-36" placeholder="Set status…" value={null} disabled={bulkBusy}
            onChange={(statusId) => bulk({ statusId })} options={w.statuses.map((s) => ({ value: s.id, label: s.name }))} aria-label="Bulk set status" />
          <SimpleSelect size="sm" className="w-36" placeholder="Set priority…" value={null} disabled={bulkBusy}
            onChange={(priority) => bulk({ priority: priority as TaskPriority })} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} aria-label="Bulk set priority" />
          <SimpleSelect size="sm" className="w-40" placeholder="Assign to…" value={null} disabled={bulkBusy}
            onChange={(v) => bulk({ assigneeId: v === "none" ? null : v })}
            options={[{ value: "none", label: "Unassigned" }, ...w.members.map((m) => ({ value: m.id, label: personName(m) }))]} aria-label="Bulk assign" />
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => bulk({ archived: true })}>Archive</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {w.canEdit && (
                <TableHead className="w-8">
                  <Checkbox checked={allChecked} onCheckedChange={(c) => toggleAll(Boolean(c))} aria-label="Select all visible tasks" />
                </TableHead>
              )}
              {head("key", "Key", "w-24")}
              {head("title", "Title", "min-w-64")}
              {show("type") && head("type", "Type")}
              {show("status") && head("status", "Status", "w-40")}
              {show("priority") && head("priority", "Priority", "w-36")}
              {show("assignee") && head("assignee", "Assignee", "w-44")}
              {show("due") && head("due", "Due", "w-36")}
              {show("labels") && head("labels", "Labels")}
              {show("estimate") && head("estimate", "Estimate")}
              {show("updated") && head("updated", "Updated")}
              {w.fields.filter((f) => show(`cf:${f.id}`)).map((f) => head(`cf:${f.id}`, f.name))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rendered.map((g) => (
              <GroupRows key={g.id} group={g} showHeader={(config.group ?? "none") !== "none"} collapsed={collapsed.has(g.id)}
                onToggle={() => setCollapsed((c) => { const n = new Set(c); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })}
                colSpan={20}
              >
                {g.rows.map((t) => (
                  <TableRow key={t.id} data-state={selected.has(t.id) ? "selected" : undefined} className="group/row">
                    {w.canEdit && (
                      <TableCell><Checkbox checked={selected.has(t.id)} onCheckedChange={(c) => toggleOne(t.id, Boolean(c))} aria-label={`Select ${t.key}`} /></TableCell>
                    )}
                    <TableCell className="font-mono text-xs text-muted-foreground">{t.key}</TableCell>
                    <TableCell><TitleCell task={t} /></TableCell>
                    {show("type") && <TableCell><span className="inline-flex items-center gap-1.5 text-xs"><TypeIcon type={t.type} />{TYPE_LABEL[t.type]}</span></TableCell>}
                    {show("status") && (
                      <TableCell>
                        <SimpleSelect size="sm" className={cn("w-full", bare)} disabled={!w.canEdit} value={t.status_id}
                          aria-label={`Status of ${t.key}`} onChange={(statusId) => w.updateTask(t.id, { statusId })} options={stateOptions(t)} />
                      </TableCell>
                    )}
                    {show("priority") && (
                      <TableCell>
                        <SimpleSelect size="sm" className={cn("w-full", bare)} disabled={!w.canEdit} value={t.priority}
                          aria-label={`Priority of ${t.key}`} onChange={(priority) => w.updateTask(t.id, { priority })}
                          options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p], icon: <PriorityIcon priority={p} /> }))} />
                      </TableCell>
                    )}
                    {show("assignee") && (
                      <TableCell>
                        <SimpleSelect size="sm" className={cn("w-full", bare)} disabled={!w.canEdit} value={t.assignee_id ?? "none"}
                          aria-label={`Assignee of ${t.key}`} onChange={(v) => w.updateTask(t.id, { assigneeId: v === "none" ? null : v })}
                          options={[{ value: "none", label: "Unassigned" }, ...w.members.map((m) => ({
                            value: m.id, label: personName(m),
                            icon: <UserAvatar name={m.full_name} email={m.email} src={m.avatar_url} className="size-5" />,
                          }))]} />
                      </TableCell>
                    )}
                    {show("due") && (
                      <TableCell>
                        {w.canEdit ? (
                          <input
                            type="date"
                            aria-label={`Due date of ${t.key}`}
                            value={t.due_date ?? ""}
                            onChange={(e) => w.updateTask(t.id, { dueDate: e.target.value || null })}
                            className={cn("h-7 rounded-md border border-transparent bg-transparent px-1.5 text-xs hover:bg-muted focus-visible:border-ring focus-visible:outline-none",
                              isTaskOverdue(t, w.viewCtx) && "font-medium text-red-600 dark:text-red-400")}
                          />
                        ) : <DueBadge due={t.due_date} overdue={isTaskOverdue(t, w.viewCtx)} done={isDone(t, w.viewCtx)} />}
                      </TableCell>
                    )}
                    {show("labels") && (
                      <TableCell><div className="flex flex-wrap gap-1">{t.labels.map((l) => <LabelChip key={l.id} label={l} />)}</div></TableCell>
                    )}
                    {show("estimate") && <TableCell className="text-xs text-muted-foreground">{t.estimate_minutes ? fmtMinutes(t.estimate_minutes) : "—"}</TableCell>}
                    {show("updated") && <TableCell className="text-xs text-muted-foreground">{timeAgo(t.updated_at)}</TableCell>}
                    {w.fields.filter((f) => show(`cf:${f.id}`)).map((f) => (
                      <TableCell key={f.id} className="text-xs">{formatCustom(w.customValues[t.id]?.[f.id])}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </GroupRows>
            ))}
            {w.tasks.length === 0 && (
              <TableRow><TableCell colSpan={12} className="py-10 text-center text-sm text-muted-foreground">No tasks match the current filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {visibleIds.length < totalRows && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
            Show more ({totalRows - visibleIds.length} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}

function formatCustom(v: unknown) {
  if (v === undefined || v === null) return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function GroupRows({
  group, showHeader, collapsed, onToggle, colSpan, children,
}: {
  group: { id: string; label: string; color?: string; tasks: TaskRow[] };
  showHeader: boolean;
  collapsed: boolean;
  onToggle: () => void;
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <>
      {showHeader && (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableCell colSpan={Math.max(colSpan, 6)}>
            <button type="button" onClick={onToggle} aria-expanded={!collapsed} className="flex items-center gap-2 text-sm font-semibold">
              {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
              {group.color && <span className="size-2.5 rounded-full" style={{ backgroundColor: group.color }} />}
              {group.label}
              <span className="text-xs font-normal text-muted-foreground">{group.tasks.length}</span>
            </button>
          </TableCell>
        </TableRow>
      )}
      {children}
    </>
  );
}
