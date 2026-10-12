"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ShellData } from "@/lib/data/shell";
import type { Organization, OrgRole, Profile } from "@/types";

export interface ShellContextValue {
  org: Organization;
  role: OrgRole;
  orgs: Array<{ org: Organization; role: OrgRole }>;
  profile: Profile;
  data: ShellData;
  activeWorkspaceId: string | null;
}

const Ctx = createContext<ShellContextValue | null>(null);

export function ShellProvider({ value, children }: { value: ShellContextValue; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShell() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useShell must be used inside <ShellProvider>");
  return v;
}

export const orgPath = (slug: string, path = "") => `/o/${slug}${path}`;
