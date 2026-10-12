"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, SubmitButton } from "@/components/app/form-field";
import { ImageUpload } from "@/components/app/image-upload";
import { LogoMark } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteOrganizationAction } from "@/features/orgs/delete-action";
import { setOrganizationLogoAction, updateOrganizationAction } from "@/features/orgs/actions";
import { runAction } from "@/lib/hooks/use-run-action";
import { isOrgAdmin, isOrgOwner } from "@/lib/permissions";
import type { Organization, OrgRole } from "@/types";

export function GeneralSettings({ org, role }: { org: Organization; role: OrgRole }) {
  const router = useRouter();
  const admin = isOrgAdmin(role);
  const [name, setName] = useState(org.name);
  const [logo, setLogo] = useState(org.logo_url);
  const [pending, setPending] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [confirm, setConfirm] = useState("");

  return (
    <div className="max-w-2xl space-y-8">
      {!admin && <p className="rounded-md border bg-muted/50 p-3 text-sm">Only organization admins can change these settings.</p>}
      <section className="space-y-4">
        {admin ? (
          <ImageUpload bucket="org-logos" folder={org.id} currentUrl={logo} label="Organization logo" allowSvg fallback={<LogoMark className="size-12" />}
            onChange={async (url) => {
              const r = await runAction(() => setOrganizationLogoAction(org.id, url));
              if (r.ok) { setLogo(url); router.refresh(); }
            }} />
        ) : null}
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          const r = await runAction(() => updateOrganizationAction(org.id, { name }));
          setPending(false);
          if (r.ok) router.refresh();
        }}>
          <Field label="Organization name" htmlFor="org-name"><Input id="org-name" value={name} disabled={!admin} maxLength={100} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Organization URL" htmlFor="org-slug" hint="The URL identifier cannot be changed."><Input id="org-slug" value={`/o/${org.slug}`} disabled readOnly className="font-mono" /></Field>
          {admin && <SubmitButton pending={pending}>Save changes</SubmitButton>}
        </form>
      </section>

      {isOrgOwner(role) && (
        <section className="space-y-3 rounded-lg border border-destructive/30 p-4">
          <h2 className="text-base font-semibold text-destructive">Danger zone</h2>
          <p className="text-sm text-muted-foreground">Deleting the organization permanently removes all workspaces, spaces, projects, tasks and files.</p>
          <Button variant="destructive" onClick={() => setDelOpen(true)}><Trash2 /> Delete organization</Button>
        </section>
      )}

      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {org.name}?</DialogTitle>
            <DialogDescription>This cannot be undone. Type <strong>{org.name}</strong> to confirm.</DialogDescription>
          </DialogHeader>
          <Input aria-label="Type the organization name" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <DialogFooter>
            <Button variant="destructive" disabled={confirm !== org.name} onClick={async () => {
              const r = await runAction(() => deleteOrganizationAction(org.id, confirm));
              if (r.ok) { router.replace("/"); router.refresh(); }
            }}>Delete permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
