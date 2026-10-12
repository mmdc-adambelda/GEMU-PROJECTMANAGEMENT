import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityEntry, Label, Task, TaskAttachment, TaskComment, TimeEntry } from "@/types";

export interface TaskLite {
  id: string;
  key: string;
  title: string;
  status_id: string;
  project_id: string;
}

export interface SubtaskRow extends TaskLite {
  assignee_id: string | null;
  priority: Task["priority"];
  due_date: string | null;
}

export interface TaskDetailData {
  task: Task;
  labels: Label[];
  comments: TaskComment[];
  activity: ActivityEntry[];
  attachments: TaskAttachment[];
  blockedBy: TaskLite[];
  blocking: TaskLite[];
  subtasks: SubtaskRow[];
  parent: TaskLite | null;
  timeEntries: TimeEntry[];
  watchers: string[];
  customValues: Record<string, unknown>;
}

const LITE = "id, key, title, status_id, project_id";

/** Load everything the task view needs in parallel; every query is RLS-filtered for the caller. */
export async function loadTaskDetail(supabase: SupabaseClient, taskId: string): Promise<TaskDetailData | null> {
  const { data: task } = await supabase
    .from("tasks")
    .select("*, task_labels(labels(id, org_id, name, color))")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return null;

  const [comments, activity, attachments, blockedBy, blocking, subtasks, parent, time, watchers, values] = await Promise.all([
    supabase.from("task_comments").select("*").eq("task_id", taskId).order("created_at"),
    supabase.from("activity_log").select("*").eq("task_id", taskId).order("created_at", { ascending: false }).limit(100),
    supabase.from("task_attachments").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
    supabase.from("task_dependencies").select(`blocker:tasks!task_dependencies_blocked_by_task_id_fkey(${LITE})`).eq("task_id", taskId),
    supabase.from("task_dependencies").select(`dependent:tasks!task_dependencies_task_id_fkey(${LITE})`).eq("blocked_by_task_id", taskId),
    supabase
      .from("tasks")
      .select(`${LITE}, assignee_id, priority, due_date`)
      .eq("parent_id", taskId)
      .is("archived_at", null)
      .order("number"),
    task.parent_id ? supabase.from("tasks").select(LITE).eq("id", task.parent_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("time_entries").select("*").eq("task_id", taskId).order("logged_on", { ascending: false }),
    supabase.from("task_watchers").select("user_id").eq("task_id", taskId),
    supabase.from("task_custom_field_values").select("field_id, value").eq("task_id", taskId),
  ]);

  const { task_labels, ...rest } = task as Task & { task_labels?: Array<{ labels: Label | null }> };
  return {
    task: rest as Task,
    labels: (task_labels ?? []).map((l) => l.labels).filter((l): l is Label => !!l),
    comments: (comments.data ?? []) as TaskComment[],
    activity: (activity.data ?? []) as ActivityEntry[],
    attachments: (attachments.data ?? []) as TaskAttachment[],
    blockedBy: ((blockedBy.data ?? []) as unknown as Array<{ blocker: TaskLite | null }>).map((r) => r.blocker).filter((x): x is TaskLite => !!x),
    blocking: ((blocking.data ?? []) as unknown as Array<{ dependent: TaskLite | null }>).map((r) => r.dependent).filter((x): x is TaskLite => !!x),
    subtasks: (subtasks.data ?? []) as SubtaskRow[],
    parent: (parent.data as TaskLite | null) ?? null,
    timeEntries: (time.data ?? []) as TimeEntry[],
    watchers: (watchers.data ?? []).map((w) => w.user_id as string),
    customValues: Object.fromEntries((values.data ?? []).map((v) => [v.field_id as string, v.value])),
  };
}
