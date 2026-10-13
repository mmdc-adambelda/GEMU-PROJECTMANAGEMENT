import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail } from "lucide-react";
import { DueBadge, PriorityIcon, StatusPill } from "@/components/app/task-chips";
import { orgPath } from "@/lib/paths";
import { UserAvatar } from "@/components/app/user-avatar";
import { getOrgContext, getProfile } from "@/lib/auth/session";
import { getWorkload } from "@/lib/data/stats";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/permissions";
import { fmtMinutes, todayIn } from "@/lib/utils/dates";
import type { OrgRole, StatusCategory, Task } from "@/types";

export const metadata: Metadata = { title: "Team member" };

export default async function MemberPage({ params }: PageProps<"/o/[org]/team/[userId]">) {
  const { org: slug, userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) notFound();
  const [{ org }, me] = await Promise.all([getOrgContext(slug), getProfile()]);
  const supabase = await createClient();
  const { data: m } = await supabase
    .from("organization_members")
    .select("role, status, profiles(id, full_name, email, avatar_url, job_title, timezone)")
    .eq("org_id", org.id)
    .eq("user_id", userId)
    .maybeSingle();
  const prof = (m as unknown as { role: OrgRole; status: string; profiles: { full_name: string; email: string; avatar_url: string | null; job_title: string | null; timezone: string } | null } | null);
  if (!prof?.profiles) notFound();

  const [load, tasks] = await Promise.all([
    getWorkload(org.id),
    supabase
      .from("tasks")
      .select("id, key, title, due_date, priority, completed_at, status:workflow_statuses(name, color, category), project:projects(key, name)")
      .eq("org_id", org.id)
      .eq("assignee_id", userId)
      .is("archived_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(200),
  ]);
  const w = load.find((x) => x.user_id === userId);
  const today = todayIn(me.timezone);
  const rows = (tasks.data ?? []) as unknown as Array<Pick<Task, "id" | "key" | "title" | "due_date" | "priority" | "completed_at"> & {
    status: { name: string; color: string; category: StatusCategory }; project: { key: string; name: string };
  }>;
  const open = rows.filter((r) => r.status.category !== "done");
  const done = rows.filter((r) => r.status.category === "done").slice(0, 8);
  const p = prof.profiles;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Link href={orgPath(org.slug, "/team")} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Team</Link>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5">
        <UserAvatar name={p.full_name} email={p.email} src={p.avatar_url} className="size-16 text-lg" />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{p.full_name || p.email}</h1>
          <p className="text-sm text-muted-foreground">{p.job_title || "No job title"} · {ROLE_LABEL[prof.role]}{prof.status === "deactivated" ? " · Deactivated" : ""}</p>
          <a href={`mailto:${p.email}`} className="mt-1 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Mail className="size-3.5" />{p.email}</a>
        </div>
        <dl className="ml-auto grid grid-cols-3 gap-6 text-center">
          <div><dt className="text-xs text-muted-foreground">Open</dt><dd className="text-2xl font-semibold tabular-nums">{w?.open_tasks ?? 0}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Overdue</dt><dd className={`text-2xl font-semibold tabular-nums ${w?.overdue_tasks ? "text-red-600 dark:text-red-400" : ""}`}>{w?.overdue_tasks ?? 0}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Done (30d)</dt><dd className="text-2xl font-semibold tabular-nums">{w?.completed_30d ?? 0}</dd></div>
        </dl>
      </div>
      {w && <p className="text-sm text-muted-foreground">Open estimate {fmtMinutes(w.open_estimate_minutes)} · logged in the last 30 days {fmtMinutes(w.logged_30d_minutes)}</p>}

      <section aria-labelledby="open-h">
        <h2 id="open-h" className="mb-2 text-sm font-semibold">Assigned tasks ({open.length})</h2>
        {open.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No open tasks visible to you.</p> : (
          <ul className="divide-y rounded-xl border bg-card">
            {open.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <PriorityIcon priority={t.priority} />
                <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                <Link href={orgPath(org.slug, `/t/${t.key}`)} className="min-w-0 flex-1 truncate font-medium hover:underline">{t.title}</Link>
                <span className="hidden text-xs text-muted-foreground sm:inline">{t.project.name}</span>
                <DueBadge due={t.due_date} overdue={!!t.due_date && t.due_date < today} />
                <StatusPill name={t.status.name} color={t.status.color} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {done.length > 0 && (
        <section aria-labelledby="done-h">
          <h2 id="done-h" className="mb-2 text-sm font-semibold">Recently completed</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {done.map((t) => (
              <li key={t.id} className="flex items-center gap-3 p-3 text-sm text-muted-foreground">
                <span className="font-mono text-xs">{t.key}</span>
                <Link href={orgPath(org.slug, `/t/${t.key}`)} className="min-w-0 flex-1 truncate line-through hover:underline">{t.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
