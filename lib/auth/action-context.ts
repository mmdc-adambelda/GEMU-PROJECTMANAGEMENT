import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { fail, type ActionResult } from "@/lib/utils/action";

export interface AuthedContext {
  supabase: SupabaseClient;
  user: User;
}

/**
 * Wrap a Server Action body: verifies the session with the Auth server first, then hands over an
 * RLS-bound client. Authorization itself is enforced by the database for every statement.
 */
export async function withAuth<T>(fn: (ctx: AuthedContext) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return fail("Your session has expired. Please sign in again.");
  try {
    return await fn({ supabase, user: data.user });
  } catch (e) {
    console.error("[action]", e);
    return fail("Something went wrong. Please try again.");
  }
}
