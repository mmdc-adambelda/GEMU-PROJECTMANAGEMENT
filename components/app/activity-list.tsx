import { UserAvatar } from "@/components/app/user-avatar";
import { ACTIVITY_LABEL } from "@/lib/constants";
import { fmtDateTime, timeAgo } from "@/lib/utils/dates";
import type { ActivityEntry } from "@/types";

interface Person { full_name: string; email: string; avatar_url: string | null }

function detail(a: ActivityEntry): string | null {
  const d = a.details as Record<string, unknown>;
  const show = (v: unknown) => (v === null || v === undefined || v === "" ? "none" : String(v));
  switch (a.action) {
    case "task.status_changed":
    case "task.priority_changed":
    case "task.type_changed":
    case "task.assignee_changed":
    case "task.due_date_changed":
    case "task.start_date_changed":
    case "task.title_changed":
      return `${show(d.from)} → ${show(d.to)}`;
    case "task.estimate_changed":
      return `${show(d.from)} → ${show(d.to)} min`;
    case "task.created":
      return typeof d.key === "string" ? `${d.key}: ${d.title}` : null;
    case "task.attachment_added":
      return typeof d.file_name === "string" ? d.file_name : null;
    case "task.moved":
    case "task.moved_out":
      return `${show(d.from_key)} → ${show(d.to_key)}`;
    case "project.created":
      return typeof d.key === "string" ? `${d.key} · ${d.name}` : null;
    case "member.invited":
      return `${show(d.email)} as ${show(d.role)}`;
    default:
      return null;
  }
}

/** Chronological activity feed. `entries` come from the DB trigger-written activity_log (no secrets are stored there). */
export function ActivityList({ entries, people, emptyText = "No activity yet." }: {
  entries: ActivityEntry[];
  people: Map<string, Person>;
  emptyText?: string;
}) {
  if (entries.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ol className="space-y-3">
      {entries.map((a) => {
        const actor = a.actor_id ? people.get(a.actor_id) : undefined;
        const det = detail(a);
        return (
          <li key={a.id} className="flex gap-3">
            <UserAvatar name={actor?.full_name} email={actor?.email} src={actor?.avatar_url} className="mt-0.5 size-6" />
            <div className="min-w-0 text-sm">
              <p>
                <span className="font-medium">{actor?.full_name || actor?.email || "System"}</span>{" "}
                <span className="text-muted-foreground">{ACTIVITY_LABEL[a.action] ?? a.action.replace(/[._]/g, " ")}</span>
              </p>
              {det && <p className="truncate text-xs text-muted-foreground">{det}</p>}
              <time dateTime={a.created_at} title={fmtDateTime(a.created_at)} className="text-xs text-muted-foreground">
                {timeAgo(a.created_at)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
