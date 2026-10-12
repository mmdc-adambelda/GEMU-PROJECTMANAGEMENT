import type { ZodType } from "zod";

export type Failure = { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | Failure;

export const ok = <T = undefined>(data?: T, message?: string): ActionResult<T> =>
  ({ ok: true, data: data as T, message });

export const fail = (error: string, fieldErrors?: Record<string, string[]>): Failure =>
  ({ ok: false, error, fieldErrors });

/** Validate untrusted input with a Zod schema; returns a ready-to-return failure on error. */
export function parse<T>(schema: ZodType<T>, input: unknown): { data: T } | { error: Failure } {
  const r = schema.safeParse(input);
  if (r.success) return { data: r.data };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of r.error.issues) {
    const k = issue.path.join(".") || "_";
    (fieldErrors[k] ??= []).push(issue.message);
  }
  return { error: fail(r.error.issues[0]?.message ?? "Invalid input", fieldErrors) };
}

/**
 * Map Postgres / PostgREST errors (including our trigger exceptions) to a message safe to show.
 * Raw database details are logged server-side only.
 */
export function dbError(error: { code?: string; message: string } | null | undefined, context = "request"): Failure {
  if (!error) return fail("Something went wrong");
  const { code, message } = error;
  if (/row-level security|permission denied/i.test(message)) return fail("You do not have permission to do that.");
  // Our own guards raise 42501 with a deliberate, user-safe message (e.g. "Only owners can manage owners").
  if (code === "42501") return fail(message);
  if (code === "23505") {
    if (/projects_org_id_key_key/.test(message)) return fail("That project key is already used in this organization.");
    if (/organizations_slug_key/.test(message)) return fail("That organization URL is already taken.");
    return fail("That already exists.");
  }
  if (code === "23503") return fail(/still use|task\(s\)/.test(message) ? message : "This item is still referenced elsewhere.");
  // Messages raised intentionally by our triggers/RPCs use these codes and are user-safe.
  if (code === "23514" || code === "22023" || code === "P0001" || code === "28000" || code === "53400" || code === "P0002") {
    return fail(message);
  }
  console.error(`[db:${context}]`, code, message);
  return fail("Something went wrong. Please try again.");
}
