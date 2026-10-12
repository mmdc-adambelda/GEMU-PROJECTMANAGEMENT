import type { Metadata } from "next";
import { getOrgContext } from "@/lib/auth/session";
import { getMembers } from "@/lib/data/project";
import { createClient } from "@/lib/supabase/server";
import type { Workspace } from "@/types";
import { WorkspacesManager } from "./workspaces-manager";

export const metadata: Metadata = { title: "Workspaces" };

export default async function WorkspacesPage({ params }: PageProps<"/o/[org]/settings/workspaces">) {
  const { org: slug } = await params;
  const { org, role } = await getOrgContext(slug);
  const supabase = await createClient();
  const [ws, wm, members] = await Promise.all([
    supabase.from("workspaces").select("*").eq("org_id", org.id).order("name"),
    supabase.from("workspace_members").select("workspace_id, user_id"),
    getMembers(org.id),
  ]);
  const byWs: Record<string, string[]> = {};
  for (const r of (wm.data ?? []) as Array<{ workspace_id: string; user_id: string }>) (byWs[r.workspace_id] ??= []).push(r.user_id);
  return <WorkspacesManager orgId={org.id} role={role} workspaces={(ws.data ?? []) as Workspace[]} memberIds={byWs} members={members} />;
}
