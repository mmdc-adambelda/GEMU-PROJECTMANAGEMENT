"use client";

import { Search, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { orgPath } from "@/lib/paths";
import { SimpleSelect } from "@/components/app/simple-select";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isOrgAdmin, ROLE_LABEL } from "@/lib/permissions";
import type { MemberStatus, OrgRole } from "@/types";

export interface TeamRow {
  memberId: string; userId: string; name: string; email: string; avatar: string | null; jobTitle: string | null;
  role: OrgRole; status: MemberStatus; open: number; overdue: number; done30: number;
}

export function TeamDirectory({ orgSlug, viewerRole, rows }: { orgSlug: string; viewerRole: OrgRole; rows: TeamRow[] }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const list = rows
    .filter((r) => r.status === "active" || isOrgAdmin(viewerRole))
    .filter((r) => role === "all" || r.role === role)
    .filter((r) => `${r.name} ${r.email} ${r.jobTitle ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const maxOpen = Math.max(1, ...rows.map((r) => r.open));
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">{list.length} {list.length === 1 ? "person" : "people"} · workload counts only include tasks you can see</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search people" className="w-56 pl-8" placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <SimpleSelect size="sm" className="w-32" value={role} onChange={setRole} aria-label="Filter by role"
            options={[{ value: "all", label: "All roles" }, ...(["owner", "admin", "member", "guest"] as const).map((r) => ({ value: r, label: ROLE_LABEL[r] }))]} />
          {isOrgAdmin(viewerRole) && <Button size="sm" render={<Link href={orgPath(orgSlug, "/settings/members")} />}><UserPlus /> Invite & manage</Button>}
        </div>
      </div>
      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No one matches.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <li key={r.userId}>
              <Link href={orgPath(orgSlug, `/team/${r.userId}`)} className="block h-full space-y-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-center gap-3">
                  <UserAvatar name={r.name} email={r.email} src={r.avatar} className="size-10" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-medium">
                      {r.name}
                      {r.status === "deactivated" && <span className="rounded bg-muted px-1.5 text-[10px] font-normal">Deactivated</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{r.jobTitle || r.email}</p>
                  </div>
                  <span className="ml-auto rounded-full border px-2 py-0.5 text-[11px]">{ROLE_LABEL[r.role]}</span>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>{r.open} open</span>
                    <span className={r.overdue ? "font-medium text-red-600 dark:text-red-400" : ""}>{r.overdue} overdue</span>
                    <span>{r.done30} done (30d)</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${r.open} open tasks`}>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(100 * r.open) / maxOpen}%` }} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
