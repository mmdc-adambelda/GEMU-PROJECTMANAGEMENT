import type { Metadata } from "next";
import { getOrgContext, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Invitation, OrgMember } from "@/types";
import { MembersManager } from "./members-manager";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ params }: PageProps<"/o/[org]/settings/members">) {
  const { org: slug } = await params;
  const [{ org, role }, user] = await Promise.all([getOrgContext(slug), requireUser()]);
  const supabase = await createClient();
  const [members, invites] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id, org_id, user_id, role, status, created_at, profile:profiles(id, full_name, email, avatar_url, job_title)")
      .eq("org_id", org.id)
      .order("created_at"),
    supabase
      .from("organization_invitations")
      .select("id, org_id, email, role, expires_at, accepted_at, revoked_at, created_at")
      .eq("org_id", org.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ]);
  return (
    <MembersManager
      orgId={org.id}
      viewerRole={role}
      viewerId={user.id}
      members={(members.data ?? []) as unknown as OrgMember[]}
      invitations={(invites.data ?? []) as Invitation[]}
    />
  );
}
