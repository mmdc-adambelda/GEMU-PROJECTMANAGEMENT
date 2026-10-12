import type { Metadata } from "next";
import { getOrgContext, getProfile } from "@/lib/auth/session";
import { getMembers } from "@/lib/data/project";
import { getDashboardStats, getWorkload } from "@/lib/data/stats";
import { createClient } from "@/lib/supabase/server";
import type { ActivityEntry, ProjectStats } from "@/types";
import { DashboardGrid, type WidgetConfig } from "./dashboard-grid";

export const metadata: Metadata = { title: "Dashboards" };

export default async function DashboardsPage({ params }: PageProps<"/o/[org]/dashboards">) {
  const { org: slug } = await params;
  const [{ org }, profile] = await Promise.all([getOrgContext(slug), getProfile()]);
  const supabase = await createClient();
  const [stats, workload, projects, pstats, activity, cfg, members] = await Promise.all([
    getDashboardStats(org.id),
    getWorkload(org.id),
    supabase.from("projects").select("id, key, name, color").eq("org_id", org.id).is("archived_at", null).order("name").limit(50),
    supabase.from("project_stats").select("*"),
    supabase.from("activity_log").select("*").eq("org_id", org.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("dashboard_configurations").select("config").eq("user_id", profile.id).eq("org_id", org.id).maybeSingle(),
    getMembers(org.id),
  ]);
  const ps = new Map(((pstats.data ?? []) as ProjectStats[]).map((s) => [s.project_id, s]));
  return (
    <DashboardGrid
      orgId={org.id}
      orgSlug={org.slug}
      stats={stats}
      workload={workload}
      projects={((projects.data ?? []) as Array<{ id: string; key: string; name: string; color: string }>).map((p) => ({ ...p, pct: ps.get(p.id)?.progress_pct ?? 0, total: ps.get(p.id)?.total_tasks ?? 0 }))}
      activity={(activity.data ?? []) as ActivityEntry[]}
      people={members}
      saved={(cfg.data?.config as { widgets?: WidgetConfig[] } | undefined)?.widgets ?? null}
    />
  );
}
