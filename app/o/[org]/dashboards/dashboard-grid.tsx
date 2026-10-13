"use client";

import { ArrowDown, ArrowUp, Check, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ActivityList } from "@/components/app/activity-list";
import { FlowChart, HBarChart } from "@/components/app/charts";
import { orgPath } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { saveDashboardConfigAction } from "@/features/views/actions";
import { PRIORITIES, PRIORITY_LABEL } from "@/lib/constants";
import type { MemberLite } from "@/lib/data/project";
import type { DashboardStats, WorkloadRow } from "@/lib/data/stats";
import { runAction } from "@/lib/hooks/use-run-action";
import { fmtDate, fmtMinutes } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import type { ActivityEntry } from "@/types";

export interface WidgetConfig { id: string; visible: boolean; size?: "sm" | "md" | "lg" }

/** Metric definitions are shown with each widget so the numbers are never ambiguous. */
const CATALOG: Array<{ id: string; title: string; size: "sm" | "md" | "lg"; note?: string }> = [
  { id: "active_projects", title: "Active projects", size: "sm", note: "Projects with status Active that are not archived." },
  { id: "my_open", title: "Assigned to me", size: "sm", note: "Open tasks assigned to you (status category not Done)." },
  { id: "done_week", title: "Completed this week", size: "sm", note: "Tasks whose completion time is since Monday." },
  { id: "overdue", title: "Overdue", size: "sm", note: "Open tasks with a due date before today." },
  { id: "by_status", title: "Tasks by status", size: "md", note: "Non-archived tasks, grouped by status name." },
  { id: "by_priority", title: "Open tasks by priority", size: "md" },
  { id: "by_assignee", title: "Open tasks by assignee", size: "md", note: "Top 12 assignees; unassigned work is listed as Unassigned." },
  { id: "flow", title: "Created vs completed (14 days)", size: "lg", note: "Per-day counts of tasks created and tasks completed." },
  { id: "projects", title: "Project completion", size: "md", note: "Completed ÷ all non-archived tasks in the project." },
  { id: "upcoming", title: "Upcoming deadlines", size: "md", note: "Open tasks due in the next 7 days." },
  { id: "workload", title: "Team workload", size: "lg", note: "Open tasks and estimates per person, plus time logged in the last 30 days." },
  { id: "activity", title: "Recent activity", size: "md" },
];

function Card({ title, note, children, size }: { title: string; note?: string; children: React.ReactNode; size: "sm" | "md" | "lg" }) {
  return (
    <section aria-label={title} className={cn("rounded-xl border bg-card p-4", size === "lg" && "lg:col-span-2", size === "sm" && "")}>
      <h2 className="mb-1 text-sm font-semibold">{title}</h2>
      {note && <p className="mb-3 text-xs text-muted-foreground">{note}</p>}
      {children}
    </section>
  );
}

