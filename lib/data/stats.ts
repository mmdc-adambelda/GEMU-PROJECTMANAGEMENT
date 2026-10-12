import { createClient } from "@/lib/supabase/server";

export interface DashboardStats {
  active_projects: number;
  my_open_tasks: number;
  completed_this_week: number;
  overdue_tasks: number;
  by_status: Array<{ name: string; color: string; count: number; category: string }>;
  by_priority: Array<{ priority: string; count: number }>;
  by_assignee: Array<{ name: string; user_id: string | null; open: number; overdue: number }>;
  created_vs_completed: Array<{ day: string; created: number; completed: number }>;
  upcoming: Array<{ id: string; key: string; title: string; due_date: string; priority: string }>;
}

const EMPTY: DashboardStats = {
  active_projects: 0, my_open_tasks: 0, completed_this_week: 0, overdue_tasks: 0,
  by_status: [], by_priority: [], by_assignee: [], created_vs_completed: [], upcoming: [],
};

/** Aggregated by the database under the caller's RLS, so numbers never include hidden work. */
export async function getDashboardStats(orgId: string): Promise<DashboardStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_stats", { p_org: orgId });
  if (error) {
    console.error("[dashboard_stats]", error.message);
    return EMPTY;
  }
  return { ...EMPTY, ...(data as Partial<DashboardStats>) };
}

export interface WorkloadRow {
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  open_tasks: number;
  overdue_tasks: number;
  completed_30d: number;
  open_estimate_minutes: number;
  logged_30d_minutes: number;
}

export async function getWorkload(orgId: string): Promise<WorkloadRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("workload_report", { p_org: orgId });
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    user_id: r.user_id as string,
    full_name: r.full_name as string,
    email: r.email as string,
    avatar_url: (r.avatar_url as string | null) ?? null,
    open_tasks: Number(r.open_tasks),
    overdue_tasks: Number(r.overdue_tasks),
    completed_30d: Number(r.completed_30d),
    open_estimate_minutes: Number(r.open_estimate_minutes),
    logged_30d_minutes: Number(r.logged_30d_minutes),
  }));
}
