import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "@/lib/env";

const PUBLIC_PREFIXES = ["/login", "/register", "/forgot-password", "/auth"];
const AUTH_ONLY_GUEST_PAGES = ["/login", "/register", "/forgot-password"];

const isPublic = (path: string) => PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));

/**
 * Refreshes the Supabase session cookie on every request and gates routes.
 * This is a convenience layer (fast redirects) - real authorization is enforced by RLS and by
 * server-side checks in every Server Action / data loader.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseConfig();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() validates the JWT signature; never trust getSession() on the server.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;

  if (!signedIn && !isPublic(path)) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    to.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(to);
  }
  if (signedIn && AUTH_ONLY_GUEST_PAGES.includes(path)) {
    const to = request.nextUrl.clone();
    to.pathname = "/";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}
