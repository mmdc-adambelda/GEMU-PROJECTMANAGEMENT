import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Project, Space, Workspace } from "@/types";

export interface ShellData {
  workspaces: Workspace[];
  spaces: Pick<Space, "id" | "name" | "workspace_id" | "color" | "icon" | "is_private">[];
  projects: Pick<Project, "id" | "key" | "name" | "space_id" | "color" | "icon">[];
  recentProjects: Pick<Project, "id" | "key" | "name" | "space_id" | "color" | "icon">[];
  unread: number;
}

/** Everything the navigation needs for one organization; all rows are RLS-filtered for the viewer. */
export const getShellData = cache(async (orgId: string): Promise<ShellData> => {
  const supabase = await createClient();
  const [ws, sp, pr, recent, unread] = await Promise.all([
    supabase.from("workspaces").select("*").eq("org_id", orgId).is("archived_at", null).order("name"),
    supabase
      .from("spaces")
      .select("id, name, workspace_id, color, icon, is_private")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("projects")
      .select("id, key, name, space_id, color, icon")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("name")
      .limit(500),
    supabase
      .from("projects")
      .select("id, key, name, space_id, color, icon")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .or(`org_id.eq.${orgId},org_id.is.null`),
  ]);
  return {
    workspaces: (ws.data ?? []) as Workspace[],
    spaces: (sp.data ?? []) as ShellData["spaces"],
    projects: (pr.data ?? []) as ShellData["projects"],
    recentProjects: (recent.data ?? []) as ShellData["recentProjects"],
    unread: unread.count ?? 0,
  };
});
