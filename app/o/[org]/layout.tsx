import { cookies } from "next/headers";
import { AppShell } from "@/components/app/shell/app-shell";
import { getOrgContext, getProfile } from "@/lib/auth/session";
import { getShellData } from "@/lib/data/shell";

export default async function OrgLayout({ children, params }: LayoutProps<"/o/[org]">) {
  const { org: slug } = await params;
  const [{ org, role, memberships }, profile] = await Promise.all([getOrgContext(slug), getProfile()]);
  const [data, jar] = await Promise.all([getShellData(org.id), cookies()]);
  const wsCookie = jar.get(`fs_ws_${org.id}`)?.value ?? null;
  // only honour a workspace the user can actually see
  const activeWorkspaceId = data.workspaces.some((w) => w.id === wsCookie) ? wsCookie : null;

  return (
    <AppShell
      initialCollapsed={jar.get("fs_sidebar")?.value === "1"}
      value={{ org, role, orgs: memberships, profile, data, activeWorkspaceId }}
    >
      {children}
    </AppShell>
  );
}
