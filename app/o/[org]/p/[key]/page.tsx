import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectWorkspace, type ViewId } from "@/features/projects/workspace/project-workspace";
import { getOrgContext, getProfile } from "@/lib/auth/session";
import { getMembers, getProjectAccess, getProjectByKey, loadProjectData } from "@/lib/data/project";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/utils/dates";
import type { ProjectView, SavedView } from "@/types";

const VIEWS: ViewId[] = ["overview", "list", "board", "calendar", "timeline", "activity", "settings"];

export async function generateMetadata({ params }: PageProps<"/o/[org]/p/[key]">): Promise<Metadata> {
  const { key } = await params;
  return { title: key.toUpperCase() };
}

export default async function ProjectPage({ params, searchParams }: PageProps<"/o/[org]/p/[key]">) {
  const [{ org: slug, key }, sp] = await Promise.all([params, searchParams]);
  const [{ org, role }, profile] = await Promise.all([getOrgContext(slug), getProfile()]);
  const project = await getProjectByKey(org.id, key);
  if (!project) notFound();

  const supabase = await createClient();
  const [data, members, access, views] = await Promise.all([
    loadProjectData(project),
    getMembers(org.id),
    getProjectAccess(project.id),
    supabase
      .from("saved_views")
      .select("*")
      .eq("org_id", org.id)
      .or(`project_id.eq.${project.id},project_id.is.null`)
      .order("created_at"),
  ]);

  const preferred: ProjectView = profile.preferences.projectView ?? "board";
  const requested = typeof sp.view === "string" ? (sp.view as ViewId) : undefined;
  const initialView = requested && VIEWS.includes(requested) ? requested : preferred;

  let initialTask: string | null = null;
  if (typeof sp.task === "string") {
    const k = sp.task.toUpperCase();
    initialTask = data.tasks.find((t) => t.key === k)?.id ?? null;
    if (!initialTask) {
      const { data: t } = await supabase.from("tasks").select("id").eq("org_id", org.id).eq("key", k).maybeSingle();
      initialTask = (t?.id as string | undefined) ?? null;
    }
  }

  return (
    <ProjectWorkspace
      orgId={org.id}
      orgSlug={org.slug}
      orgRole={role}
      userId={profile.id}
      project={project}
      data={data}
      members={members}
      access={access}
      savedViews={(views.data ?? []) as SavedView[]}
      initialView={initialView}
      initialTask={initialTask}
      preferredView={preferred}
      today={todayIn(profile.timezone)}
    />
  );
}
