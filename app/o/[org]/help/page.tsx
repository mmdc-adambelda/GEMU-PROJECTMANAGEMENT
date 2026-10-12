import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/permissions";
import type { OrgRole } from "@/types";

export const metadata: Metadata = { title: "Help & docs" };

const section = "space-y-2 rounded-xl border bg-card p-5";

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Help & documentation</h1>
        <p className="text-sm text-muted-foreground">How {brand.name} is organised and how to get the most from it. Questions? {brand.supportEmail}</p>
      </div>

      <section className={section}>
        <h2 className="font-semibold">Structure</h2>
        <p className="text-sm text-muted-foreground">Organization → Workspaces → Spaces → Projects → Tasks & subtasks.</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li><strong>Workspace</strong>: a group of spaces (department, client). Can be private.</li>
          <li><strong>Space</strong>: a major area of work. Owns the workflow (statuses), custom fields and automations used by its projects.</li>
          <li><strong>Project</strong>: has a unique key (e.g. DEV). Tasks get ids like DEV-1, DEV-2.</li>
        </ul>
      </section>

      <section className={section}>
        <h2 className="font-semibold">Roles</h2>
        <dl className="space-y-1.5 text-sm">
          {(["owner", "admin", "member", "guest"] as OrgRole[]).map((r) => (
            <div key={r}><dt className="inline font-medium">{ROLE_LABEL[r]}: </dt><dd className="inline text-muted-foreground">{ROLE_DESCRIPTION[r]}</dd></div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">Project roles (lead, member, viewer) and space roles (admin, member, viewer) refine access for specific resources. All permissions are enforced by the database.</p>
      </section>

      <section className={section}>
        <h2 className="font-semibold">Working with tasks</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li><strong>Board</strong>: drag cards between columns. If the workflow forbids a move, the card snaps back and the reason is shown.</li>
          <li><strong>List</strong>: click a title to open it, edit status / priority / assignee / due date inline, select rows for bulk actions, group and sort from the toolbar.</li>
          <li><strong>Calendar</strong>: drag a task to another day to change its due date. <strong>Timeline</strong>: drag bars or their edges to change start and due dates.</li>
          <li>Use <kbd className="rounded border px-1">Ctrl</kbd>+<kbd className="rounded border px-1">K</kbd> to search tasks, projects, spaces and people.</li>
          <li>Mention teammates in comments with <code>@</code>; they get a notification if they can see the task.</li>
          <li>Saved views remember your filters, sorting, grouping and columns (Views menu in the toolbar).</li>
        </ul>
      </section>

      <section className={section}>
        <h2 className="font-semibold">Workflows & automations</h2>
        <p className="text-sm text-muted-foreground">
          Open a space → Workflow to rename, recolor, reorder or add statuses, set the default, define allowed transitions and required fields.
          A status that still has tasks can only be deleted by moving those tasks to another status. Automations (space → Automations) react to task events
          without code; overdue rules are evaluated by a scheduled job every 15 minutes.
        </p>
      </section>

      <section className={section}>
        <h2 className="font-semibold">How progress is calculated</h2>
        <p className="text-sm text-muted-foreground">
          Project progress = tasks (including subtasks) in a status of category <em>Done</em> ÷ all non-archived tasks. Overdue = not Done and due before today.
          Reports and dashboards show their definition under each widget.
        </p>
      </section>
    </div>
  );
}
