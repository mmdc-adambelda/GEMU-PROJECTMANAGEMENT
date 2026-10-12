"use client";

import { AlertTriangle, CheckCircle2, CircleDot, ListChecks, Percent } from "lucide-react";
import { useMemo } from "react";
import { ActivityList } from "@/components/app/activity-list";
import { DueBadge, PriorityIcon } from "@/components/app/task-chips";
import { UserAvatar } from "@/components/app/user-avatar";
import { PROJECT_STATUS_LABEL, PRIORITY_LABEL } from "@/lib/constants";
import { isDone, isTaskOverdue } from "@/lib/tasks/view-logic";
import { fmtDate, timeAgo } from "@/lib/utils/dates";
import type { ActivityEntry } from "@/types";
import { personName, useWorkspace } from "./context";

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function OverviewView({ activity }: { activity: ActivityEntry[] }) {
  const w = useWorkspace();
  const p = w.project;
  const stats = useMemo(() => {
    const open = w.allTasks;
    const done = open.filter((t) => isDone(t, w.viewCtx)).length;
    const overdue = open.filter((t) => isTaskOverdue(t, w.viewCtx)).length;
    const inProgress = open.filter((t) => w.statusById.get(t.status_id)?.category === "in_progress").length;
    return { total: open.length, done, overdue, inProgress, pct: open.length ? Math.round((100 * done) / open.length) : 0 };
  }, [w.allTasks, w.viewCtx, w.statusById]);

  const byStatus = w.statuses.map((s) => ({ s, n: w.allTasks.filter((t) => t.status_id === s.id).length }));
  const upcoming = w.allTasks
    .filter((t) => t.due_date && !isDone(t, w.viewCtx) && t.due_date >= w.viewCtx.today)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
    .slice(0, 6);
  const recent = [...w.allTasks].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, 6);
  const workload = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of w.allTasks) if (t.assignee_id && !isDone(t, w.viewCtx)) m.set(t.assignee_id, (m.get(t.assignee_id) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [w.allTasks, w.viewCtx]);
  const lead = p.lead_id ? w.people.get(p.lead_id) : undefined;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat icon={<ListChecks className="size-4" />} label="Tasks" value={stats.total} />
        <Stat icon={<CircleDot className="size-4" />} label="In progress" value={stats.inProgress} />
        <Stat icon={<CheckCircle2 className="size-4" />} label="Completed" value={stats.done} />
        <Stat icon={<AlertTriangle className="size-4" />} label="Overdue" value={<span className={stats.overdue ? "text-red-600 dark:text-red-400" : ""}>{stats.overdue}</span>} />
        <Stat icon={<Percent className="size-4" />} label="Progress" value={`${stats.pct}%`} hint="Completed ÷ all non-archived tasks. “Completed” = in a status of category Done." />
      </div>

      <section aria-label="Status breakdown" className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">By status</h2>
        {stats.total === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks yet.</p>
        ) : (
          <>
            <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={byStatus.map(({ s, n }) => `${s.name}: ${n}`).join(", ")}>
              {byStatus.filter((x) => x.n).map(({ s, n }) => (
                <div key={s.id} style={{ width: `${(100 * n) / stats.total}%`, backgroundColor: s.color }} title={`${s.name}: ${n}`} />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {byStatus.map(({ s, n }) => (
                <li key={s.id} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />{s.name}<span className="text-muted-foreground">{n}</span></li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-label="Details" className="rounded-xl border bg-card p-4 lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold">Details</h2>
          {p.description && <p className="mb-3 whitespace-pre-wrap text-sm text-muted-foreground">{p.description}</p>}
          <dl className="grid grid-cols-[6.5rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Status</dt><dd>{PROJECT_STATUS_LABEL[p.status]}</dd>
            <dt className="text-muted-foreground">Priority</dt><dd className="flex items-center gap-1"><PriorityIcon priority={p.priority} />{PRIORITY_LABEL[p.priority]}</dd>
            <dt className="text-muted-foreground">Lead</dt>
            <dd className="flex items-center gap-1.5">{lead ? <><UserAvatar name={lead.full_name} email={lead.email} src={lead.avatar_url} className="size-5" />{personName(lead)}</> : "—"}</dd>
            <dt className="text-muted-foreground">Start</dt><dd>{fmtDate(p.start_date, "MMM d, yyyy") || "—"}</dd>
            <dt className="text-muted-foreground">Due</dt><dd>{fmtDate(p.due_date, "MMM d, yyyy") || "—"}</dd>
            <dt className="text-muted-foreground">Template</dt><dd className="capitalize">{p.template.replace("_", " ")}</dd>
            {p.tags.length > 0 && (<><dt className="text-muted-foreground">Tags</dt><dd>{p.tags.join(", ")}</dd></>)}
          </dl>
        </section>

        <section aria-label="Upcoming deadlines" className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Upcoming deadlines</h2>
          {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Nothing due soon.</p> : (
            <ul className="space-y-2">
              {upcoming.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                  <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => w.openTask(t.id)}>{t.title}</button>
                  <DueBadge due={t.due_date} overdue={false} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Workload" className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Open work by assignee</h2>
          {workload.length === 0 ? <p className="text-sm text-muted-foreground">No assigned open tasks.</p> : (
            <ul className="space-y-2">
              {workload.map(([id, n]) => {
                const m = w.people.get(id);
                const max = workload[0][1];
                return (
                  <li key={id} className="text-sm">
                    <div className="mb-0.5 flex items-center justify-between"><span className="truncate">{personName(m)}</span><span className="tabular-nums text-muted-foreground">{n}</span></div>
                    <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(100 * n) / max}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Recently updated" className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Recently updated</h2>
          {recent.length === 0 ? <p className="text-sm text-muted-foreground">No tasks yet.</p> : (
            <ul className="space-y-2">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                  <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => w.openTask(t.id)}>{t.title}</button>
                  <span className="text-xs text-muted-foreground">{timeAgo(t.updated_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Recent activity" className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Recent activity</h2>
          <ActivityList entries={activity.slice(0, 8)} people={w.people} />
        </section>
      </div>
    </div>
  );
}
