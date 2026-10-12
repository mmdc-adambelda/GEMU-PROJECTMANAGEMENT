import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/env";

/** Browser client: runs with the signed-in user's JWT, so Row Level Security applies. */
export function createClient() {
  const { url, key } = supabaseConfig();
  return createBrowserClient(url, key);
}
