"use server";

import { z } from "zod";
import { withAuth } from "@/lib/auth/action-context";
import { dbError, fail, ok, parse } from "@/lib/utils/action";
import { uuid } from "@/lib/validations/common";
import {
  automationSchema,
  customFieldSchema,
  spaceSchema,
  spaceUpdateSchema,
  statusSchema,
  statusUpdateSchema,
} from "@/lib/validations/domain";

export async function createSpaceAction(input: unknown) {
  const p = parse(spaceSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("spaces")
      .insert({
        workspace_id: p.data.workspaceId,
        name: p.data.name,
        description: p.data.description,
        icon: p.data.icon,
        color: p.data.color,
        is_private: p.data.isPrivate,
      })
      .select("id")
      .single();
    if (error) return dbError(error, "create_space");
    return ok({ id: data.id as string }, "Space created");
  });
}

export async function updateSpaceAction(spaceId: string, input: unknown) {
  const p = parse(spaceUpdateSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const d = p.data;
    const patch: Record<string, unknown> = {};
    if (d.name !== undefined) patch.name = d.name;
    if (d.description !== undefined) patch.description = d.description;
    if (d.icon !== undefined) patch.icon = d.icon;
    if (d.color !== undefined) patch.color = d.color;
    if (d.isPrivate !== undefined) patch.is_private = d.isPrivate;
    if (d.ownerId !== undefined) patch.owner_id = d.ownerId;
    if (d.archived !== undefined) patch.archived_at = d.archived ? new Date().toISOString() : null;
    const { data, error } = await supabase.from("spaces").update(patch).eq("id", spaceId).select("id");
    if (error) return dbError(error);
    if (!data?.length) return fail("You do not have permission to change this space.");
    return ok(undefined, d.archived === undefined ? "Space updated" : d.archived ? "Space archived" : "Space restored");
  });
}

export async function deleteSpaceAction(spaceId: string) {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.from("spaces").delete().eq("id", spaceId).select("id");
    if (error) return dbError(error);
    if (!data?.length) return fail("Only organization admins can delete spaces.");
    return ok(undefined, "Space deleted");
  });
}

export async function setSpaceMemberAction(spaceId: string, userId: string, role: "admin" | "member" | "viewer" | null) {
  const p = parse(z.object({ spaceId: uuid, userId: uuid, role: z.enum(["admin", "member", "viewer"]).nullable() }), {
    spaceId, userId, role,
  });
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    if (p.data.role === null) {
      const { error } = await supabase.from("space_members").delete().eq("space_id", spaceId).eq("user_id", userId);
      return error ? dbError(error) : ok(undefined, "Member removed from space");
    }
    const { error } = await supabase
      .from("space_members")
      .upsert({ space_id: spaceId, user_id: userId, role: p.data.role }, { onConflict: "space_id,user_id" });
    return error ? dbError(error) : ok(undefined, "Space access updated");
  });
}

// ------------------------------------------------------------------ workflow
export async function createStatusAction(input: unknown) {
  const p = parse(statusSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data: last } = await supabase
      .from("workflow_statuses")
      .select("position")
      .eq("space_id", p.data.spaceId)
      .order("position", { ascending: false })
      .limit(1);
    const position = ((last?.[0]?.position as number | undefined) ?? -1) + 1;
    const { error } = await supabase.from("workflow_statuses").insert({
      space_id: p.data.spaceId,
      name: p.data.name,
      color: p.data.color,
      category: p.data.category,
      wip_limit: p.data.wipLimit,
      position,
    });
    return error ? dbError(error) : ok(undefined, "Status added");
  });
}

export async function updateStatusAction(statusId: string, input: unknown) {
  const p = parse(statusUpdateSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const d = p.data;
    const patch: Record<string, unknown> = {};
    if (d.name !== undefined) patch.name = d.name;
    if (d.color !== undefined) patch.color = d.color;
    if (d.category !== undefined) patch.category = d.category;
    if ("wipLimit" in d) patch.wip_limit = d.wipLimit;
    const { data, error } = await supabase.from("workflow_statuses").update(patch).eq("id", statusId).select("id");
    if (error) return dbError(error);
    if (!data?.length) return fail("You do not have permission to change this workflow.");
    return ok(undefined, "Status updated");
  });
}

