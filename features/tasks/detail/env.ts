import type { MemberLite } from "@/lib/data/project";
import type { CustomFieldDefinition, Label, Project, WorkflowStatus, WorkflowTransition } from "@/types";

/** Everything the task detail UI needs besides the task itself. */
export interface DetailEnv {
  orgId: string;
  orgSlug: string;
  userId: string;
  project: Project;
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
  members: MemberLite[];
  labels: Label[];
  fields: CustomFieldDefinition[];
  canEdit: boolean;
  canManage: boolean;
}

export const personLabel = (m: { full_name: string; email: string } | undefined | null) => m?.full_name || m?.email || "Unknown";
