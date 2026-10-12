"use client";

import { createContext, useContext } from "react";
import type { MemberLite } from "@/lib/data/project";
import type { ViewCtx } from "@/lib/tasks/view-logic";
import type {
  CustomFieldDefinition, Label, OrgRole, Project, TaskPriority, TaskRow, TaskType, WorkflowStatus, WorkflowTransition,
} from "@/types";

/** Fields a view may change on a task; mapped onto columns by the task actions. */
export interface TaskPatch {
  title?: string;
  statusId?: string;
  priority?: TaskPriority;
  type?: TaskType;
  assigneeId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  estimateMinutes?: number | null;
  archived?: boolean;
}

export interface WorkspaceCtx {
  orgId: string;
  orgSlug: string;
  orgRole: OrgRole;
  userId: string;
  project: Project;
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
  members: MemberLite[];
  labels: Label[];
  fields: CustomFieldDefinition[];
  customValues: Record<string, Record<string, unknown>>;
  canEdit: boolean;
  canManage: boolean;
  viewCtx: ViewCtx;
  people: Map<string, MemberLite>;
  statusById: Map<string, WorkflowStatus>;
  /** All loaded tasks (unfiltered) and the filtered+sorted list currently shown. */
  allTasks: TaskRow[];
  tasks: TaskRow[];
  dependencies: Array<[string, string]>;
  /** Optimistic update with rollback + toast on failure. Resolves true on success. */
  updateTask: (id: string, patch: TaskPatch) => Promise<boolean>;
  moveTask: (id: string, statusId: string, position: number) => Promise<boolean>;
  openTask: (id: string) => void;
  /** Statuses a task may move to from `fromId`, according to the workflow (client-side hint; DB enforces). */
  allowedTargets: (fromId: string) => Set<string>;
  refresh: () => void;
}

const Ctx = createContext<WorkspaceCtx | null>(null);
export const WorkspaceProvider = Ctx.Provider;

export function useWorkspace() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return v;
}

export const personName = (p: MemberLite | undefined | null) => p?.full_name || p?.email || "Unknown";
