"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { ok, parse } from "@/lib/utils/action";
import { uuid } from "@/lib/validations/common";

/** Remembers the active workspace per organization (cookie; read by the org layout). */
export async function setActiveWorkspaceAction(orgId: string, workspaceId: string | null) {
  const p = parse(z.object({ orgId: uuid, workspaceId: uuid.nullable() }), { orgId, workspaceId });
  if ("error" in p) return p.error;
  const jar = await cookies();
  const name = `fs_ws_${p.data.orgId}`;
  if (p.data.workspaceId) {
    jar.set(name, p.data.workspaceId, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  } else {
    jar.delete(name);
  }
  return ok(undefined);
}
