import type { OrgRole } from "@/types";

/**
 * UI-side mirror of the authorization rules. This only decides which controls to SHOW.
 * The database (RLS policies + triggers) is the source of truth and re-checks every write.
 */
const rank: Record<OrgRole, number> = { guest: 0, member: 1, admin: 2, owner: 3 };

export const atLeast = (role: OrgRole | null | undefined, min: OrgRole) => !!role && rank[role] >= rank[min];

export const isOrgAdmin = (role: OrgRole | null | undefined) => atLeast(role, "admin");
export const isOrgOwner = (role: OrgRole | null | undefined) => role === "owner";
export const canCreateWorkspace = isOrgAdmin;
export const canCreateWork = (role: OrgRole | null | undefined) => atLeast(role, "member");
export const canInvite = isOrgAdmin;

/** Which roles `actor` may grant when inviting or changing someone's role. */
export function assignableRoles(actor: OrgRole | null | undefined): OrgRole[] {
  if (actor === "owner") return ["owner", "admin", "member", "guest"];
  if (actor === "admin") return ["member", "guest"];
  return [];
}

/** May `actor` change or remove `target`'s membership? (never yourself, only owners touch owners) */
export function canManageMember(actor: OrgRole | null | undefined, target: OrgRole, isSelf: boolean) {
  if (isSelf || !isOrgAdmin(actor)) return false;
  if (target === "owner") return actor === "owner";
  return true;
}

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  guest: "Guest",
};

export const ROLE_DESCRIPTION: Record<OrgRole, string> = {
  owner: "Full control of the organization, including billing-level actions and other owners.",
  admin: "Manages members, workspaces, spaces and configuration. Cannot manage owners.",
  member: "Creates and manages work in the spaces and projects they can access.",
  guest: "Sees only the spaces and projects explicitly shared with them.",
};
