import { expect, it } from "vitest";
import { asAdmin, createDb } from "./harness";

/** PostgREST embeds in lib/data reference these constraint names; fail loudly if a migration renames them. */
it("foreign-key names used by PostgREST embeds exist", async () => {
  const db = await createDb();
  const rows = await asAdmin<{ conname: string }>(db, `select conname from pg_constraint where contype = 'f'`);
  const names = new Set(rows.map((r) => r.conname));
  for (const n of [
    "task_dependencies_blocked_by_task_id_fkey",
    "task_dependencies_task_id_fkey",
    "task_labels_label_id_fkey",
    "organization_members_user_id_fkey",
    "notifications_actor_id_fkey",
  ]) {
    expect(names.has(n), n).toBe(true);
  }
});
