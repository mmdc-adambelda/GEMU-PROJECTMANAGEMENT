"use client";

import { AlertTriangle, CalendarDays, GanttChartSquare, KanbanSquare, LayoutDashboard, List, Settings2, Activity } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ActivityList } from "@/components/app/activity-list";
import { IconTile } from "@/components/app/icon";
import { orgPath } from "@/components/app/shell/shell-context";
import { UserAvatar } from "@/components/app/user-avatar";
import { updatePreferencesAction } from "@/features/account/actions";
import { moveTaskAction, updateTaskAction } from "@/features/tasks/actions";
import { CreateTaskDialog } from "@/features/tasks/create-task-dialog";
import { TaskDrawer } from "@/features/tasks/detail/task-drawer";
import { PROJECT_STATUS_LABEL } from "@/lib/constants";
import type { MemberLite, ProjectData } from "@/lib/data/project";
import { TASK_LIMIT } from "@/lib/limits";
import { applyFilters, sortTasks, type ViewCtx } from "@/lib/tasks/view-logic";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { OrgRole, Project, ProjectView, SavedView, TaskRow, ViewConfig } from "@/types";
import { BoardView } from "./board-view";
import { CalendarView } from "./calendar-view";
import { WorkspaceProvider, personName, type TaskPatch, type WorkspaceCtx } from "./context";
import { ListView } from "./list-view";
import { OverviewView } from "./overview-view";
import { SettingsView } from "./settings-view";
import { TimelineView } from "./timeline-view";
import { Toolbar } from "./toolbar";

export type ViewId = "overview" | ProjectView | "activity" | "settings";

const TABS: Array<{ id: ViewId; label: string; icon: typeof List }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "list", label: "List", icon: List },
  { id: "board", label: "Board", icon: KanbanSquare },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "timeline", label: "Timeline", icon: GanttChartSquare },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings2 },
];
const WORK_VIEWS: ViewId[] = ["list", "board", "calendar", "timeline"];

const patchToRow = (p: TaskPatch): Partial<TaskRow> => ({
  ...(p.title !== undefined && { title: p.title }),
  ...(p.statusId !== undefined && { status_id: p.statusId }),
  ...(p.priority !== undefined && { priority: p.priority }),
  ...(p.type !== undefined && { type: p.type }),
  ...(p.assigneeId !== undefined && { assignee_id: p.assigneeId }),
  ...(p.startDate !== undefined && { start_date: p.startDate }),
  ...(p.dueDate !== undefined && { due_date: p.dueDate }),
  ...(p.estimateMinutes !== undefined && { estimate_minutes: p.estimateMinutes }),
});

interface Props {
  orgId: string;
  orgSlug: string;
  orgRole: OrgRole;
  userId: string;
  project: Project;
  data: ProjectData;
  members: MemberLite[];
  access: { can_edit: boolean; can_manage: boolean };
  savedViews: SavedView[];
  initialView: ViewId;
  initialTask: string | null;
  preferredView: ProjectView;
  /** today (YYYY-MM-DD) in the viewer timezone, computed on the server so SSR and client agree */
  today: string;
}

