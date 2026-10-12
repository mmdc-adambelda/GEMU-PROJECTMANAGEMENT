"use client";

import { Copy, MailPlus, Trash2, UserMinus, UserX, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/app/form-field";
import { SimpleSelect } from "@/components/app/simple-select";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  changeMemberRoleAction, inviteMemberAction, removeMemberAction, revokeInvitationAction, setMemberStatusAction,
} from "@/features/orgs/actions";
import { runAction } from "@/lib/hooks/use-run-action";
import { assignableRoles, canManageMember, isOrgAdmin, ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/permissions";
import { fmtDate } from "@/lib/utils/dates";
import type { Invitation, OrgMember, OrgRole } from "@/types";

export function MembersManager({
  orgId, viewerRole, viewerId, members, invitations,
}: { orgId: string; viewerRole: OrgRole; viewerId: string; members: OrgMember[]; invitations: Invitation[] }) {
  const router = useRouter();
  const admin = isOrgAdmin(viewerRole);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<OrgRole, "owner">>("member");
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const grantable = assignableRoles(viewerRole).filter((r) => r !== "owner") as Array<Exclude<OrgRole, "owner">>;

  const refresh = () => router.refresh();
  const act = async (fn: () => Promise<{ ok: boolean }>) => { await fn(); refresh(); };

  if (!admin) {
    return <p className="rounded-md border bg-muted/50 p-4 text-sm">Only organization admins can manage members and invitations. You can browse the team under <strong>Team</strong>.</p>;
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="inv-h" className="space-y-3">
        <h2 id="inv-h" className="text-base font-semibold">Invite someone</h2>
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await runAction(() => inviteMemberAction({ orgId, email, role }), false);
          setBusy(false);
          if (r.ok) { setLink({ email, url: `${window.location.origin}/invite/${r.data.token}` }); setEmail(""); refresh(); }
        }}>
          <Field label="Email" htmlFor="inv-email" className="min-w-64 flex-1">
            <Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
          </Field>
          <Field label="Role" htmlFor="inv-role">
            <SimpleSelect id="inv-role" className="w-32" value={role} onChange={setRole} options={grantable.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
          </Field>
          <Button type="submit" disabled={busy || !email}><MailPlus /> Create invitation</Button>
        </form>
        <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTION[role]}</p>
        {link && (
          <div className="space-y-1.5 rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30" role="status">
            <p className="text-sm font-medium">Invitation for {link.email} created. Send them this private link:</p>
            <div className="flex gap-2">
              <Input readOnly aria-label="Invitation link" value={link.url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="icon" aria-label="Copy link" onClick={() => { void navigator.clipboard.writeText(link.url); toast.success("Link copied"); }}><Copy /></Button>
            </div>
            <p className="text-xs text-muted-foreground">It works only for {link.email}, expires in 7 days and is shown once — we store only a hash of it.</p>
          </div>
        )}
      </section>

      <section aria-labelledby="pend-h" className="space-y-3">
        <h2 id="pend-h" className="text-base font-semibold">Pending invitations ({invitations.length})</h2>
        {invitations.length === 0 ? <p className="text-sm text-muted-foreground">No pending invitations.</p> : (
          <ul className="divide-y rounded-xl border bg-card">
            {invitations.map((i) => {
              const expired = new Date(i.expires_at) < new Date();
              return (
                <li key={i.id} className="flex items-center gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.email}</p>
                    <p className="text-xs text-muted-foreground">{ROLE_LABEL[i.role]} · {expired ? "Expired" : `Expires ${fmtDate(i.expires_at, "MMM d")}`}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => act(() => runAction(() => revokeInvitationAction(i.id)))}>Revoke</Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="mem-h" className="space-y-3">
        <h2 id="mem-h" className="text-base font-semibold">Members ({members.length})</h2>
        <ul className="divide-y rounded-xl border bg-card">
          {members.map((m) => {
            const self = m.user_id === viewerId;
            const can = canManageMember(viewerRole, m.role, self);
            const roleOptions = (assignableRoles(viewerRole) as OrgRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));
            const label = m.profile?.full_name || m.profile?.email || "Unknown";
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 p-3">
                <UserAvatar name={m.profile?.full_name} email={m.profile?.email} src={m.profile?.avatar_url} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">{label}{self && <span className="rounded bg-muted px-1.5 text-[10px] font-normal">You</span>}
                    {m.status === "deactivated" && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-normal text-amber-800 dark:bg-amber-950 dark:text-amber-300">Deactivated</span>}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.profile?.email}</p>
                </div>
                <SimpleSelect size="sm" className="w-28" disabled={!can} value={m.role} aria-label={`Role of ${label}`}
                  onChange={(r) => act(() => runAction(() => changeMemberRoleAction(m.id, r)))}
                  options={roleOptions.some((o) => o.value === m.role) ? roleOptions : [...roleOptions, { value: m.role, label: ROLE_LABEL[m.role] }]} />
                {can && (
                  <>
                    <Button variant="ghost" size="icon-sm" aria-label={m.status === "active" ? `Deactivate ${label}` : `Reactivate ${label}`} title={m.status === "active" ? "Deactivate (keeps history, blocks access)" : "Reactivate"}
                      onClick={() => act(() => runAction(() => setMemberStatusAction(m.id, m.status === "active" ? "deactivated" : "active")))}>
                      {m.status === "active" ? <UserX /> : <UserCheck />}
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${label}`} title="Remove from organization"
                      onClick={() => { if (confirm(`Remove ${label} from this organization? Their access ends immediately.`)) void act(() => runAction(() => removeMemberAction(m.id))); }}>
                      <Trash2 />
                    </Button>
                  </>
                )}
                {self && m.role !== "owner" && (
                  <Button variant="outline" size="sm" onClick={() => { if (confirm("Leave this organization?")) void act(async () => { const r = await runAction(() => removeMemberAction(m.id)); if (r.ok) router.replace("/"); return r; }); }}><UserMinus /> Leave</Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
