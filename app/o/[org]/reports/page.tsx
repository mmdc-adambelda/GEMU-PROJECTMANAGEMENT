import type { Metadata } from "next";
import Link from "next/link";
import { BurndownChart, FlowChart } from "@/components/app/charts";
import { orgPath } from "@/components/app/shell/shell-context";
import { getOrgContext } from "@/lib/auth/session";
import { getWorkload } from "@/lib/data/stats";
import { createClient } from "@/lib/supabase/server";
import { fmtMinutes } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

const RANGES = [14, 30, 90] as const;

export default async function ReportsPage({ params, searchParams }: PageProps<"/o/[org]/reports">) {
  const [{ org: slug }, sp] = await Promise.all([params, searchParams]);
  const { org } = await getOrgContext(slug);
  const days = RANGES.find((d) => String(d) === sp.days) ?? 30;
  const supabase = await createClient();

  const projects = await supabase.from("projects").select("id, key, name").eq("org_id", org.id).is("archived_at", null).order("name");
  const list = (projects.data ?? []) as Array<{ id: string; key: string; name: string }>;
  const selected = list.find((p) => p.id === sp.project) ?? list[0];

  const [flow, cycle, burn, workload] = await Promise.all([
    supabase.rpc("throughput_report", { p_org: org.id, p_days: days }),
    supabase.rpc("cycle_time_report", { p_org: org.id, p_days: 90 }),
    selected ? supabase.rpc("project_burndown", { p_project: selected.id, p_days: days }) : Promise.resolve({ data: [] }),
    getWorkload(org.id),
  ]);

  const flowRows = ((flow.data ?? []) as Array<{ day: string; created: number; completed: number }>).map((r) => ({ day: String(r.day), created: Number(r.created), completed: Number(r.completed) }));
  const burnRows = ((burn.data ?? []) as Array<{ day: string; remaining: number; scope: number }>).map((r) => ({ day: String(r.day), remaining: Number(r.remaining), scope: Number(r.scope) }));
  const cycleRows = (cycle.data ?? []) as Array<{ project_id: string; project_key: string; project_name: string; completed: number; open_tasks: number; avg_cycle_hours: number | null }>;
  const base = orgPath(org.slug, "/reports");
  const q = (extra: Record<string, string>) => `${base}?${new URLSearchParams({ days: String(days), ...(selected ? { project: selected.id } : {}), ...extra })}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Calculated from your task data, limited to what you can access.</p>
        </div>
        <nav aria-label="Date range" className="ml-auto inline-flex rounded-md border p-0.5 text-sm">
          {RANGES.map((d) => (
            <Link key={d} href={q({ days: String(d) })} aria-current={d === days ? "true" : undefined}
              className={cn("rounded px-3 py-1", d === days ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{d}d</Link>
          ))}
        </nav>
      </div>

      <section className="rounded-xl border bg-card p-4" aria-labelledby="flow-h">
        <h2 id="flow-h" className="text-sm font-semibold">Created vs completed</h2>
        <p className="mb-2 text-xs text-muted-foreground">Tasks created and tasks reaching a Done status per day over the last {days} days.</p>
        <FlowChart data={flowRows} />
      </section>

      <section className="rounded-xl border bg-card p-4" aria-labelledby="burn-h">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 id="burn-h" className="text-sm font-semibold">Burndown</h2>
          {list.length > 0 && (
            <nav aria-label="Project" className="flex flex-wrap gap-1">
              {list.slice(0, 12).map((p) => (
                <Link key={p.id} href={q({ project: p.id })} className={cn("rounded-full border px-2 py-0.5 text-xs", p.id === selected?.id ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted")}>{p.key}</Link>
              ))}
            </nav>
          )}
        </div>
        <p className="mb-2 text-xs text-muted-foreground">Remaining = tasks created by the end of the day that were not yet completed. Total scope = all tasks created so far (archived tasks excluded).</p>
        {selected ? <BurndownChart data={burnRows} /> : <p className="py-8 text-center text-sm text-muted-foreground">No projects yet.</p>}
      </section>

      <section className="rounded-xl border bg-card p-4" aria-labelledby="cyc-h">
        <h2 id="cyc-h" className="text-sm font-semibold">Cycle time by project (last 90 days)</h2>
        <p className="mb-2 text-xs text-muted-foreground">Average hours from creation to completion for tasks completed in the window.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">Project</th><th className="font-medium">Completed</th><th className="font-medium">Open</th><th className="font-medium">Avg cycle time</th></tr></thead>
            <tbody>
              {cycleRows.map((r) => (
                <tr key={r.project_id} className="border-t">
                  <td className="py-1.5"><Link href={orgPath(org.slug, `/p/${r.project_key}`)} className="hover:underline"><span className="font-mono text-xs text-muted-foreground">{r.project_key}</span> {r.project_name}</Link></td>
                  <td className="tabular-nums">{Number(r.completed)}</td>
                  <td className="tabular-nums">{Number(r.open_tasks)}</td>
                  <td className="tabular-nums">{r.avg_cycle_hours == null ? "—" : r.avg_cycle_hours >= 48 ? `${(Number(r.avg_cycle_hours) / 24).toFixed(1)} days` : `${r.avg_cycle_hours} h`}</td>
                </tr>
              ))}
              {cycleRows.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No projects yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4" aria-labelledby="wl-h">
        <h2 id="wl-h" className="text-sm font-semibold">Workload</h2>
        <p className="mb-2 text-xs text-muted-foreground">Open tasks, overdue tasks and estimates per person; time logged is the last 30 days.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">Person</th><th className="font-medium">Open</th><th className="font-medium">Overdue</th><th className="font-medium">Open estimate</th><th className="font-medium">Done (30d)</th><th className="font-medium">Logged (30d)</th></tr></thead>
            <tbody>
              {workload.map((w) => (
                <tr key={w.user_id} className="border-t">
                  <td className="py-1.5"><Link href={orgPath(org.slug, `/team/${w.user_id}`)} className="hover:underline">{w.full_name || w.email}</Link></td>
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
      </section>
    </div>
  );
}
