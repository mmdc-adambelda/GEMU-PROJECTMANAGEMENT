"use server";

import { withAuth } from "@/lib/auth/action-context";
import { loadTaskDetail } from "@/lib/data/task-detail";
import { fail, ok, parse } from "@/lib/utils/action";
import { uuid } from "@/lib/validations/common";

/** Read action used by the task drawer; RLS guarantees a user only receives tasks they can see. */
export async function getTaskDetailAction(taskId: string) {
  const p = parse(uuid, taskId);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const data = await loadTaskDetail(supabase, p.data);
    if (!data) return fail("This task no longer exists or you no longer have access to it.");
    return ok(data);
  });
}

/** Search tasks across the org (for "blocked by" / parent pickers). */
export async function searchTasksAction(orgId: string, query: string) {
  const p = parse(uuid, orgId);
  if ("error" in p) return p.error;
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase.rpc("search_org", { p_org: orgId, p_query: query, p_limit: 8 });
    if (error) return fail("Search failed.");
    return ok((data as { tasks: Array<{ id: string; key: string; title: string; project_id: string }> }).tasks ?? []);
  });
}
