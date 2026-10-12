"use server";

import { z } from "zod";
import { removeAttachmentObjects } from "@/lib/data/storage-cleanup";
import { withAuth } from "@/lib/auth/action-context";
import { dbError, fail, ok, parse } from "@/lib/utils/action";
import { uuid } from "@/lib/validations/common";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME_ALLOWLIST,
  commentSchema,
  taskCreateSchema,
  taskUpdateSchema,
  timeEntrySchema,
} from "@/lib/validations/domain";

const COLS = "id, key, project_id, status_id, position";

export async function createTaskAction(input: unknown) {
  const p = parse(taskCreateSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const d = p.data;
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id: d.projectId,
        title: d.title,
        description: d.description,
        ...(d.statusId ? { status_id: d.statusId } : {}),
        priority: d.priority,
        type: d.type,
        assignee_id: d.assigneeId,
        parent_id: d.parentId,
        start_date: d.startDate,
        due_date: d.dueDate,
        estimate_minutes: d.estimateMinutes,
      })
      .select(COLS)
      .single();
    if (error) return dbError(error, "create_task");
    if (d.labelIds.length) {
      const { error: le } = await supabase
        .from("task_labels")
        .insert(d.labelIds.map((label_id) => ({ task_id: data.id, label_id })));
      if (le) return dbError(le);
    }
    return ok({ id: data.id as string, key: data.key as string }, `${data.key} created`);
  });
}

export async function updateTaskAction(taskId: string, input: unknown) {
  const idCheck = parse(uuid, taskId);
  if ("error" in idCheck) return idCheck.error;
  const p = parse(taskUpdateSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const d = p.data;
    const patch: Record<string, unknown> = {};
    if (d.title !== undefined) patch.title = d.title;
    if (d.description !== undefined) patch.description = d.description;
    if (d.statusId !== undefined) patch.status_id = d.statusId;
    if (d.priority !== undefined) patch.priority = d.priority;
    if (d.type !== undefined) patch.type = d.type;
    if (d.assigneeId !== undefined) patch.assignee_id = d.assigneeId;
    if (d.parentId !== undefined) patch.parent_id = d.parentId;
    if (d.startDate !== undefined) patch.start_date = d.startDate;
    if (d.dueDate !== undefined) patch.due_date = d.dueDate;
    if (d.estimateMinutes !== undefined) patch.estimate_minutes = d.estimateMinutes;
    if (d.resolution !== undefined) patch.resolution = d.resolution;
    if (d.archived !== undefined) patch.archived_at = d.archived ? new Date().toISOString() : null;
    if (Object.keys(patch).length === 0) return ok(undefined);
    const { data, error } = await supabase.from("tasks").update(patch).eq("id", taskId).select(COLS);
    if (error) return dbError(error, "update_task");
    if (!data?.length) return fail("You do not have permission to change this task.");
    return ok(undefined);
  });
}

/** Kanban drop: new column and sort position in one write; workflow rules are enforced by the database. */
export async function moveTaskAction(taskId: string, statusId: string, position: number) {
  const p = parse(z.object({ taskId: uuid, statusId: uuid, position: z.number().finite() }), { taskId, statusId, position });
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("tasks")
      .update({ status_id: statusId, position })
      .eq("id", taskId)
      .select(COLS);
    if (error) return dbError(error, "move_task");
    if (!data?.length) return fail("You do not have permission to move this task.");
    return ok(undefined);
  });
}

export async function moveTaskToProjectAction(taskId: string, projectId: string) {
  const p = parse(z.object({ taskId: uuid, projectId: uuid }), { taskId, projectId });
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.from("tasks").update({ project_id: projectId }).eq("id", taskId).select("key");
    if (error) return dbError(error, "move_task_project");
    if (!data?.length) return fail("You do not have permission to move this task.");
    return ok({ key: data[0].key as string }, `Moved to ${data[0].key}`);
  });
}

export async function deleteTaskAction(taskId: string) {
  return withAuth(async ({ supabase, user }) => {
    const { data: t } = await supabase.from("tasks").select("project_id, reporter_id").eq("id", taskId).maybeSingle();
    if (!t) return fail("You do not have permission to delete this task.");
    const { data: access } = await supabase.rpc("project_access", { p_project: t.project_id });
    const a = access as { can_edit: boolean; can_manage: boolean } | null;
    if (!a || !(a.can_manage || (a.can_edit && t.reporter_id === user.id))) return fail("You do not have permission to delete this task.");

    // permission verified: remove files while the rows (which storage policies depend on) still exist
    const { data: kids } = await supabase.from("tasks").select("id").eq("parent_id", taskId);
    const ids = [taskId, ...(kids ?? []).map((k) => k.id as string)];
    const { data: atts } = await supabase.from("task_attachments").select("storage_path").in("task_id", ids);
    await removeAttachmentObjects(supabase, (atts ?? []).map((x) => x.storage_path as string));
    const { data, error } = await supabase.from("tasks").delete().eq("id", taskId).select("key");
    if (error) return dbError(error);
    if (!data?.length) return fail("You do not have permission to delete this task.");
    return ok(undefined, `${data[0].key} deleted`);
  });
}

