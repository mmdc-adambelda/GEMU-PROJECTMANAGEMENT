import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SpaceView } from "@/features/spaces/space-view";
import type { ExecutionLite } from "@/features/spaces/automations-editor";
import { getOrgContext } from "@/lib/auth/session";
import { getMembers } from "@/lib/data/project";
import { createClient } from "@/lib/supabase/server";
import type {
  ActivityEntry, AutomationRule, CustomFieldDefinition, Project, ProjectStats, Space, SpaceRole, WorkflowStatus, WorkflowTransition,
} from "@/types";

export const metadata: Metadata = { title: "Space" };

const TABS = ["projects", "workflow", "fields", "automations", "members", "activity", "settings"] as const;

export default async function SpacePage({ params, searchParams }: PageProps<"/o/[org]/spaces/[spaceId]">) {
  const [{ org: slug, spaceId }, sp] = await Promise.all([params, searchParams]);
  const { org } = await getOrgContext(slug);
  if (!/^[0-9a-f-]{36}$/i.test(spaceId)) notFound();
  const supabase = await createClient();

  const { data: space } = await supabase.from("spaces").select("*").eq("id", spaceId).eq("org_id", org.id).maybeSingle();
  if (!space) notFound();

  const [ws, projects, stats, statuses, transitions, fields, rules, executions, spaceMembers, members, access] = await Promise.all([
    supabase.from("workspaces").select("name").eq("id", space.workspace_id).maybeSingle(),
    supabase.from("projects").select("*").eq("space_id", spaceId).order("name"),
    supabase.from("project_stats").select("*"),
    supabase.from("workflow_statuses").select("*").eq("space_id", spaceId).order("position"),
    supabase.from("workflow_transitions").select("*").eq("space_id", spaceId),
    supabase.from("custom_field_definitions").select("*").eq("org_id", org.id).or(`space_id.is.null,space_id.eq.${spaceId}`).order("position").order("name"),
    supabase.from("automation_rules").select("*").eq("space_id", spaceId).order("created_at"),
    supabase.from("automation_executions").select("rule_id, outcome, message, executed_at").order("executed_at", { ascending: false }).limit(100),
    supabase.from("space_members").select("user_id, role").eq("space_id", spaceId),
    getMembers(org.id),
    supabase.rpc("space_access", { p_space: spaceId }),
  ]);

  // space activity = everything that happened in this space's projects (RLS still filters it)
  const projectIds = ((projects.data ?? []) as Array<{ id: string }>).map((p) => p.id);
  const activity = projectIds.length
    ? await supabase.from("activity_log").select("*").in("project_id", projectIds).order("created_at", { ascending: false }).limit(100)
    : { data: [] };

  const statMap = new Map(((stats.data ?? []) as ProjectStats[]).map((s) => [s.project_id, s]));
  const acc = (access.data as { can_manage: boolean; can_create_project: boolean } | null) ?? { can_manage: false, can_create_project: false };
  const requested = typeof sp.tab === "string" ? sp.tab : "projects";
  const ruleIds = new Set((rules.data ?? []).map((r) => r.id as string));

  return (
    <SpaceView
      space={space as Space}
      workspaceName={(ws.data?.name as string | undefined) ?? ""}
      projects={((projects.data ?? []) as Project[]).map((p) => ({ ...p, stats: statMap.get(p.id) ?? null }))}
      statuses={(statuses.data ?? []) as WorkflowStatus[]}
      transitions={(transitions.data ?? []) as WorkflowTransition[]}
      fields={(fields.data ?? []) as CustomFieldDefinition[]}
      rules={(rules.data ?? []) as AutomationRule[]}
      executions={((executions.data ?? []) as ExecutionLite[]).filter((e) => ruleIds.has(e.rule_id))}
      members={members}
      spaceMembers={(spaceMembers.data ?? []) as Array<{ user_id: string; role: SpaceRole }>}
      activity={(activity.data ?? []) as ActivityEntry[]}
      access={acc}
      initialTab={(TABS as readonly string[]).includes(requested) ? (requested as (typeof TABS)[number]) : "projects"}
    />
  );
}
