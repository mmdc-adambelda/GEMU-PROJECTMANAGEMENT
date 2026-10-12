"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { withAuth } from "@/lib/auth/action-context";
import { dbError, ok, parse } from "@/lib/utils/action";
import { profileSchema } from "@/lib/validations/auth";
import type { UserPreferences } from "@/types";

const prefsSchema = z
  .object({
    sidebarCollapsed: z.boolean(),
    projectView: z.enum(["list", "board", "calendar", "timeline"]),
    lastOrgSlug: z.string().max(60),
    theme: z.enum(["light", "dark", "system"]),
    notifications: z.record(
      z.enum(["assigned", "reassigned", "mention", "comment", "due_soon", "overdue", "invitation", "status_change"]),
      z.boolean(),
    ),
  })
  .partial()
  .strict();

/** Merge a partial preferences patch into profiles.preferences (per-user, RLS-protected). */
export async function updatePreferencesAction(patch: Partial<UserPreferences>) {
  const p = parse(prefsSchema, patch);
  if ("error" in p) return p.error;
  if (p.data.sidebarCollapsed !== undefined) {
    // mirrored in a cookie so the first server render has the right width (no layout flash)
    (await cookies()).set("fs_sidebar", p.data.sidebarCollapsed ? "1" : "0", {
      path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax",
    });
  }
  return withAuth(async ({ supabase, user }) => {
    const { data: cur, error: e1 } = await supabase.from("profiles").select("preferences").eq("id", user.id).single();
    if (e1) return dbError(e1);
    const prefs = { ...(cur?.preferences as object), ...p.data };
    const { error } = await supabase.from("profiles").update({ preferences: prefs }).eq("id", user.id);
    return error ? dbError(error) : ok(undefined);
  });
}

export async function updateProfileAction(input: unknown) {
  const p = parse(profileSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase, user }) => {
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: p.data.fullName, job_title: p.data.jobTitle, timezone: p.data.timezone })
      .eq("id", user.id);
    if (error) return dbError(error);
    revalidatePath("/", "layout");
    return ok(undefined, "Profile saved");
  });
}

export async function setAvatarAction(url: string | null) {
  const p = parse(z.string().url().max(500).nullable(), url);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase, user }) => {
    const { error } = await supabase.from("profiles").update({ avatar_url: p.data }).eq("id", user.id);
    if (error) return dbError(error);
    revalidatePath("/", "layout");
    return ok(undefined, "Photo updated");
  });
}

export async function changePasswordAction(input: unknown) {
  const { resetSchema } = await import("@/lib/validations/auth");
  const p = parse(resetSchema, input);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase.auth.updateUser({ password: p.data.password });
    return error ? { ok: false as const, error: error.message } : ok(undefined, "Password updated");
  });
}