export async function duplicateTaskAction(taskId: string) {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.rpc("duplicate_task", { p_task: taskId });
    if (error) return dbError(error, "duplicate_task");
    const { data: row } = await supabase.from("tasks").select("key").eq("id", data as string).single();
    return ok({ id: data as string, key: (row?.key as string | undefined) ?? "" }, "Task duplicated");
  });
}

export async function bulkUpdateTasksAction(taskIds: string[], input: unknown) {
  const ids = parse(z.array(uuid).min(1).max(200), taskIds);
  if ("error" in ids) return ids.error;
  const p = parse(taskUpdateSchema.pick({ statusId: true, priority: true, assigneeId: true, archived: true }), input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const patch: Record<string, unknown> = {};
    if (p.data.statusId !== undefined) patch.status_id = p.data.statusId;
    if (p.data.priority !== undefined) patch.priority = p.data.priority;
    if (p.data.assigneeId !== undefined) patch.assignee_id = p.data.assigneeId;
    if (p.data.archived !== undefined) patch.archived_at = p.data.archived ? new Date().toISOString() : null;
    if (!Object.keys(patch).length) return fail("Nothing to update.");
    let done = 0;
    const errors: string[] = [];
    for (const id of ids.data) {
      const { data, error } = await supabase.from("tasks").update(patch).eq("id", id).select("id");
      if (error) errors.push(dbError(error).error);
      else if (data?.length) done++;
    }
    if (done === 0) return fail(errors[0] ?? "No tasks were updated.");
    const skipped = ids.data.length - done;
    return ok({ updated: done, skipped }, skipped ? `${done} updated, ${skipped} skipped (not allowed)` : `${done} tasks updated`);
  });
}

export async function setTaskLabelsAction(taskId: string, labelIds: string[]) {
  const p = parse(z.object({ taskId: uuid, labelIds: z.array(uuid).max(20) }), { taskId, labelIds });
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data: cur, error: e1 } = await supabase.from("task_labels").select("label_id").eq("task_id", taskId);
    if (e1) return dbError(e1);
    const have = new Set((cur ?? []).map((r) => r.label_id as string));
    const want = new Set(p.data.labelIds);
    const add = [...want].filter((x) => !have.has(x));
    const remove = [...have].filter((x) => !want.has(x));
    if (add.length) {
      const { error } = await supabase.from("task_labels").insert(add.map((label_id) => ({ task_id: taskId, label_id })));
      if (error) return dbError(error);
    }
    if (remove.length) {
      const { error } = await supabase.from("task_labels").delete().eq("task_id", taskId).in("label_id", remove);
      if (error) return dbError(error);
    }
    return ok(undefined);
  });
}

export async function createLabelAction(orgId: string, name: string, color: string) {
  const p = parse(
    z.object({ orgId: uuid, name: z.string().trim().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
    { orgId, name, color },
  );
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("labels")
      .insert({ org_id: orgId, name: p.data.name, color: p.data.color })
      .select("id, name, color, org_id")
      .single();
    if (error) return dbError(error);
    return ok(data as { id: string; name: string; color: string; org_id: string }, "Label created");
  });
}

export async function toggleWatchAction(taskId: string, watch: boolean) {
  return withAuth(async ({ supabase, user }) => {
    const q = watch
      ? supabase.from("task_watchers").upsert({ task_id: taskId, user_id: user.id }, { onConflict: "task_id,user_id", ignoreDuplicates: true })
      : supabase.from("task_watchers").delete().eq("task_id", taskId).eq("user_id", user.id);
    const { error } = await q;
    return error ? dbError(error) : ok(undefined, watch ? "You are watching this task" : "Stopped watching");
  });
}

export async function addDependencyAction(taskId: string, blockedByTaskId: string) {
  const p = parse(z.object({ taskId: uuid, blockedByTaskId: uuid }), { taskId, blockedByTaskId });
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase
      .from("task_dependencies")
      .insert({ task_id: taskId, blocked_by_task_id: blockedByTaskId });
    return error ? dbError(error, "add_dependency") : ok(undefined, "Dependency added");
  });
}

export async function removeDependencyAction(taskId: string, blockedByTaskId: string) {
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase.from("task_dependencies").delete().eq("task_id", taskId).eq("blocked_by_task_id", blockedByTaskId);
    return error ? dbError(error) : ok(undefined, "Dependency removed");
  });
}

