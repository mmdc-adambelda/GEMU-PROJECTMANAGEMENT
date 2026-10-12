"use client";

import { AtSign, Bell, CheckCheck, Clock, GitPullRequestArrow, MessageSquare, Trash2, UserPlus, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { orgPath } from "@/components/app/shell/shell-context";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { deleteNotificationAction, markAllNotificationsReadAction, markNotificationReadAction } from "@/features/notifications/actions";
import { runAction } from "@/lib/hooks/use-run-action";
import { timeAgo } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import type { Notification, NotificationType } from "@/types";

type Row = Notification & {
  actor: { full_name: string; email: string; avatar_url: string | null } | null;
  task: { key: string } | null;
  project: { key: string } | null;
};

const ICON: Record<NotificationType, typeof Bell> = {
  assigned: UserRoundCheck, reassigned: UserRoundCheck, mention: AtSign, comment: MessageSquare,
  due_soon: Clock, overdue: Clock, invitation: UserPlus, status_change: GitPullRequestArrow,
};

export function InboxList({ orgId, orgSlug, items }: { orgId: string; orgSlug: string; items: Row[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | "unread">("unread");
  const [rows, setRows] = useState(items);
  const [prevItems, setPrevItems] = useState(items);
  if (prevItems !== items) { setPrevItems(items); setRows(items); }

  const unread = rows.filter((r) => !r.read_at).length;
  const shown = tab === "unread" ? rows.filter((r) => !r.read_at) : rows;

  const href = (n: Row) =>
    n.task ? orgPath(orgSlug, `/t/${n.task.key}`) : n.project ? orgPath(orgSlug, `/p/${n.project.key}`) : orgPath(orgSlug);

  async function markRead(n: Row) {
    if (n.read_at) return;
    setRows((r) => r.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    await markNotificationReadAction(n.id);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
        <div className="inline-flex rounded-md border p-0.5 text-sm" role="tablist" aria-label="Filter notifications">
          {(["unread", "all"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={cn("rounded px-3 py-1 capitalize", tab === t ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {t}{t === "unread" && unread > 0 ? ` (${unread})` : ""}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" disabled={unread === 0}
            onClick={async () => { const r = await runAction(() => markAllNotificationsReadAction(orgId)); if (r.ok) { setRows((x) => x.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))); router.refresh(); } }}>
            <CheckCheck /> Mark all as read
          </Button>
          <Button variant="ghost" size="sm" render={<Link href="/account#notifications" />}>Preferences</Button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Bell className="mx-auto mb-2 size-8 text-muted-foreground" />
          <p className="font-medium">{tab === "unread" ? "You are all caught up" : "No notifications yet"}</p>
          <p className="text-sm text-muted-foreground">Assignments, mentions, comments on tasks you watch and deadlines will show up here.</p>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {shown.map((n) => {
            const Icon = ICON[n.type] ?? Bell;
            return (
              <li key={n.id} className={cn("flex items-start gap-3 p-3", !n.read_at && "bg-primary/5")}>
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted"><Icon className="size-4" /></span>
                <Link href={href(n)} onClick={() => void markRead(n)} className="min-w-0 flex-1">
                  <p className={cn("text-sm", !n.read_at && "font-medium")}>{n.title}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {n.actor && <><UserAvatar name={n.actor.full_name} email={n.actor.email} src={n.actor.avatar_url} className="size-4" />{n.actor.full_name || n.actor.email} ·</>}
                    {timeAgo(n.created_at)}
                  </p>
                </Link>
                {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                <Button variant="ghost" size="icon-xs" aria-label="Delete notification"
                  onClick={async () => { setRows((r) => r.filter((x) => x.id !== n.id)); await runAction(() => deleteNotificationAction(n.id), false); router.refresh(); }}>
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
