import type { Metadata } from "next";
import { getOrgContext, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Notification } from "@/types";
import { InboxList } from "./inbox-list";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({ params }: PageProps<"/o/[org]/inbox">) {
  const { org: slug } = await params;
  const [{ org }, user] = await Promise.all([getOrgContext(slug), requireUser()]);
  const supabase = await createClient();
  // RLS also hides notifications about tasks the user can no longer see
  const { data } = await supabase
    .from("notifications")
    .select("*, actor:profiles!notifications_actor_id_fkey(full_name, email, avatar_url), task:tasks(key), project:projects(key)")
    .eq("user_id", user.id)
    .or(`org_id.eq.${org.id},org_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(200);

  type Row = Notification & {
    actor: { full_name: string; email: string; avatar_url: string | null } | null;
    task: { key: string } | null;
    project: { key: string } | null;
  };
  return <InboxList orgId={org.id} orgSlug={org.slug} items={(data ?? []) as unknown as Row[]} />;
}