// ------------------------------------------------------------------ comments
export async function addCommentAction(input: unknown) {
  const p = parse(commentSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase, user }) => {
    const { error } = await supabase
      .from("task_comments")
      .insert({ task_id: p.data.taskId, author_id: user.id, body: p.data.body, parent_id: p.data.parentId });
    return error ? dbError(error, "add_comment") : ok(undefined);
  });
}

export async function editCommentAction(commentId: string, body: string) {
  const p = parse(z.object({ commentId: uuid, body: z.string().trim().min(1).max(20000) }), { commentId, body });
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.from("task_comments").update({ body: p.data.body }).eq("id", commentId).select("id");
    if (error) return dbError(error);
    if (!data?.length) return fail("You can only edit your own comments.");
    return ok(undefined);
  });
}

export async function deleteCommentAction(commentId: string) {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.from("task_comments").delete().eq("id", commentId).select("id");
    if (error) return dbError(error);
    if (!data?.length) return fail("You cannot delete this comment.");
    return ok(undefined, "Comment deleted");
  });
}

// ------------------------------------------------------------------ attachments
/** Record an attachment after the browser uploaded the object to the private bucket (policies enforce the path). */
export async function recordAttachmentAction(input: {
  taskId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const p = parse(
    z.object({
      taskId: uuid,
      storagePath: z.string().min(40).max(400),
      fileName: z.string().trim().min(1).max(200),
      mimeType: z.string().refine((m) => ATTACHMENT_MIME_ALLOWLIST.includes(m), "This file type is not allowed"),
      sizeBytes: z.number().int().min(0).max(ATTACHMENT_MAX_BYTES, "Files can be at most 25 MB"),
    }),
    input,
  );
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase, user }) => {
    const { error } = await supabase.from("task_attachments").insert({
      task_id: p.data.taskId,
      uploaded_by: user.id,
      storage_path: p.data.storagePath,
      file_name: p.data.fileName,
      mime_type: p.data.mimeType,
      size_bytes: p.data.sizeBytes,
    });
    if (error) {
      // metadata was rejected: do not leave an orphaned object behind
      await supabase.storage.from("attachments").remove([p.data.storagePath]);
      return dbError(error, "record_attachment");
    }
    return ok(undefined, "File attached");
  });
}

export async function deleteAttachmentAction(attachmentId: string) {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.from("task_attachments").delete().eq("id", attachmentId).select("storage_path");
    if (error) return dbError(error);
    if (!data?.length) return fail("You cannot remove this attachment.");
    await supabase.storage.from("attachments").remove([data[0].storage_path as string]);
    return ok(undefined, "Attachment removed");
  });
}

/** Short-lived signed URL; storage RLS decides whether the caller may read the object at all. */
export async function getAttachmentUrlAction(attachmentId: string) {
  return withAuth(async ({ supabase }) => {
    const { data: att } = await supabase.from("task_attachments").select("storage_path, file_name").eq("id", attachmentId).maybeSingle();
    if (!att) return fail("Attachment not found.");
    const { data, error } = await supabase.storage
      .from("attachments")
      .createSignedUrl(att.storage_path as string, 60, { download: att.file_name as string });
    if (error || !data) return fail("Could not open this file.");
    return ok({ url: data.signedUrl });
  });
}

// ------------------------------------------------------------------ time tracking & custom fields
export async function logTimeAction(input: unknown) {
  const p = parse(timeEntrySchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase, user }) => {
    const { error } = await supabase.from("time_entries").insert({
      task_id: p.data.taskId,
      user_id: user.id,
      minutes: p.data.minutes,
      description: p.data.description,
      ...(p.data.loggedOn ? { logged_on: p.data.loggedOn } : {}),
    });
    return error ? dbError(error) : ok(undefined, "Time logged");
  });
}

export async function deleteTimeEntryAction(entryId: string) {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.from("time_entries").delete().eq("id", entryId).select("id");
    if (error) return dbError(error);
    if (!data?.length) return fail("You can only remove your own entries.");
    return ok(undefined);
  });
}

export async function setCustomFieldValueAction(taskId: string, fieldId: string, value: unknown) {
  const p = parse(z.object({ taskId: uuid, fieldId: uuid }), { taskId, fieldId });
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
      const { error } = await supabase.from("task_custom_field_values").delete().eq("task_id", taskId).eq("field_id", fieldId);
      return error ? dbError(error) : ok(undefined);
    }
    // type validation happens in the database trigger against the field definition
    const { error } = await supabase
      .from("task_custom_field_values")
      .upsert({ task_id: taskId, field_id: fieldId, value }, { onConflict: "task_id,field_id" });
    return error ? dbError(error, "custom_field") : ok(undefined);
  });
}
