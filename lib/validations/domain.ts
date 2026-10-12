import { z } from "zod";
import {
  color,
  nullableDate,
  nullableText,
  nullableUuid,
  orgRole,
  priority,
  projectKey,
  slug,
  statusCategory,
  taskType,
  uuid,
} from "./common";

const name = (label: string, max = 100) =>
  z.string().trim().min(1, `Enter a ${label}`).max(max, `At most ${max} characters`);

export const orgSchema = z.object({ name: name("name"), slug });
export const orgUpdateSchema = z.object({ name: name("name") });

export const workspaceSchema = z.object({
  name: name("name"),
  description: nullableText(500),
  icon: z.string().trim().min(1).max(40).default("briefcase"),
  isPrivate: z.boolean().default(false),
});

export const spaceSchema = z.object({
  workspaceId: uuid,
  name: name("name"),
  description: nullableText(500),
  icon: z.string().trim().min(1).max(40).default("layers"),
  color: color.default("#6366f1"),
  isPrivate: z.boolean().default(false),
});
/** Update schemas never use defaults: an omitted key must leave the column untouched. */
export const workspaceUpdateSchema = z
  .object({
    name: name("name"),
    description: nullableText(500),
    icon: z.string().trim().min(1).max(40),
    isPrivate: z.boolean(),
    archived: z.boolean(),
  })
  .partial()
  .strict();

export const spaceUpdateSchema = z
  .object({
    name: name("name"),
    description: nullableText(500),
    icon: z.string().trim().min(1).max(40),
    color,
    isPrivate: z.boolean(),
    ownerId: uuid,
    archived: z.boolean(),
  })
  .partial()
  .strict();

export const projectTemplate = z.enum(["general", "software", "it_ops", "marketing"]);

export const projectSchema = z
  .object({
    spaceId: uuid,
    name: name("name"),
    key: projectKey,
    description: nullableText(2000),
    leadId: nullableUuid,
    startDate: nullableDate,
    dueDate: nullableDate,
    priority: priority.default("medium"),
    template: projectTemplate.default("general"),
    color: color.default("#6366f1"),
    icon: z.string().trim().min(1).max(40).default("folder"),
  })
  .refine((v) => !v.startDate || !v.dueDate || v.dueDate >= v.startDate, {
    path: ["dueDate"],
    message: "Due date must be on or after the start date",
  });

export const projectUpdateSchema = z.object({
  name: name("name").optional(),
  description: nullableText(2000).optional(),
  leadId: nullableUuid.optional(),
  startDate: nullableDate.optional(),
  dueDate: nullableDate.optional(),
  priority: priority.optional(),
  status: z.enum(["planned", "active", "on_hold", "completed", "cancelled"]).optional(),
  color: color.optional(),
});

export const taskCreateSchema = z.object({
  projectId: uuid,
  title: name("title", 300),
  description: z.string().max(50000).default(""),
  statusId: nullableUuid,
  priority: priority.default("medium"),
  type: taskType.default("task"),
  assigneeId: nullableUuid,
  parentId: nullableUuid,
  startDate: nullableDate,
  dueDate: nullableDate,
  estimateMinutes: z.number().int().min(0).max(1_000_000).nullish().transform((v) => v ?? null),
  labelIds: z.array(uuid).max(20).default([]),
});

/** Partial update: only the keys present are written. */
export const taskUpdateSchema = z
  .object({
    title: name("title", 300),
    description: z.string().max(50000),
    statusId: uuid,
    priority,
    type: taskType,
    assigneeId: nullableUuid,
    parentId: nullableUuid,
    startDate: nullableDate,
    dueDate: nullableDate,
    estimateMinutes: z.number().int().min(0).max(1_000_000).nullable(),
    resolution: nullableText(500),
    archived: z.boolean(),
  })
  .partial()
  .strict();

export const commentSchema = z.object({
  taskId: uuid,
  body: z.string().trim().min(1, "Write something first").max(20000),
  parentId: nullableUuid,
});

export const statusSchema = z.object({
  spaceId: uuid,
  name: name("name", 50),
  color: color.default("#94a3b8"),
  category: statusCategory.default("todo"),
  wipLimit: z.number().int().min(1).max(999).nullish().transform((v) => v ?? null),
});

export const statusUpdateSchema = z
  .object({
    name: name("name", 50),
    color,
    category: statusCategory,
    wipLimit: z.number().int().min(1).max(999).nullable(),
  })
  .partial()
  .strict();

export const customFieldSchema = z.object({
  orgId: uuid,
  spaceId: nullableUuid,
  name: name("name", 60),
  fieldType: z.enum(["text", "number", "date", "checkbox", "select", "multi_select", "url"]),
  options: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  isRequired: z.boolean().default(false),
});

export const inviteSchema = z.object({
  orgId: uuid,
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: orgRole.exclude(["owner"]),
});

export const timeEntrySchema = z.object({
  taskId: uuid,
  minutes: z.number().int().min(1).max(1440),
  description: nullableText(300),
  loggedOn: nullableDate,
});

export const automationSchema = z.object({
  spaceId: uuid,
  orgId: uuid,
  name: name("name"),
  trigger: z.enum(["task_created", "status_changed", "subtasks_completed", "task_overdue"]),
  conditions: z
    .object({
      to_status_id: uuid.optional(),
      priority: priority.optional(),
      type: taskType.optional(),
    })
    .default({}),
  actions: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("assign_user"), user_id: uuid }),
        z.object({ type: z.literal("set_priority"), priority }),
        z.object({ type: z.literal("set_status"), status_id: uuid }),
        z.object({ type: z.literal("notify_user"), user_id: uuid }),
        z.object({ type: z.literal("notify_project_lead") }),
      ]),
    )
    .min(1, "Add at least one action")
    .max(10),
});

export const taskFiltersSchema = z.object({
  q: z.string().max(200).optional(),
  status: z.array(uuid).optional(),
  assignee: z.array(z.union([uuid, z.literal("unassigned")])).optional(),
  reporter: z.array(uuid).optional(),
  priority: z.array(priority).optional(),
  type: z.array(taskType).optional(),
  label: z.array(uuid).optional(),
  due: z.enum(["today", "overdue", "week", "none"]).optional(),
  quick: z.enum(["mine", "created", "unassigned", "recent"]).optional(),
});

export const savedViewSchema = z.object({
  orgId: uuid,
  projectId: nullableUuid,
  name: name("name", 80),
  isShared: z.boolean().default(false),
  config: z
    .object({
      view: z.enum(["list", "board", "calendar", "timeline"]).optional(),
      filters: taskFiltersSchema.optional(),
      sort: z
        .object({
          field: z.enum(["due_date", "priority", "created_at", "updated_at", "title"]),
          dir: z.enum(["asc", "desc"]),
        })
        .optional(),
      group: z.enum(["none", "status", "assignee", "priority", "label"]).optional(),
      columns: z.array(z.string().max(60)).max(40).optional(),
    })
    .default({}),
});

export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
/** Allow-list of upload types; everything else is rejected before it reaches storage. */
export const ATTACHMENT_MIME_ALLOWLIST = [
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf", "text/plain", "text/csv", "text/markdown",
  "application/zip", "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
