import type { Metadata } from "next";
import { getOrgContext } from "@/lib/auth/session";
import { getWorkload } from "@/lib/data/stats";
import { createClient } from "@/lib/supabase/server";
import type { OrgMember } from "@/types";
import { TeamDirectory, type TeamRow } from "./team-directory";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: PageProps<"/o/[org]/team">) {
  const { org: slug } = await params;
  const { org, role } = await getOrgContext(slug);
  const supabase = await createClient();
  const [members, workload] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id, role, status, created_at, user_id, profiles(id, full_name, email, avatar_url, job_title)")
      .eq("org_id", org.id),
    getWorkload(org.id),
  ]);
  const load = new Map(workload.map((w) => [w.user_id, w]));
  const rows = ((members.data ?? []) as unknown as Array<{
    id: string; role: OrgMember["role"]; status: OrgMember["status"]; user_id: string;
    profiles: { id: string; full_name: string; email: string; avatar_url: string | null; job_title: string | null } | null;
  }>)
    .filter((m) => m.profiles)
    .map<TeamRow>((m) => ({
      memberId: m.id,
      userId: m.user_id,
      name: m.profiles!.full_name || m.profiles!.email,
      email: m.profiles!.email,
      avatar: m.profiles!.avatar_url,
      jobTitle: m.profiles!.job_title,
      role: m.role,
      status: m.status,
      open: load.get(m.user_id)?.open_tasks ?? 0,
      overdue: load.get(m.user_id)?.overdue_tasks ?? 0,
      done30: load.get(m.user_id)?.completed_30d ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return <TeamDirectory orgSlug={org.slug} viewerRole={role} rows={rows} />;
}