export async function setDefaultStatusAction(spaceId: string, statusId: string) {
  return withAuth(async ({ supabase }) => {
    // The partial unique index allows a single default, so clear the old one first.
    const { error: e1 } = await supabase.from("workflow_statuses").update({ is_default: false }).eq("space_id", spaceId).eq("is_default", true);
    if (e1) return dbError(e1);
    const { data, error } = await supabase.from("workflow_statuses").update({ is_default: true }).eq("id", statusId).eq("space_id", spaceId).select("id");
    if (error) return dbError(error);
    if (!data?.length) return fail("Status not found.");
    return ok(undefined, "Default status updated");
  });
}

export async function reorderStatusesAction(spaceId: string, orderedIds: string[]) {
  const p = parse(z.object({ spaceId: uuid, orderedIds: z.array(uuid).min(1).max(100) }), { spaceId, orderedIds });
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase.from("workflow_statuses").update({ position: i }).eq("id", orderedIds[i]).eq("space_id", spaceId);
      if (error) return dbError(error);
    }
    return ok(undefined, "Order saved");
  });
}

export async function deleteStatusAction(statusId: string, reassignToId: string | null) {
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase.rpc("delete_status", { p_status: statusId, p_reassign_to: reassignToId });
    return error ? dbError(error, "delete_status") : ok(undefined, "Status deleted");
  });
}

/** Replace the allowed transitions of one status. Empty list = unrestricted. */
export async function setTransitionsAction(
  spaceId: string,
  fromStatusId: string,
  rules: Array<{ to: string; required: string[] }>,
) {
  const p = parse(
    z.object({
      spaceId: uuid,
      fromStatusId: uuid,
      rules: z
        .array(z.object({ to: uuid, required: z.array(z.enum(["assignee", "due_date", "estimate", "resolution"])) }))
        .max(100),
    }),
    { spaceId, fromStatusId, rules },
  );
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { error: e1 } = await supabase.from("workflow_transitions").delete().eq("from_status_id", fromStatusId);
    if (e1) return dbError(e1);
    if (p.data.rules.length) {
      const { error } = await supabase.from("workflow_transitions").insert(
        p.data.rules.map((r) => ({
          space_id: spaceId,
          from_status_id: fromStatusId,
          to_status_id: r.to,
          required_fields: r.required,
        })),
      );
      if (error) return dbError(error);
    }
    return ok(undefined, "Transitions saved");
  });
}

// ------------------------------------------------------------------ custom fields
export async function createCustomFieldAction(input: unknown) {
  const p = parse(customFieldSchema, input);
  if ("error" in p) return p.error;
  if ((p.data.fieldType === "select" || p.data.fieldType === "multi_select") && p.data.options.length === 0) {
    return fail("Add at least one option.");
  }
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase.from("custom_field_definitions").insert({
      org_id: p.data.orgId,
      space_id: p.data.spaceId,
      name: p.data.name,
      field_type: p.data.fieldType,
      options: p.data.options,
      is_required: p.data.isRequired,
    });
    return error ? dbError(error) : ok(undefined, "Field created");
  });
}

export async function deleteCustomFieldAction(fieldId: string) {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.from("custom_field_definitions").delete().eq("id", fieldId).select("id");
    if (error) return dbError(error);
    if (!data?.length) return fail("You do not have permission to delete this field.");
    return ok(undefined, "Field deleted");
  });
}

// ------------------------------------------------------------------ automations
export async function createAutomationAction(input: unknown) {
  const p = parse(automationSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase.from("automation_rules").insert({
      org_id: p.data.orgId,
      space_id: p.data.spaceId,
      name: p.data.name,
      trigger_type: p.data.trigger,
      conditions: p.data.conditions,
      actions: p.data.actions,
    });
    return error ? dbError(error) : ok(undefined, "Automation created");
  });
}

export async function toggleAutomationAction(ruleId: string, enabled: boolean) {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.from("automation_rules").update({ is_enabled: enabled }).eq("id", ruleId).select("id");
    if (error) return dbError(error);
    if (!data?.length) return fail("You do not have permission to change this automation.");
    return ok(undefined, enabled ? "Automation enabled" : "Automation paused");
  });
}

export async function deleteAutomationAction(ruleId: string) {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.from("automation_rules").delete().eq("id", ruleId).select("id");
    if (error) return dbError(error);
    if (!data?.length) return fail("You do not have permission to delete this automation.");
    return ok(undefined, "Automation deleted");
  });
}
