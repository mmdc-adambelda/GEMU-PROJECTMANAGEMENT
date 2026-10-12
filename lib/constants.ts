import type { ProjectStatus, TaskPriority, TaskType } from "@/types";

export const PRIORITIES: TaskPriority[] = ["highest", "high", "medium", "low", "lowest"];
export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  highest: "Highest", high: "High", medium: "Medium", low: "Low", lowest: "Lowest",
};
/** Higher number = more urgent. Used for sorting. */
export const PRIORITY_RANK: Record<TaskPriority, number> = { highest: 5, high: 4, medium: 3, low: 2, lowest: 1 };
export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  highest: "#dc2626", high: "#f97316", medium: "#eab308", low: "#3b82f6", lowest: "#94a3b8",
};

export const TASK_TYPES: TaskType[] = ["task", "bug", "story", "epic", "improvement", "request"];
export const TYPE_LABEL: Record<TaskType, string> = {
  task: "Task", bug: "Bug", story: "Story", epic: "Epic", improvement: "Improvement", request: "Request",
};
export const TYPE_COLOR: Record<TaskType, string> = {
  task: "#3b82f6", bug: "#ef4444", story: "#22c55e", epic: "#8b5cf6", improvement: "#06b6d4", request: "#f59e0b",
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Planned", active: "Active", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled",
};

export const PROJECT_TEMPLATES = [
  { value: "general", label: "General project", description: "A blank project for any kind of work." },
  { value: "software", label: "Software development", description: "Adds frontend, backend and tech-debt labels." },
  { value: "it_ops", label: "IT operations", description: "Adds incident, change and maintenance labels." },
  { value: "marketing", label: "Marketing campaign", description: "Adds campaign, content and design labels." },
] as const;

export const ACTIVITY_LABEL: Record<string, string> = {
  "task.created": "created this task",
  "task.title_changed": "changed the title",
  "task.status_changed": "changed the status",
  "task.priority_changed": "changed the priority",
  "task.type_changed": "changed the type",
  "task.assignee_changed": "changed the assignee",
  "task.due_date_changed": "changed the due date",
  "task.start_date_changed": "changed the start date",
  "task.estimate_changed": "changed the estimate",
  "task.description_changed": "updated the description",
  "task.commented": "commented",
  "task.attachment_added": "attached a file",
  "task.archived": "archived this task",
  "task.restored": "restored this task",
  "task.moved": "moved this task into the project",
  "task.moved_out": "moved this task to another project",
  "project.created": "created the project",
  "space.created": "created the space",
  "organization.created": "created the organization",
  "member.invited": "invited a member",
  "member.joined": "joined the organization",
};
