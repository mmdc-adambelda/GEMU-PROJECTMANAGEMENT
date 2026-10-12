"use server";

import { z } from "zod";
import { removeAttachmentObjects } from "@/lib/data/storage-cleanup";
import { withAuth } from "@/lib/auth/action-context";
import { dbError, fail, ok, parse } from "@/lib/utils/action";
import { projectKey, uuid } from "@/lib/validations/common";
import { projectSchema, projectUpdateSchema } from "@/lib/validations/domain";

export async function createProjectAction(input: unknown) {
  const p = parse(projectSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const d = p.data;
    const { data, error } = await supabase
      .from("projects")
      .insert({
        space_id: d.spaceId,
        name: d.name,
        key: d.key,
        description: d.description,
        lead_id: d.leadId,
        start_date: d.startDate,
        due_date: d.dueDate,
        priority: d.priority,
        template: d.template,
        color: d.color,
        icon: d.icon,
      })
      .select("id, key")
      .single();
    if (error) return dbError(error, "create_project");
    return ok({ id: data.id as string, key: data.key as string }, "Project created");
  });
}

export async function updateProjectAction(projectId: string, input: unknown) {
  const p = parse(projectUpdateSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const d = p.data;
    const patch: Record<string, unknown> = {};
    if (d.name !== undefined) patch.name = d.name;
    if (d.description !== undefined) patch.description = d.description;
    if (d.leadId !== undefined) patch.lead_id = d.leadId;
    if (d.startDate !== undefined) patch.start_date = d.startDate;
    if (d.dueDate !== undefined) patch.due_date = d.dueDate;
    if (d.priority !== undefined) patch.priority = d.priority;
    if (d.status !== undefined) patch.status = d.status;
    if (d.color !== undefined) patch.color = d.color;
    const { data, error } = await supabase.from("projects").update(patch).eq("id", projectId).select("id");
    if (error) return dbError(error, "update_project");
    if (!data?.length) return fail("You do not have permission to change this project.");
    return ok(undefined, "Project updated");
  });
}

export async function archiveProjectAction(projectId: string, archived: boolean) {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("projects")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", projectId)
      .select("id");
    if (error) return dbError(error);
    if (!data?.length) return fail("You do not have permission to change this project.");
    return ok(undefined, archived ? "Project archived" : "Project restored");
  });
}

export async function deleteProjectAction(projectId: string) {
  return withAuth(async ({ supabase }) => {
    const { data: access } = await supabase.rpc("project_access", { p_project: projectId });
    if (!(access as { can_manage?: boolean } | null)?.can_manage) return fail("You do not have permission to delete this project.");
    const { data: atts } = await supabase.from("tasks").select("task_attachments(storage_path)").eq("project_id", projectId);
    const paths = ((atts ?? []) as unknown as Array<{ task_attachments: Array<{ storage_path: string }> }>).flatMap((t) => t.task_attachments.map((a) => a.storage_path));
    await removeAttachmentObjects(supabase, paths);
    const { data, error } = await supabase.from("projects").delete().eq("id", projectId).select("id");
    if (error) return dbError(error);
    if (!data?.length) return fail("You do not have permission to delete this project.");
    return ok(undefined, "Project deleted");
  });
}

export async function duplicateProjectAction(projectId: string, name: string, key: string, includeTasks: boolean) {
  const p = parse(
    z.object({ projectId: uuid, name: z.string().trim().min(1).max(100), key: projectKey, includeTasks: z.boolean() }),
    { projectId, name, key, includeTasks },
  );
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.rpc("duplicate_project", {
      p_project: projectId,
      p_name: p.data.name,
      p_key: p.data.key,
      p_include_tasks: includeTasks,
    });
    if (error) return dbError(error, "duplicate_project");
    return ok({ id: data as string, key: p.data.key }, "Project duplicated");
  });
}

export async function setProjectMemberAction(projectId: string, userId: string, role: "lead" | "member" | "viewer" | null) {
  const p = parse(z.object({ projectId: uuid, userId: uuid, role: z.enum(["lead", "member", "viewer"]).nullable() }), {
    projectId, userId, role,
  });
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    if (role === null) {
      const { error } = await supabase.from("project_members").delete().eq("project_id", projectId).eq("user_id", userId);
      return error ? dbError(error) : ok(undefined, "Removed from project");
    }
    const { error } = await supabase
      .from("project_members")
      .upsert({ project_id: projectId, user_id: userId, role }, { onConflict: "project_id,user_id" });
    return error ? dbError(error) : ok(undefined, "Project access updated");
  });
}
