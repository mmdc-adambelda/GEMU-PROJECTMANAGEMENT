"use client";

import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Field, FormError, SubmitButton } from "@/components/app/form-field";
import { ImageUpload } from "@/components/app/image-upload";
import { Logo } from "@/components/app/logo";
import { SimpleSelect } from "@/components/app/simple-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createOrganizationAction, createWorkspaceAction, inviteMemberAction, setOrganizationLogoAction,
} from "@/features/orgs/actions";
import { createProjectAction } from "@/features/projects/actions";
import { createSpaceAction } from "@/features/spaces/actions";
import { createTaskAction } from "@/features/tasks/actions";
import { PROJECT_TEMPLATES } from "@/lib/constants";
import { runAction } from "@/lib/hooks/use-run-action";
import { cn } from "@/lib/utils";
import { suggestKey } from "@/features/projects/create-project-dialog";

export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  org: { id: string; slug: string; name: string; logoUrl: string | null } | null;
  workspaceId: string | null;
  projectId: string | null;
  projectKey: string | null;
  firstName: string;
}

const STEPS = ["Organization", "Workspace", "Team", "Project", "First task"];
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

export function OnboardingWizard({ initial }: { initial: WizardState }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // step 1
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  // step 2
  const [wsName, setWsName] = useState("Main workspace");
  // step 3
  const [invites, setInvites] = useState([{ email: "", role: "member" as "admin" | "member" | "guest" }]);
  const [links, setLinks] = useState<Array<{ email: string; url: string }>>([]);
  // step 4
  const [spaceName, setSpaceName] = useState("");
  const [projName, setProjName] = useState("");
  const [projKey, setProjKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [template, setTemplate] = useState<(typeof PROJECT_TEMPLATES)[number]["value"]>("software");
  // step 5
  const [taskTitle, setTaskTitle] = useState("");

  const go = (step: WizardState["step"], patch: Partial<WizardState> = {}) => {
    setError(null);
    setS((p) => ({ ...p, ...patch, step }));
  };

  async function step1(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const r = await runAction(() => createOrganizationAction({ name: orgName, slug }), false);
    setPending(false);
    if (!r.ok) return setError(r.error);
    setS((p) => ({ ...p, org: { id: r.data.id, slug: r.data.slug, name: orgName, logoUrl: null } }));
  }

  async function step2(e: React.FormEvent) {
    e.preventDefault();
    if (!s.org) return;
    setPending(true);
    const r = await runAction(() => createWorkspaceAction(s.org!.id, { name: wsName }), false);
    setPending(false);
    if (!r.ok) return setError(r.error);
    go(3, { workspaceId: r.data.id });
  }

  async function step3(e: React.FormEvent) {
    e.preventDefault();
    if (!s.org) return;
    const rows = invites.filter((i) => i.email.trim());
    if (rows.length === 0) return go(4);
    setPending(true);
    const made: Array<{ email: string; url: string }> = [];
    for (const row of rows) {
      const r = await runAction(() => inviteMemberAction({ orgId: s.org!.id, email: row.email, role: row.role }), false);
      if (r.ok) made.push({ email: row.email, url: `${window.location.origin}/invite/${r.data.token}` });
      else toast.error(`${row.email}: ${r.error}`);
    }
    setPending(false);
    if (made.length) setLinks(made);
    else setError("No invitations were created.");
  }

  async function step4(e: React.FormEvent) {
    e.preventDefault();
    if (!s.org || !s.workspaceId) return;
    setPending(true);
    const sp = await runAction(() => createSpaceAction({ workspaceId: s.workspaceId, name: spaceName || "General", icon: "layers" }), false);
    if (!sp.ok) { setPending(false); return setError(sp.error); }
    const pr = await runAction(() => createProjectAction({ spaceId: sp.data.id, name: projName, key: projKey, template }), false);
    setPending(false);
    if (!pr.ok) return setError(pr.error);
    go(5, { projectId: pr.data.id, projectKey: pr.data.key });
  }

  async function step5(e: React.FormEvent) {
    e.preventDefault();
    if (!s.org || !s.projectId) return;
    setPending(true);
    const r = await runAction(() => createTaskAction({ projectId: s.projectId, title: taskTitle }), false);
    setPending(false);
    if (!r.ok) return setError(r.error);
    router.replace(`/o/${s.org.slug}/p/${s.projectKey}?view=board`);
    router.refresh();
  }

  const finish = () => {
    router.replace(s.org ? `/o/${s.org.slug}${s.projectKey ? `/p/${s.projectKey}?view=board` : ""}` : "/");
    router.refresh();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Logo />
        {s.org && s.step >= 2 && (
          <Button variant="ghost" size="sm" onClick={finish}>Skip setup</Button>
        )}
      </div>

      <ol className="flex items-center gap-2" aria-label="Progress">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = s.step > n;
          return (
            <li key={label} className="flex flex-1 items-center gap-2" aria-current={s.step === n ? "step" : undefined}>
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  done && "border-primary bg-primary text-primary-foreground",
                  s.step === n && "border-primary text-primary",
                )}
              >
                {done ? <Check className="size-3.5" /> : n}
              </span>
              <span className={cn("hidden truncate text-xs sm:inline", s.step === n ? "font-medium" : "text-muted-foreground")}>{label}</span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
            </li>
          );
        })}
      </ol>

      <FormError message={error} />

      {s.step === 1 && !s.org && (
        <form onSubmit={step1} className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome{s.firstName ? `, ${s.firstName}` : ""} 👋</h1>
            <p className="text-sm text-muted-foreground">Let’s create your organization — the home for your teams and work.</p>
          </div>
          <Field label="Organization name" htmlFor="org-name">
            <Input
              id="org-name"
              autoFocus
              required
              value={orgName}
              onChange={(e) => {
                setOrgName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              placeholder="Acme Inc."
            />
          </Field>
          <Field label="Organization URL" htmlFor="org-slug" hint="Lowercase letters, numbers and dashes. Used in your links.">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">/o/</span>
              <Input id="org-slug" required value={slug} onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }} />
            </div>
          </Field>
          <SubmitButton pending={pending}>Create organization</SubmitButton>
        </form>
      )}

      {s.step === 1 && s.org && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Add a logo</h1>
            <p className="text-sm text-muted-foreground">Optional — you can change it later in settings.</p>
          </div>
          <ImageUpload
            bucket="org-logos"
            folder={s.org.id}
            currentUrl={s.org.logoUrl}
            label={s.org.name}
            allowSvg
            onChange={async (url) => {
              const r = await runAction(() => setOrganizationLogoAction(s.org!.id, url), false);
              if (r.ok) setS((p) => ({ ...p, org: p.org ? { ...p.org, logoUrl: url } : p.org }));
            }}
          />
          <Button onClick={() => go(2)}>Continue</Button>
        </div>
      )}

      {s.step === 2 && (
        <form onSubmit={step2} className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Create your first workspace</h1>
            <p className="text-sm text-muted-foreground">Workspaces group related spaces — for example by department or client.</p>
          </div>
          <Field label="Workspace name" htmlFor="ws-name">
            <Input id="ws-name" autoFocus required value={wsName} onChange={(e) => setWsName(e.target.value)} />
          </Field>
          <SubmitButton pending={pending}>Continue</SubmitButton>
        </form>
      )}

      {s.step === 3 && (
        <form onSubmit={step3} className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Invite your team</h1>
            <p className="text-sm text-muted-foreground">
              Each invitation produces a private link. Share it with the person — it only works for their email address.
            </p>
          </div>
          {links.length === 0 ? (
            <>
              <div className="space-y-2">
                {invites.map((row, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      type="email"
                      aria-label={`Email ${i + 1}`}
                      placeholder="teammate@company.com"
                      value={row.email}
                      onChange={(e) => setInvites((r) => r.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                    />
                    <SimpleSelect
                      value={row.role}
                      onChange={(role) => setInvites((r) => r.map((x, j) => (j === i ? { ...x, role } : x)))}
                      className="w-32"
                      aria-label="Role"
                      options={[
                        { value: "admin", label: "Admin" },
                        { value: "member", label: "Member" },
                        { value: "guest", label: "Guest" },
                      ]}
                    />
                    {invites.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" aria-label="Remove row" onClick={() => setInvites((r) => r.filter((_, j) => j !== i))}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setInvites((r) => [...r, { email: "", role: "member" }])}>
                  <Plus /> Add another
                </Button>
              </div>
              <div className="flex gap-2">
                <SubmitButton pending={pending}>Send invitations</SubmitButton>
                <Button type="button" variant="ghost" onClick={() => go(4)}>Skip for now</Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              {links.map((l) => (
                <div key={l.email} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{l.email}</p>
                  <div className="mt-1 flex gap-2">
                    <Input readOnly value={l.url} aria-label={`Invitation link for ${l.email}`} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                    <Button type="button" variant="outline" size="icon" aria-label="Copy link" onClick={() => { void navigator.clipboard.writeText(l.url); toast.success("Link copied"); }}>
                      <Copy />
                    </Button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">These links are shown once. You can manage invitations later under Settings → Members.</p>
              <Button type="button" onClick={() => go(4)}>Continue</Button>
            </div>
          )}
        </form>
      )}

      {s.step === 4 && (
        <form onSubmit={step4} className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Create your first project</h1>
            <p className="text-sm text-muted-foreground">We will put it in a new space so you can customise the workflow later.</p>
          </div>
          <Field label="Space name" htmlFor="sp-name" hint="A major area of work, e.g. Engineering.">
            <Input id="sp-name" value={spaceName} onChange={(e) => setSpaceName(e.target.value)} placeholder="General" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Project name" htmlFor="pr-name">
              <Input
                id="pr-name"
                required
                value={projName}
                onChange={(e) => { setProjName(e.target.value); if (!keyTouched) setProjKey(suggestKey(e.target.value)); }}
                placeholder="Website relaunch"
              />
            </Field>
            <Field label="Key" htmlFor="pr-key">
              <Input id="pr-key" required className="font-mono uppercase" maxLength={10} value={projKey} onChange={(e) => { setProjKey(e.target.value.toUpperCase()); setKeyTouched(true); }} />
            </Field>
          </div>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-1.5 text-sm font-medium">Template</legend>
            {PROJECT_TEMPLATES.map((t) => (
              <label key={t.value} className={cn("cursor-pointer rounded-md border p-2.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", template === t.value && "border-primary bg-primary/5")}>
                <input type="radio" name="template" className="sr-only" checked={template === t.value} onChange={() => setTemplate(t.value)} />
                <span className="block font-medium">{t.label}</span>
                <span className="block text-xs text-muted-foreground">{t.description}</span>
              </label>
            ))}
          </fieldset>
          <SubmitButton pending={pending}>Create project</SubmitButton>
        </form>
      )}

      {s.step === 5 && (
        <form onSubmit={step5} className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Add your first task</h1>
            <p className="text-sm text-muted-foreground">What is the first thing your team needs to get done?</p>
          </div>
          <Field label="Task title" htmlFor="t-title">
            <Input id="t-title" autoFocus required value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Draft the project brief" />
          </Field>
          <div className="flex gap-2">
            <SubmitButton pending={pending}>Create task & open board</SubmitButton>
            <Button type="button" variant="ghost" onClick={finish}>Skip</Button>
          </div>
        </form>
      )}
    </div>
  );
}
