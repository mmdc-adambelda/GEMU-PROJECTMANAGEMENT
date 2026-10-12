"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Field, FormError, SubmitButton } from "@/components/app/form-field";
import { ImageUpload } from "@/components/app/image-upload";
import { SimpleSelect } from "@/components/app/simple-select";
import { UserAvatar } from "@/components/app/user-avatar";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { changePasswordAction, setAvatarAction, updatePreferencesAction, updateProfileAction } from "@/features/account/actions";
import { runAction } from "@/lib/hooks/use-run-action";
import { profileSchema, resetSchema } from "@/lib/validations/auth";
import type { NotificationType, Profile } from "@/types";

const NOTIFS: Array<{ id: NotificationType; label: string; hint: string }> = [
  { id: "assigned", label: "Assignments", hint: "A task is assigned to you" },
  { id: "reassigned", label: "Reassignments", hint: "A task is reassigned to you" },
  { id: "mention", label: "Mentions", hint: "Someone @mentions you" },
  { id: "comment", label: "Comments", hint: "New comments on tasks you watch" },
  { id: "status_change", label: "Status changes", hint: "Tasks you watch change status" },
  { id: "due_soon", label: "Due soon", hint: "A task assigned to you is due today or tomorrow" },
  { id: "overdue", label: "Overdue", hint: "A task assigned to you is overdue" },
  { id: "invitation", label: "Invitations", hint: "You are invited to an organization" },
];

function zones() {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}

export function AccountSettings({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [avatar, setAvatar] = useState(profile.avatar_url);
  const [err, setErr] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState(profile.preferences.notifications ?? {});

  const form = useForm<{ fullName: string; jobTitle: string; timezone: string }>({
    resolver: zodResolver(profileSchema) as never,
    defaultValues: { fullName: profile.full_name, jobTitle: profile.job_title ?? "", timezone: profile.timezone },
  });
  const pw = useForm<{ password: string; confirm: string }>({ resolver: zodResolver(resetSchema), defaultValues: { password: "", confirm: "" } });
  const tz = zones();

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-xl border bg-card p-5" aria-labelledby="prof-h">
        <h2 id="prof-h" className="font-semibold">Profile</h2>
        <ImageUpload bucket="avatars" folder={profile.id} currentUrl={avatar} shape="round" label={profile.email}
          fallback={<UserAvatar name={profile.full_name} email={profile.email} className="size-16 text-lg" />}
          onChange={async (url) => {
            const r = await runAction(() => setAvatarAction(url));
            if (r.ok) { setAvatar(url); router.refresh(); }
          }} />
        <form className="space-y-4" noValidate onSubmit={form.handleSubmit(async (v) => {
          setErr(null); setSaving(true);
          const r = await runAction(() => updateProfileAction(v));
          setSaving(false);
          if (!r.ok) setErr(r.error); else router.refresh();
        })}>
          <FormError message={err} />
          <Field label="Full name" htmlFor="fullName" error={form.formState.errors.fullName?.message}><Input id="fullName" {...form.register("fullName")} /></Field>
          <Field label="Email" htmlFor="email" hint="Your sign-in email cannot be changed here."><Input id="email" value={profile.email} disabled readOnly /></Field>
          <Field label="Job title" htmlFor="jobTitle"><Input id="jobTitle" {...form.register("jobTitle")} /></Field>
          <Field label="Timezone" htmlFor="timezone" hint="Used to decide what “today” and “overdue” mean for you.">
            <Input id="timezone" list="tz-list" {...form.register("timezone")} />
            <datalist id="tz-list">{tz.map((z) => <option key={z} value={z} />)}</datalist>
          </Field>
          <SubmitButton pending={saving}>Save profile</SubmitButton>
        </form>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-5" aria-labelledby="app-h">
        <h2 id="app-h" className="font-semibold">Appearance</h2>
        <Field label="Theme" htmlFor="theme">
          <SimpleSelect id="theme" className="w-48" value={theme ?? "system"}
            onChange={(t) => { setTheme(t); void updatePreferencesAction({ theme: t as "light" | "dark" | "system" }); }}
            options={[{ value: "system", label: "Match system" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
        </Field>
      </section>

      <section id="notifications" className="space-y-3 rounded-xl border bg-card p-5" aria-labelledby="nt-h">
        <h2 id="nt-h" className="font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground">Choose which in-app notifications you receive.</p>
        <ul className="divide-y">
          {NOTIFS.map((n) => (
            <li key={n.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1"><p className="text-sm font-medium">{n.label}</p><p className="text-xs text-muted-foreground">{n.hint}</p></div>
              <Switch checked={notif[n.id] !== false} aria-label={n.label}
                onCheckedChange={async (on) => {
                  const next = { ...notif, [n.id]: Boolean(on) };
                  setNotif(next);
                  const r = await runAction(() => updatePreferencesAction({ notifications: next }), false);
                  if (!r.ok) setNotif(notif);
                }} />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-5" aria-labelledby="pw-h">
        <h2 id="pw-h" className="font-semibold">Change password</h2>
        <form className="space-y-4" noValidate onSubmit={pw.handleSubmit(async (v) => {
          setPwErr(null);
          const r = await runAction(() => changePasswordAction(v));
          if (!r.ok) setPwErr(r.error); else pw.reset();
        })}>
          <FormError message={pwErr} />
          <Field label="New password" htmlFor="np" error={pw.formState.errors.password?.message}><Input id="np" type="password" autoComplete="new-password" {...pw.register("password")} /></Field>
          <Field label="Confirm new password" htmlFor="cp" error={pw.formState.errors.confirm?.message}><Input id="cp" type="password" autoComplete="new-password" {...pw.register("confirm")} /></Field>
          <SubmitButton pending={pw.formState.isSubmitting}>Update password</SubmitButton>
        </form>
      </section>
    </div>
  );
}
