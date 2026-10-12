import type { Metadata } from "next";
import { getOrgContext, getProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/utils/dates";
import type { StatusCategory, Task, WorkflowStatus } from "@/types";
import { MyTasks, type MyTask } from "./my-tasks";

export const metadata: Metadata = { title: "My Tasks" };

export default async function MyTasksPage({ params, searchParams }: PageProps<"/o/[org]/my-tasks">) {
  const [{ org: slug }, sp] = await Promise.all([params, searchParams]);
  const [{ org }, profile] = await Promise.all([getOrgContext(slug), getProfile()]);
  const showDone = sp.done === "1";
  const supabase = await createClient();

  let q = supabase
    .from("tasks")
    .select("id, key, title, due_date, priority, status_id, project:projects(key, name, space_id, color), status:workflow_statuses!inner(name, color, category)")
    .eq("org_id", org.id)
    .eq("assignee_id", profile.id)
    .is("archived_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(500);
  if (!showDone) q = q.neq("status.category", "done");
  const { data } = await q;

  const rows = (data ?? []) as unknown as Array<
    Pick<Task, "id" | "key" | "title" | "due_date" | "priority" | "status_id"> & {
      project: { key: string; name: string; space_id: string; color: string };
      status: { name: string; color: string; category: StatusCategory };
    }
  >;
  const spaceIds = [...new Set(rows.map((r) => r.project.space_id))];
  const { data: statuses } = spaceIds.length
    ? await supabase.from("workflow_statuses").select("*").in("space_id", spaceIds).order("position")
    : { data: [] };

  return (
    <MyTasks
      orgSlug={org.slug}
      today={todayIn(profile.timezone)}
      showDone={showDone}
      tasks={rows as unknown as MyTask[]}
      statuses={(statuses ?? []) as WorkflowStatus[]}
    />
  );
}