export function ProjectWorkspace(props: Props) {
  const { data, project, members, access } = props;
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [view, setView] = useState<ViewId>(props.initialView);
  const [tasks, setTasks] = useState<TaskRow[]>(data.tasks);
  const [config, setConfig] = useState<ViewConfig>({});
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [openId, setOpenId] = useState<string | null>(props.initialTask);
  const [createOpen, setCreateOpen] = useState(false);
  const today = props.today;

  // server data is the source of truth: re-sync whenever a refresh brings new props
  const [syncedFrom, setSyncedFrom] = useState(data.tasks);
  if (syncedFrom !== data.tasks) {
    setSyncedFrom(data.tasks);
    setTasks(data.tasks);
  }

  const statusById = useMemo(() => new Map(data.statuses.map((s) => [s.id, s])), [data.statuses]);
  const people = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const viewCtx = useMemo<ViewCtx>(
    () => ({ userId: props.userId, today, categoryOf: (id) => statusById.get(id)?.category }),
    [props.userId, today, statusById],
  );

  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  // Live updates: other people's changes show up without a manual reload (Realtime respects RLS).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`project:${project.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${project.id}` }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(refresh, 600);
      })
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(ch);
    };
  }, [project.id, refresh]);

  const allowedTargets = useCallback(
    (fromId: string) => {
      const out = data.transitions.filter((t) => t.from_status_id === fromId);
      // no rules defined for a status = any transition is allowed
      return out.length === 0 ? new Set(data.statuses.map((s) => s.id)) : new Set([fromId, ...out.map((t) => t.to_status_id)]);
    },
    [data.transitions, data.statuses],
  );

  /** Optimistic edit: apply locally, persist, and roll back with the database's reason if it is rejected. */
  const updateTask = useCallback(
    async (id: string, patch: TaskPatch) => {
      const before = tasks.find((t) => t.id === id);
      if (!before) return false;
      const rowPatch = patchToRow(patch);
      const revert = Object.fromEntries(Object.keys(rowPatch).map((k) => [k, before[k as keyof TaskRow]])) as Partial<TaskRow>;
      setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...rowPatch } : t)));
      const r = await updateTaskAction(id, patch);
      if (!r.ok) {
        setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...revert } : t)));
        toast.error(r.error);
        return false;
      }
      refresh();
      return true;
    },
    [tasks, refresh],
  );

  const moveTask = useCallback(
    async (id: string, statusId: string, position: number) => {
      const before = tasks.find((t) => t.id === id);
      if (!before) return false;
      const prev = { status_id: before.status_id, position: before.position };
      setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status_id: statusId, position } : t)));
      const r = await moveTaskAction(id, statusId, position);
      if (!r.ok) {
        setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...prev } : t)));
        toast.error(r.error);
        return false;
      }
      refresh();
      return true;
    },
    [tasks, refresh],
  );

  // filtered + sorted tasks shown in the work views
  const visible = useMemo(() => {
    const pool = showSubtasks ? tasks : tasks.filter((t) => !t.parent_id);
    return sortTasks(applyFilters(pool, config.filters, viewCtx), config.sort);
  }, [tasks, showSubtasks, config.filters, config.sort, viewCtx]);

  const taskKeyOf = (id: string | null) => (id ? tasks.find((t) => t.id === id)?.key : undefined);

  function changeView(v: ViewId) {
    setView(v);
    const url = new URL(window.location.href);
    url.searchParams.set("view", v);
    window.history.replaceState(null, "", url);
    if (WORK_VIEWS.includes(v)) void updatePreferencesAction({ projectView: v as ProjectView });
  }

  function open(id: string | null, key?: string) {
    setOpenId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("task", key ?? taskKeyOf(id) ?? id);
    else url.searchParams.delete("task");
    window.history.replaceState(null, "", url);
  }

  const ctx: WorkspaceCtx = {
    orgId: props.orgId, orgSlug: props.orgSlug, orgRole: props.orgRole, userId: props.userId, project,
    statuses: data.statuses, transitions: data.transitions, members, labels: data.labels, fields: data.fields,
    customValues: data.customValues as Record<string, Record<string, unknown>>,
    canEdit: access.can_edit, canManage: access.can_manage, viewCtx, people, statusById,
    allTasks: tasks, tasks: visible, dependencies: data.dependencies,
    updateTask, moveTask, openTask: (id) => open(id), allowedTargets, refresh,
  };

  const detailEnv = {
    orgId: props.orgId, orgSlug: props.orgSlug, userId: props.userId, project,
    statuses: data.statuses, transitions: data.transitions, members, labels: data.labels, fields: data.fields,
    canEdit: access.can_edit, canManage: access.can_manage,
  };

  const lead = project.lead_id ? people.get(project.lead_id) : undefined;
  const stats = data.stats;
  const isWork = WORK_VIEWS.includes(view);

  return (
    <WorkspaceProvider value={ctx}>
      <div className="px-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <IconTile name={project.icon} color={project.color} className="size-9" />
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate text-xl font-semibold tracking-tight">
              {project.name}
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-normal text-muted-foreground">{project.key}</span>
              {project.archived_at && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">Archived</span>}
            </h1>
            <p className="text-sm text-muted-foreground">
              {PROJECT_STATUS_LABEL[project.status]}
              {stats ? ` · ${stats.progress_pct}% complete (${stats.done_tasks}/${stats.total_tasks} tasks)` : ""}
            </p>
          </div>
          {lead && (
            <div className="ml-auto hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
              Lead <UserAvatar name={lead.full_name} email={lead.email} src={lead.avatar_url} /> <span className="text-foreground">{personName(lead)}</span>
            </div>
          )}
        </div>

        <nav aria-label="Project views" className="mt-4 flex gap-1 overflow-x-auto border-b">
          {TABS.filter((t) => t.id !== "settings" || true).map((t) => (
            <button
              key={t.id}
              onClick={() => changeView(t.id)}
              aria-current={view === t.id ? "page" : undefined}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                view === t.id && "border-primary font-medium text-foreground",
              )}
            >
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        {data.truncated && isWork && (
          <p role="status" className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="size-4 shrink-0" /> Only the first {TASK_LIMIT.toLocaleString()} tasks are loaded. Archive finished work to see the rest.
          </p>
        )}

        {isWork && (
          <Toolbar
            view={view}
            config={config}
            onConfig={setConfig}
            groupOptions={
              view === "board"
                ? [{ value: "status", label: "Group: Status" }, { value: "assignee", label: "Group: Assignee" }, { value: "priority", label: "Group: Priority" }]
                : view === "list"
                  ? [{ value: "none", label: "No grouping" }, { value: "status", label: "Group: Status" }, { value: "assignee", label: "Group: Assignee" }, { value: "priority", label: "Group: Priority" }, { value: "label", label: "Group: Label" }]
                  : null
            }
            showSubtasks={showSubtasks}
            onShowSubtasks={setShowSubtasks}
            savedViews={props.savedViews}
            onApplyView={(v) => {
              setConfig({ filters: v.config.filters, sort: v.config.sort, group: v.config.group, columns: v.config.columns });
              if (v.config.view) changeView(v.config.view);
            }}
            onCreateTask={() => setCreateOpen(true)}
          />
        )}

        {view === "overview" && <OverviewView activity={data.activity} />}
        {view === "list" && (tasks.length === 0 ? <EmptyTasks canEdit={access.can_edit} onCreate={() => setCreateOpen(true)} /> : <ListView config={config} onConfig={setConfig} />)}
        {view === "board" && (tasks.length === 0 && !access.can_edit ? <EmptyTasks canEdit={false} onCreate={() => {}} /> : <BoardView config={config} />)}
        {view === "calendar" && <CalendarView />}
        {view === "timeline" && <TimelineView />}
        {view === "activity" && (
          <div className="max-w-2xl">
            <ActivityList entries={data.activity} people={people} />
            {data.activity.length >= 100 && <p className="mt-3 text-xs text-muted-foreground">Showing the 100 most recent events.</p>}
          </div>
        )}
        {view === "settings" && <SettingsView projectMembers={data.projectMembers} />}
      </div>

      <TaskDrawer
        taskId={openId}
        taskKey={taskKeyOf(openId)}
        env={detailEnv}
        onClose={() => open(null)}
        onChanged={refresh}
        onNavigate={(id, key) => open(id, key)}
      />
      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultProjectId={project.id}
        members={members.map((m) => ({ id: m.id, name: personName(m) }))}
      />
      <Link href={orgPath(props.orgSlug, "/spaces")} className="sr-only">Back to spaces</Link>
    </WorkspaceProvider>
  );
}

function EmptyTasks({ canEdit, onCreate }: { canEdit: boolean; onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center">
      <p className="text-base font-medium">No tasks yet</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {canEdit ? "Create the first task to start planning this project." : "Nothing has been added to this project yet."}
      </p>
      {canEdit && <button onClick={onCreate} className="mt-4 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">Create task</button>}
    </div>
  );
}
