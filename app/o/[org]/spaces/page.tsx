import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getOrgContext } from "@/lib/auth/session";
import { getMembers } from "@/lib/data/project";
import { createClient } from "@/lib/supabase/server";
import type { Project, Space, Workspace } from "@/types";
import { SpacesGrid } from "./spaces-grid";

export const metadata: Metadata = { title: "Spaces" };

export default async function SpacesPage({ params, searchParams }: PageProps<"/o/[org]/spaces">) {
  const [{ org: slug }, sp] = await Promise.all([params, searchParams]);
  const { org } = await getOrgContext(slug);
  const showArchived = sp.archived === "1";
  const supabase = await createClient();
  const jar = await cookies();
  const wsCookie = jar.get(`fs_ws_${org.id}`)?.value ?? null;

  const [spaces, workspaces, projects, members] = await Promise.all([
    supabase.from("spaces").select("*").eq("org_id", org.id).order("name"),
    supabase.from("workspaces").select("*").eq("org_id", org.id).order("name"),
    supabase.from("projects").select("id, space_id, archived_at").eq("org_id", org.id),
    getMembers(org.id),
  ]);

  const counts = new Map<string, number>();
  for (const p of (projects.data ?? []) as Array<Pick<Project, "id" | "space_id" | "archived_at">>) {
    if (!p.archived_at) counts.set(p.space_id, (counts.get(p.space_id) ?? 0) + 1);
  }
  const ws = (workspaces.data ?? []) as Workspace[];
  const activeWs = ws.some((w) => w.id === wsCookie) ? wsCookie : null;

  return (
    <SpacesGrid
      orgSlug={org.slug}
      spaces={(spaces.data ?? []) as Space[]}
      workspaces={ws}
      activeWorkspaceId={activeWs}
      counts={Object.fromEntries(counts)}
      owners={Object.fromEntries(members.map((m) => [m.id, { name: m.full_name || m.email, avatar: m.avatar_url, email: m.email }]))}
      showArchived={showArchived}
    />
  );
}
