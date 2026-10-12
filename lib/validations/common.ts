import { z } from "zod";

export const uuid = z.string().uuid("Invalid id");
export const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #6366f1");
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** "" / undefined / null all become null. */
export const nullableDate = z
  .union([isoDate, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const nullableUuid = z
  .union([uuid, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const priority = z.enum(["lowest", "low", "medium", "high", "highest"]);
export const taskType = z.enum(["task", "bug", "story", "epic", "improvement", "request"]);
export const orgRole = z.enum(["owner", "admin", "member", "guest"]);
export const statusCategory = z.enum(["todo", "in_progress", "done"]);

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/, "3-50 characters: lowercase letters, numbers and dashes");

export const projectKey = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, "2-10 characters, letters and numbers, starting with a letter");
