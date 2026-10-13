import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FolderKanban, ListChecks, Rocket } from "lucide-react";
import { ActivityList } from "@/components/app/activity-list";
import { DueBadge, PriorityIcon } from "@/components/app/task-chips";
import { orgPath } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import { getOrgContext, getProfile } from "@/lib/auth/session";
import { getMembers } from "@/lib/data/project";
import { getDashboardStats } from "@/lib/data/stats";
import { createClient } from "@/lib/supabase/server";
import { isOrgAdmin } from "@/lib/permissions";
import { todayIn } from "@/lib/utils/dates";
import type { ActivityEntry } from "@/types";
import { HomeEmpty } from "./home-empty";

export const metadata: Metadata = { title: "Home" };

function Stat({ icon: Icon, label, value, href, tone }: { icon: typeof ListChecks; label: string; value: number; href?: string; tone?: "bad" }) {
  const body = (
    <div className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="size-4" />{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${tone === "bad" && value > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function HomePage({ params }: PageProps<"/o/[org]">) {
  const { org: slug } = await params;
  const [{ org, role }, profile] = await Promise.all([getOrgContext(slug), getProfile()]);
  const supabase = await createClient();
  const [stats, members, mine, activity, counts] = await Promise.all([
    getDashboardStats(org.id),
    getMembers(org.id),
    supabase
      .from("tasks")
      .select("id, key, title, due_date, priority, status:workflow_statuses!inner(category)")
      .eq("org_id", org.id)
      .eq("assignee_id", profile.id)
      .is("archived_at", null)
      .neq("status.category", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(6),
    supabase.from("activity_log").select("*").eq("org_id", org.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("org_id", org.id),
  ]);

  const projects = counts.count ?? 0;
  const people = new Map(members.map((m) => [m.id, m]));
  const first = profile.full_name.split(" ")[0] || "there";
  const today = todayIn(profile.timezone);

  if (projects === 0) {
    return <HomeEmpty orgSlug={org.slug} canCreateWorkspace={isOrgAdmin(role)} name={first} />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {first}</h1>
        <p className="text-sm text-muted-foreground">Here is what is happening across {org.name}.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={FolderKanban} label="Active projects" value={stats.active_projects} href={orgPath(org.slug, "/spaces")} />
        <Stat icon={ListChecks} label="Assigned to me" value={stats.my_open_tasks} href={orgPath(org.slug, "/my-tasks")} />
        <Stat icon={CheckCircle2} label="Completed this week" value={stats.completed_this_week} />
        <Stat icon={AlertTriangle} label="Overdue" value={stats.overdue_tasks} tone="bad" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="mine-h" className="rounded-xl border bg-card p-4 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="mine-h" className="text-sm font-semibold">My open tasks</h2>
            <Button variant="ghost" size="xs" render={<Link href={orgPath(org.slug, "/my-tasks")} />}>View all</Button>
          </div>
          {!mine.data?.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nothing assigned to you. 🎉</p>
          ) : (
            <ul className="space-y-2">
              {mine.data.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <PriorityIcon priority={t.priority} className="size-3.5" />
                  <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                  <Link href={orgPath(org.slug, `/t/${t.key}`)} className="min-w-0 flex-1 truncate hover:underline">{t.title}</Link>
                  <DueBadge due={t.due_date} overdue={!!t.due_date && t.due_date < today} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="up-h" className="rounded-xl border bg-card p-4">
          <h2 id="up-h" className="mb-3 text-sm font-semibold">Upcoming deadlines (7 days)</h2>
          {stats.upcoming.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No deadlines coming up.</p>
          ) : (
            <ul className="space-y-2">
              {stats.upcoming.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                  <Link href={orgPath(org.slug, `/t/${t.key}`)} className="min-w-0 flex-1 truncate hover:underline">{t.title}</Link>
                  <DueBadge due={t.due_date} overdue={false} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="act-h" className="rounded-xl border bg-card p-4">
          <h2 id="act-h" className="mb-3 text-sm font-semibold">Recent activity</h2>
          <ActivityList entries={(activity.data ?? []) as ActivityEntry[]} people={people} />
        </section>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Rocket className="size-4" />
        Want charts and workload? Open <Link className="text-primary hover:underline" href={orgPath(org.slug, "/dashboards")}>Dashboards</Link> or{" "}
        <Link className="text-primary hover:underline" href={orgPath(org.slug, "/reports")}>Reports</Link>.
      </div>
    </div>
  );
}
