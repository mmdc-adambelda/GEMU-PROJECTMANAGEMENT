import { createClient } from "@/lib/supabase/server";
import type {
  ActivityEntry, CustomFieldDefinition, Label, OrgMember, PersonLite, Project, ProjectStats, Space,
  TaskRow, WorkflowStatus, WorkflowTransition,
} from "@/types";

import { TASK_LIMIT } from "@/lib/limits";

export interface MemberLite extends PersonLite {
  role: OrgMember["role"];
  job_title: string | null;
}

export async function getMembers(orgId: string): Promise<MemberLite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("role, profiles(id, full_name, email, avatar_url, job_title)")
    .eq("org_id", orgId)
    .eq("status", "active");
  return ((data ?? []) as unknown as Array<{ role: MemberLite["role"]; profiles: Omit<MemberLite, "role"> | null }>)
    .filter((m) => m.profiles)
    .map((m) => ({ ...(m.profiles as Omit<MemberLite, "role">), role: m.role }))
    .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
}

export async function getProjectByKey(orgId: string, key: string): Promise<Project | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("*").eq("org_id", orgId).eq("key", key.toUpperCase()).maybeSingle();
  return (data as Project | null) ?? null;
}

type RawTask = TaskRow & {
  task_labels?: Array<{ labels: Label | null }>;
  task_custom_field_values?: Array<{ field_id: string; value: unknown }>;
  task_dependencies?: Array<{ blocked_by_task_id: string }>;
};

export interface CustomValues {
  [taskId: string]: { [fieldId: string]: unknown };
}

export interface ProjectData {
  space: Space;
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
  tasks: TaskRow[];
  truncated: boolean;
  labels: Label[];
  fields: CustomFieldDefinition[];
  customValues: CustomValues;
  /** [task, blocker] pairs between tasks of this project */
  dependencies: Array<[string, string]>;
  stats: ProjectStats | null;
  activity: ActivityEntry[];
  projectMembers: Array<{ user_id: string; role: "lead" | "member" | "viewer" }>;
  spaceMembers: Array<{ user_id: string; role: "admin" | "member" | "viewer" }>;
}

export async function loadProjectData(project: Project): Promise<ProjectData> {
  const supabase = await createClient();
  const [space, statuses, transitions, tasks, labels, fields, stats, activity, pm, sm] = await Promise.all([
    supabase.from("spaces").select("*").eq("id", project.space_id).single(),
    supabase.from("workflow_statuses").select("*").eq("space_id", project.space_id).order("position"),
    supabase.from("workflow_transitions").select("*").eq("space_id", project.space_id),
    supabase
      .from("tasks")
      .select("*, task_labels(labels(id, org_id, name, color)), task_custom_field_values(field_id, value), task_dependencies!task_dependencies_task_id_fkey(blocked_by_task_id)")
      .eq("project_id", project.id)
      .is("archived_at", null)
      .order("position", { ascending: true })
      .limit(TASK_LIMIT),
    supabase.from("labels").select("*").eq("org_id", project.org_id).order("name"),
    supabase
      .from("custom_field_definitions")
      .select("*")
      .eq("org_id", project.org_id)
      .or(`space_id.is.null,space_id.eq.${project.space_id}`)
      .order("position")
      .order("name"),
    supabase.from("project_stats").select("*").eq("project_id", project.id).maybeSingle(),
    supabase.from("activity_log").select("*").eq("project_id", project.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("project_members").select("user_id, role").eq("project_id", project.id),
    supabase.from("space_members").select("user_id, role").eq("space_id", project.space_id),
  ]);

  const raw = (tasks.data ?? []) as unknown as RawTask[];
  const customValues: CustomValues = {};
  const dependencies: Array<[string, string]> = [];
  const rows: TaskRow[] = raw.map((t) => {
    const { task_labels, task_custom_field_values, task_dependencies, ...rest } = t;
    for (const d of task_dependencies ?? []) dependencies.push([t.id, d.blocked_by_task_id]);
    if (task_custom_field_values?.length) {
      customValues[t.id] = Object.fromEntries(task_custom_field_values.map((v) => [v.field_id, v.value]));
    }
    return {
      ...(rest as TaskRow),
      labels: (task_labels ?? []).map((l) => l.labels).filter((l): l is Label => !!l),
    };
  });

  // subtask counts (computed from loaded rows)
  const cat = new Map((statuses.data ?? []).map((s) => [s.id as string, s.category as string]));
  const total = new Map<string, number>();
  const done = new Map<string, number>();
  for (const t of rows) {
    if (!t.parent_id) continue;
    total.set(t.parent_id, (total.get(t.parent_id) ?? 0) + 1);
    if (cat.get(t.status_id) === "done") done.set(t.parent_id, (done.get(t.parent_id) ?? 0) + 1);
  }
  for (const t of rows) {
    t.subtask_total = total.get(t.id) ?? 0;
    t.subtask_done = done.get(t.id) ?? 0;
  }

  return {
    space: space.data as Space,
    statuses: (statuses.data ?? []) as WorkflowStatus[],
    transitions: (transitions.data ?? []) as WorkflowTransition[],
    tasks: rows,
    truncated: rows.length >= TASK_LIMIT,
    labels: (labels.data ?? []) as Label[],
    fields: (fields.data ?? []) as CustomFieldDefinition[],
    customValues,
    dependencies,
    stats: (stats.data as ProjectStats | null) ?? null,
    activity: (activity.data ?? []) as ActivityEntry[],
    projectMembers: (pm.data ?? []) as ProjectData["projectMembers"],
    spaceMembers: (sm.data ?? []) as ProjectData["spaceMembers"],
  };
}

export interface Access { can_view: boolean; can_edit: boolean; can_manage: boolean }

/** What the viewer may do in this project, answered by the same functions RLS uses. */
export async function getProjectAccess(projectId: string): Promise<Access> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("project_access", { p_project: projectId });
  return (data as Access | null) ?? { can_view: false, can_edit: false, can_manage: false };
}
