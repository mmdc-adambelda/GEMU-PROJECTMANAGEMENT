"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAuth } from "@/lib/auth/action-context";
import { dbError, fail, ok, parse } from "@/lib/utils/action";
import { uuid } from "@/lib/validations/common";
import {
  inviteSchema,
  orgSchema,
  orgUpdateSchema,
  workspaceSchema,
  workspaceUpdateSchema,
} from "@/lib/validations/domain";

export async function createOrganizationAction(input: unknown) {
  const p = parse(orgSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.rpc("create_organization", { p_name: p.data.name, p_slug: p.data.slug });
    if (error) return dbError(error, "create_organization");
    return ok({ id: data as string, slug: p.data.slug });
  });
}

export async function updateOrganizationAction(orgId: string, input: unknown) {
  const p = parse(orgUpdateSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.from("organizations").update({ name: p.data.name }).eq("id", orgId).select("slug");
    if (error) return dbError(error);
    if (!data?.length) return fail("You do not have permission to change this organization.");
    revalidatePath(`/o/${data[0].slug}`, "layout");
    return ok(undefined, "Organization updated");
  });
}

export async function setOrganizationLogoAction(orgId: string, logoUrl: string | null) {
  const p = parse(z.object({ orgId: uuid, logoUrl: z.string().url().max(500).nullable() }), { orgId, logoUrl });
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("organizations")
      .update({ logo_url: p.data.logoUrl })
      .eq("id", p.data.orgId)
      .select("slug");
    if (error) return dbError(error);
    if (!data?.length) return fail("You do not have permission to change this organization.");
    revalidatePath(`/o/${data[0].slug}`, "layout");
    return ok(undefined, "Logo updated");
  });
}

export async function createWorkspaceAction(orgId: string, input: unknown) {
  const p = parse(workspaceSchema, input);
  if ("error" in p) return p.error;
  const idCheck = parse(uuid, orgId);
  if ("error" in idCheck) return idCheck.error;
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("workspaces")
      .insert({
        org_id: orgId,
        name: p.data.name,
        description: p.data.description,
        icon: p.data.icon,
        is_private: p.data.isPrivate,
      })
      .select("id")
      .single();
    if (error) return dbError(error, "create_workspace");
    return ok({ id: data.id as string }, "Workspace created");
  });
}

export async function updateWorkspaceAction(workspaceId: string, input: unknown) {
  const p = parse(workspaceUpdateSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const patch: Record<string, unknown> = {};
    if (p.data.name !== undefined) patch.name = p.data.name;
    if (p.data.description !== undefined) patch.description = p.data.description;
    if (p.data.icon !== undefined) patch.icon = p.data.icon;
    if (p.data.isPrivate !== undefined) patch.is_private = p.data.isPrivate;
    if (p.data.archived !== undefined) patch.archived_at = p.data.archived ? new Date().toISOString() : null;
    const { data, error } = await supabase.from("workspaces").update(patch).eq("id", workspaceId).select("id");
    if (error) return dbError(error);
    if (!data?.length) return fail("You do not have permission to change this workspace.");
    return ok(undefined, "Workspace updated");
  });
}

export async function deleteWorkspaceAction(workspaceId: string) {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.from("workspaces").delete().eq("id", workspaceId).select("id");
    if (error) return dbError(error);
    if (!data?.length) return fail("You do not have permission to delete this workspace.");
    return ok(undefined, "Workspace deleted");
  });
}

export async function setWorkspaceMembersAction(workspaceId: string, userIds: string[]) {
  const p = parse(z.object({ workspaceId: uuid, userIds: z.array(uuid).max(500) }), { workspaceId, userIds });
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data: current, error: e1 } = await supabase.from("workspace_members").select("user_id").eq("workspace_id", workspaceId);
    if (e1) return dbError(e1);
    const have = new Set((current ?? []).map((r) => r.user_id as string));
    const want = new Set(p.data.userIds);
    const add = [...want].filter((u) => !have.has(u));
    const remove = [...have].filter((u) => !want.has(u));
    if (add.length) {
      const { error } = await supabase.from("workspace_members").insert(add.map((user_id) => ({ workspace_id: workspaceId, user_id })));
      if (error) return dbError(error);
    }
    if (remove.length) {
      const { error } = await supabase.from("workspace_members").delete().eq("workspace_id", workspaceId).in("user_id", remove);
      if (error) return dbError(error);
    }
    return ok(undefined, "Workspace access updated");
  });
}

// ------------------------------------------------------------------ invitations & members
export async function inviteMemberAction(input: unknown) {
  const p = parse(inviteSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.rpc("create_invitation", {
      p_org: p.data.orgId,
      p_email: p.data.email,
      p_role: p.data.role,
    });
    if (error) return dbError(error, "create_invitation");
    const row = (data as Array<{ invitation_id: string; token: string }>)[0];
    // The plaintext token exists only in this response; only its hash is stored.
    return ok({ invitationId: row.invitation_id, token: row.token }, "Invitation created");
  });
}

export async function revokeInvitationAction(invitationId: string) {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("organization_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", invitationId)
      .is("accepted_at", null)
      .select("id");
    if (error) return dbError(error);
    if (!data?.length) return fail("Invitation not found.");
    return ok(undefined, "Invitation revoked");
  });
}

export async function acceptInvitationAction(token: string) {
  const p = parse(z.string().min(20).max(200), token);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data: orgId, error } = await supabase.rpc("accept_invitation", { p_token: p.data });
    if (error) return dbError(error, "accept_invitation");
    const { data: org } = await supabase.from("organizations").select("slug").eq("id", orgId as string).single();
    return ok({ slug: (org?.slug as string | undefined) ?? "" }, "You joined the organization");
  });
}

export async function changeMemberRoleAction(memberId: string, role: "owner" | "admin" | "member" | "guest") {
  const p = parse(z.object({ memberId: uuid, role: z.enum(["owner", "admin", "member", "guest"]) }), { memberId, role });
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.from("organization_members").update({ role }).eq("id", memberId).select("id");
    if (error) return dbError(error, "change_role");
    if (!data?.length) return fail("You do not have permission to change this member.");
    return ok(undefined, "Role updated");
  });
}

export async function setMemberStatusAction(memberId: string, status: "active" | "deactivated") {
  const p = parse(z.object({ memberId: uuid, status: z.enum(["active", "deactivated"]) }), { memberId, status });
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.from("organization_members").update({ status }).eq("id", memberId).select("id");
    if (error) return dbError(error, "member_status");
    if (!data?.length) return fail("You do not have permission to change this member.");
    return ok(undefined, status === "active" ? "Member reactivated" : "Member deactivated");
  });
}

export async function removeMemberAction(memberId: string) {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.from("organization_members").delete().eq("id", memberId).select("id");
    if (error) return dbError(error, "remove_member");
    if (!data?.length) return fail("You do not have permission to remove this member.");
    return ok(undefined, "Member removed");
  });
}
