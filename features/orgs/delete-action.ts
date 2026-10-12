"use server";

import { revalidatePath } from "next/cache";
import { withAuth } from "@/lib/auth/action-context";
import { dbError, fail, ok, parse } from "@/lib/utils/action";
import { removeAttachmentObjects } from "@/lib/data/storage-cleanup";
import { uuid } from "@/lib/validations/common";

/** Owner-only (enforced by RLS: organizations_delete). Cascades through the whole hierarchy. */
export async function deleteOrganizationAction(orgId: string, confirmName: string) {
  const p = parse(uuid, orgId);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase, user }) => {
    const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
    if (!org) return fail("Organization not found.");
    if ((org.name as string) !== confirmName) return fail("The name you typed does not match.");

    const { data: me } = await supabase.from("organization_members").select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
    if (me?.role !== "owner") return fail("Only the owner can delete an organization.");

    // owner verified: remove files while the rows (which storage policies depend on) still exist
    const { data: files } = await supabase.from("tasks").select("task_attachments(storage_path)").eq("org_id", orgId).limit(20000);
    const paths = ((files ?? []) as unknown as Array<{ task_attachments: Array<{ storage_path: string }> }>).flatMap((t) => t.task_attachments.map((a) => a.storage_path));
    await removeAttachmentObjects(supabase, paths);

    const { data, error } = await supabase.from("organizations").delete().eq("id", orgId).select("id");
    if (error) return dbError(error);
    if (!data?.length) return fail("Only the owner can delete an organization.");
    revalidatePath("/", "layout");
    return ok(undefined, "Organization deleted");
  });
}
