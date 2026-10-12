"use server";

import { z } from "zod";
import { withAuth } from "@/lib/auth/action-context";
import { dbError, ok, parse } from "@/lib/utils/action";
import { uuid } from "@/lib/validations/common";

export async function markNotificationReadAction(id: string, read = true) {
  const p = parse(uuid, id);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase.from("notifications").update({ read_at: read ? new Date().toISOString() : null }).eq("id", id);
    return error ? dbError(error) : ok(undefined);
  });
}

export async function markAllNotificationsReadAction(orgId: string) {
  const p = parse(uuid, orgId);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null)
      .or(`org_id.eq.${orgId},org_id.is.null`);
    return error ? dbError(error) : ok(undefined, "All caught up");
  });
}

export async function deleteNotificationAction(id: string) {
  const p = parse(z.string().uuid(), id);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    return error ? dbError(error) : ok(undefined);
  });
}
