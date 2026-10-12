import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Storage policies authorise access THROUGH the task row, so objects must be removed while the rows
 * still exist. Callers therefore (1) verify permission, (2) call this, (3) delete the rows.
 * Failures are logged; a leftover object is harmless (it is unreachable without its row).
 */
export async function removeAttachmentObjects(supabase: SupabaseClient, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from("attachments").remove(paths.slice(i, i + 100));
    if (error) console.error("[storage-cleanup]", error.message);
  }
}
