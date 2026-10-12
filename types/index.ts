/**
 * Hand-written row types for the tables the UI touches. They mirror supabase/migrations.
 * (Once a project is linked you can generate full types with `npm run db:types`.)
 */
export type OrgRole = "owner" | "admin" | "member" | "guest";
export type MemberStatus = "active" | "deactivated";
export type StatusCategory = "todo" | "in_progress" | "done";
export type TaskPriority = "lowest" | "low" | "medium" | "high" | "highest";
export type TaskType = "task" | "bug" | "story" | "epic" | "improvement" | "request";
export type ProjectStatus = "planned" | "active" | "on_hold" | "completed" | "cancelled";
export type ProjectRole = "lead" | "member" | "viewer";
export type SpaceRole = "admin" | "member" | "viewer";
export type CustomFieldType = "text" | "number" | "date" | "checkbox" | "select" | "multi_select" | "url";
export type ProjectView = "list" | "board" | "calendar" | "timeline";

export type NotificationType =
  | "assigned"
  | "reassigned"
  | "mention"
  | "comment"
  | "due_soon"
  | "overdue"
  | "invitation"
  | "status_change";

export interface UserPreferences {
  sidebarCollapsed?: boolean;
  projectView?: ProjectView;
  lastOrgSlug?: string;
  theme?: "light" | "dark" | "system";
  workspaceByOrg?: Record<string, string>;
  notifications?: Partial<Record<NotificationType, boolean>>;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  job_title: string | null;
  timezone: string;
  preferences: UserPreferences;
}

export type PersonLite = Pick<Profile, "id" | "full_name" | "email" | "avatar_url">;

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  settings: Record<string, unknown>;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  status: MemberStatus;
  created_at: string;
  profile: (PersonLite & { job_title: string | null }) | null;
}

export interface Invitation {
  id: string;
  org_id: string;
  email: string;
  role: OrgRole;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface Workspace {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  icon: string;
  is_private: boolean;
  archived_at: string | null;
}

export interface Space {
  id: string;
  org_id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  owner_id: string | null;
  is_private: boolean;
  archived_at: string | null;
}

export interface WorkflowStatus {
  id: string;
  space_id: string;
  name: string;
  color: string;
  category: StatusCategory;
  position: number;
  is_default: boolean;
  wip_limit: number | null;
}

export interface WorkflowTransition {
  space_id: string;
  from_status_id: string;
  to_status_id: string;
  required_fields: string[];
}

export interface Project {
  id: string;
  org_id: string;
  space_id: string;
  name: string;
  key: string;
  description: string | null;
  lead_id: string | null;
  start_date: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: ProjectStatus;
  tags: string[];
  icon: string;
  color: string;
  template: string;
  archived_at: string | null;
  created_at: string;
}

export interface ProjectStats {
  project_id: string;
  total_tasks: number;
  done_tasks: number;
  in_progress_tasks: number;
  overdue_tasks: number;
  progress_pct: number;
}

export interface Label {
  id: string;
  org_id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  org_id: string;
  project_id: string;
  number: number;
  key: string;
  title: string;
  description: string;
  status_id: string;
  priority: TaskPriority;
  type: TaskType;
  assignee_id: string | null;
  reporter_id: string | null;
  parent_id: string | null;
  start_date: string | null;
  due_date: string | null;
  estimate_minutes: number | null;
  resolution: string | null;
  completed_at: string | null;
  archived_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

/** Task enriched for list / board rendering. */
export interface TaskRow extends Task {
  labels: Label[];
  subtask_total: number;
  subtask_done: number;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  edited_at: string | null;
  created_at: string;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  uploaded_by: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
}

export interface TimeEntry {
  id: string;
  task_id: string;
  user_id: string;
  minutes: number;
  description: string | null;
  logged_on: string;
}

export interface ActivityEntry {
  id: string;
  org_id: string;
  project_id: string | null;
  task_id: string | null;
  actor_id: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  org_id: string | null;
  type: NotificationType;
  task_id: string | null;
  project_id: string | null;
  actor_id: string | null;
  title: string;
  read_at: string | null;
  created_at: string;
}

export interface CustomFieldDefinition {
  id: string;
  org_id: string;
  space_id: string | null;
  name: string;
  field_type: CustomFieldType;
  options: string[];
  is_required: boolean;
  position: number;
}

export interface AutomationRule {
  id: string;
  org_id: string;
  space_id: string;
  project_id: string | null;
  name: string;
  is_enabled: boolean;
  trigger_type: "task_created" | "status_changed" | "subtasks_completed" | "task_overdue";
  conditions: Record<string, string>;
  actions: Array<Record<string, string>>;
}

export interface TaskFilters {
  q?: string;
  status?: string[];
  assignee?: string[]; // user ids or "unassigned"
  reporter?: string[];
  priority?: TaskPriority[];
  type?: TaskType[];
  label?: string[];
  due?: "today" | "overdue" | "week" | "none";
  quick?: "mine" | "created" | "unassigned" | "recent";
}

export interface ViewConfig {
  view?: ProjectView;
  filters?: TaskFilters;
  sort?: { field: "due_date" | "priority" | "created_at" | "updated_at" | "title"; dir: "asc" | "desc" };
  group?: "none" | "status" | "assignee" | "priority" | "label";
  columns?: string[];
}

export interface SavedView {
  id: string;
  org_id: string;
  project_id: string | null;
  owner_id: string;
  name: string;
  is_shared: boolean;
  config: ViewConfig;
}
