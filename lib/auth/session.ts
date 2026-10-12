import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Organization, OrgRole, Profile } from "@/types";

/** Authenticated user, validated with the Auth server (not just the cookie). Cached per request. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export const getProfile = cache(async (): Promise<Profile> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  // The auth trigger always creates a profile; fall back defensively rather than crash the shell.
  return (
    (data as Profile | null) ?? {
      id: user.id,
      email: user.email ?? "",
      full_name: (user.user_metadata?.full_name as string | undefined) ?? "",
      avatar_url: null,
      job_title: null,
      timezone: "UTC",
      preferences: {},
    }
  );
});

export interface Membership {
  role: OrgRole;
  org: Organization;
}

/** Organizations the user actively belongs to (RLS already limits this to their own memberships). */
export const getMemberships = cache(async (): Promise<Membership[]> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("role, status, organizations(id, name, slug, logo_url, settings)")
    .eq("user_id", user.id)
    .eq("status", "active");
  return ((data ?? []) as unknown as Array<{ role: OrgRole; organizations: Organization | null }>)
    .filter((m) => m.organizations)
    .map((m) => ({ role: m.role, org: m.organizations as Organization }))
    .sort((a, b) => a.org.name.localeCompare(b.org.name));
});

/** Resolve `/o/[slug]` for the signed-in user; 404 (not 403) when they are not a member. */
export const getOrgContext = cache(async (slug: string) => {
  const memberships = await getMemberships();
  const m = memberships.find((x) => x.org.slug === slug);
  if (!m) notFound();
  return { ...m, memberships };
});
