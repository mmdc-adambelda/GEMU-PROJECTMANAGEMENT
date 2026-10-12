import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrgContext, getProfile } from "@/lib/auth/session";
import { getMembers, getProjectAccess } from "@/lib/data/project";
import { loadTaskDetail } from "@/lib/data/task-detail";
import { createClient } from "@/lib/supabase/server";
import type { CustomFieldDefinition, Label, Project, WorkflowStatus, WorkflowTransition } from "@/types";
import { TaskPageClient } from "./task-page-client";

export async function generateMetadata({ params }: PageProps<"/o/[org]/t/[key]">): Promise<Metadata> {
  const { key } = await params;
  return { title: key.toUpperCase() };
}

export default async function TaskPage({ params }: PageProps<"/o/[org]/t/[key]">) {
  const { org: slug, key } = await params;
  const [{ org }, profile] = await Promise.all([getOrgContext(slug), getProfile()]);
  const supabase = await createClient();
  const { data: row } = await supabase.from("tasks").select("id, project_id").eq("org_id", org.id).eq("key", key.toUpperCase()).maybeSingle();
  if (!row) notFound();

  const { data: project } = await supabase.from("projects").select("*").eq("id", row.project_id).single();
  const p = project as Project;
  const [detail, members, access, statuses, transitions, labels, fields] = await Promise.all([
    loadTaskDetail(supabase, row.id),
    getMembers(org.id),
    getProjectAccess(p.id),
    supabase.from("workflow_statuses").select("*").eq("space_id", p.space_id).order("position"),
    supabase.from("workflow_transitions").select("*").eq("space_id", p.space_id),
    supabase.from("labels").select("*").eq("org_id", org.id).order("name"),
    supabase.from("custom_field_definitions").select("*").eq("org_id", org.id).or(`space_id.is.null,space_id.eq.${p.space_id}`).order("position"),
  ]);
  if (!detail) notFound();

  return (
    <TaskPageClient
      taskId={row.id}
      orgSlug={org.slug}
      projectName={p.name}
      initial={detail}
      env={{
        orgId: org.id, orgSlug: org.slug, userId: profile.id, project: p, members,
        statuses: (statuses.data ?? []) as WorkflowStatus[],
        transitions: (transitions.data ?? []) as WorkflowTransition[],
        labels: (labels.data ?? []) as Label[],
        fields: (fields.data ?? []) as CustomFieldDefinition[],
        canEdit: access.can_edit, canManage: access.can_manage,
      }}
    />
  );
}
