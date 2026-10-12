"use server";

import { z } from "zod";
import { withAuth } from "@/lib/auth/action-context";
import { dbError, fail, ok, parse } from "@/lib/utils/action";
import { uuid } from "@/lib/validations/common";
import { savedViewSchema } from "@/lib/validations/domain";

export async function createSavedViewAction(input: unknown) {
  const p = parse(savedViewSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase, user }) => {
    const { data, error } = await supabase
      .from("saved_views")
      .insert({
        org_id: p.data.orgId,
        project_id: p.data.projectId,
        owner_id: user.id,
        name: p.data.name,
        is_shared: p.data.isShared,
        config: p.data.config,
      })
      .select("*")
      .single();
    if (error) return dbError(error);
    return ok(data, "View saved");
  });
}

export async function deleteSavedViewAction(viewId: string) {
  const p = parse(uuid, viewId);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.from("saved_views").delete().eq("id", viewId).select("id");
    if (error) return dbError(error);
    if (!data?.length) return fail("Only the owner can delete a view.");
    return ok(undefined, "View deleted");
  });
}

const widgetsSchema = z.object({
  orgId: uuid,
  config: z.object({
    widgets: z
      .array(z.object({ id: z.string().max(40), visible: z.boolean(), size: z.enum(["sm", "md", "lg"]).optional() }))
      .max(30),
  }),
});

/** Per-user dashboard layout (which widgets, in which order). */
export async function saveDashboardConfigAction(input: unknown) {
  const p = parse(widgetsSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase, user }) => {
    const { error } = await supabase
      .from("dashboard_configurations")
      .upsert({ user_id: user.id, org_id: p.data.orgId, config: p.data.config }, { onConflict: "user_id,org_id" });
    return error ? dbError(error) : ok(undefined, "Dashboard saved");
  });
}