export function DashboardGrid({
  orgId, orgSlug, stats, workload, projects, activity, people, saved,
}: {
  orgId: string; orgSlug: string; stats: DashboardStats; workload: WorkloadRow[];
  projects: Array<{ id: string; key: string; name: string; color: string; pct: number; total: number }>;
  activity: ActivityEntry[]; people: MemberLite[]; saved: WidgetConfig[] | null;
}) {
  const initial = useMemo(() => {
    const known = new Set(CATALOG.map((c) => c.id));
    const have = (saved ?? []).filter((w) => known.has(w.id));
    const missing = CATALOG.filter((c) => !have.some((w) => w.id === c.id)).map((c) => ({ id: c.id, visible: !saved }));
    return [...have, ...missing];
  }, [saved]);
  const [widgets, setWidgets] = useState<WidgetConfig[]>(initial);
  const [editing, setEditing] = useState(false);
  const peopleMap = new Map(people.map((p) => [p.id, p]));

  const move = (i: number, d: -1 | 1) =>
    setWidgets((w) => { const n = [...w]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const toggle = (id: string, visible: boolean) => setWidgets((w) => w.map((x) => (x.id === id ? { ...x, visible } : x)));

  async function save() {
    const r = await runAction(() => saveDashboardConfigAction({ orgId, config: { widgets } }));
    if (r.ok) setEditing(false);
  }

  const body = (id: string): React.ReactNode => {
    switch (id) {
      case "active_projects": return <p className="text-3xl font-semibold tabular-nums">{stats.active_projects}</p>;
      case "my_open": return <p className="text-3xl font-semibold tabular-nums">{stats.my_open_tasks}</p>;
      case "done_week": return <p className="text-3xl font-semibold tabular-nums">{stats.completed_this_week}</p>;
      case "overdue": return <p className={cn("text-3xl font-semibold tabular-nums", stats.overdue_tasks > 0 && "text-red-600 dark:text-red-400")}>{stats.overdue_tasks}</p>;
      case "by_status": return <HBarChart data={stats.by_status.map((s) => ({ name: s.name, value: s.count, color: s.color }))} />;
      case "by_priority": return <HBarChart data={PRIORITIES.map((p) => ({ name: PRIORITY_LABEL[p], value: stats.by_priority.find((x) => x.priority === p)?.count ?? 0 }))} />;
      case "by_assignee": return <HBarChart data={stats.by_assignee.map((a) => ({ name: a.name, value: a.open }))} />;
      case "flow": return <FlowChart data={stats.created_vs_completed} />;
      case "projects":
        return projects.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No projects yet.</p> : (
          <ul className="space-y-3">
            {projects.slice(0, 8).map((p) => (
              <li key={p.id}>
                <div className="mb-1 flex justify-between text-sm"><Link href={orgPath(orgSlug, `/p/${p.key}`)} className="truncate hover:underline">{p.name}</Link><span className="tabular-nums text-muted-foreground">{p.pct}% · {p.total} tasks</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.name} completion`}><div className="h-full rounded-full" style={{ width: `${p.pct}%`, backgroundColor: p.color }} /></div>
              </li>
            ))}
          </ul>
        );
      case "upcoming":
        return stats.upcoming.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nothing due in the next 7 days.</p> : (
          <ul className="space-y-2">
            {stats.upcoming.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                <Link href={orgPath(orgSlug, `/t/${t.key}`)} className="min-w-0 flex-1 truncate hover:underline">{t.title}</Link>
                <span className="text-xs text-muted-foreground">{fmtDate(t.due_date)}</span>
              </li>
            ))}
          </ul>
        );
      case "workload":
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">Person</th><th className="font-medium">Open</th><th className="font-medium">Overdue</th><th className="font-medium">Est. open</th><th className="font-medium">Done 30d</th><th className="font-medium">Logged 30d</th></tr></thead>
              <tbody>
                {workload.map((w) => (
                  <tr key={w.user_id} className="border-t">
                    <td className="py-1.5"><Link href={orgPath(orgSlug, `/team/${w.user_id}`)} className="hover:underline">{w.full_name || w.email}</Link></td>
                    <td className="tabular-nums">{w.open_tasks}</td>
                    <td className={cn("tabular-nums", w.overdue_tasks > 0 && "font-medium text-red-600 dark:text-red-400")}>{w.overdue_tasks}</td>
                    <td className="tabular-nums">{fmtMinutes(w.open_estimate_minutes)}</td>
                    <td className="tabular-nums">{w.completed_30d}</td>
                    <td className="tabular-nums">{fmtMinutes(w.logged_30d_minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "activity": return <ActivityList entries={activity} people={peopleMap} />;
      default: return null;
    }
  };

  const visible = widgets.filter((w) => w.visible);
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboards</h1>
          <p className="text-sm text-muted-foreground">Live numbers from your data, limited to what you can access.</p>
        </div>
        <div className="ml-auto flex gap-2">
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setWidgets(initial); setEditing(false); }}>Cancel</Button>
              <Button size="sm" onClick={save}><Check /> Save layout</Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}><SlidersHorizontal /> Customize</Button>
          )}
        </div>
      </div>

      {editing && (
        <section aria-label="Customize widgets" className="rounded-xl border bg-muted/30 p-4">
          <p className="mb-3 text-sm text-muted-foreground">Choose which widgets to show and reorder them. Your layout is saved to your account.</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {widgets.map((w, i) => (
              <li key={w.id} className="flex items-center gap-2 rounded-md bg-background px-2 py-1.5 text-sm">
                <Checkbox checked={w.visible} onCheckedChange={(c) => toggle(w.id, Boolean(c))} aria-label={`Show ${CATALOG.find((c) => c.id === w.id)?.title}`} />
                <span className="flex-1">{CATALOG.find((c) => c.id === w.id)?.title}</span>
                <Button variant="ghost" size="icon-xs" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                <Button variant="ghost" size="icon-xs" aria-label="Move down" disabled={i === widgets.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">All widgets are hidden. Use Customize to add some.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 [&>*:nth-child(n)]:min-w-0">
          {/* small stat widgets share a row; others take a column or the full width */}
          {visible.map((w) => {
            const def = CATALOG.find((c) => c.id === w.id)!;
            return <Card key={w.id} title={def.title} note={def.note} size={def.size}>{body(w.id)}</Card>;
          })}
        </div>
      )}
    </div>
  );
}
