"use client";

import {
  closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GitBranch, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DueBadge, LabelChip, PriorityIcon, TypeIcon } from "@/components/app/task-chips";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTaskAction } from "@/features/tasks/actions";
import { PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL } from "@/lib/constants";
import { runAction } from "@/lib/hooks/use-run-action";
import { groupTasks, isDone, isTaskOverdue, positionBetween, type TaskGroup } from "@/lib/tasks/view-logic";
import { cn } from "@/lib/utils";
import type { TaskPriority, TaskRow, ViewConfig } from "@/types";
import { personName, useWorkspace } from "./context";

const PAGE = 40;

function CardContent({ task }: { task: TaskRow }) {
  const w = useWorkspace();
  const assignee = task.assignee_id ? w.people.get(task.assignee_id) : undefined;
  const done = isDone(task, w.viewCtx);
  return (
    <>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <TypeIcon type={task.type} className="size-3.5" />
        <span className="font-mono">{task.key}</span>
        <span className="ml-auto"><PriorityIcon priority={task.priority} className="size-3.5" /></span>
      </div>
      <button
        type="button"
        onClick={() => w.openTask(task.id)}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn("line-clamp-2 w-full cursor-pointer text-left font-medium leading-snug hover:underline", done && "text-muted-foreground line-through")}
      >
        {task.title}
      </button>
      {task.labels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((l) => <LabelChip key={l.id} label={l} />)}
          {task.labels.length > 3 && <span className="text-[11px] text-muted-foreground">+{task.labels.length - 3}</span>}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <DueBadge due={task.due_date} overdue={isTaskOverdue(task, w.viewCtx)} done={done} />
        {task.subtask_total > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Subtasks done">
            <GitBranch className="size-3" /> {task.subtask_done}/{task.subtask_total}
          </span>
        )}
        <span className="ml-auto">
          {assignee ? <UserAvatar name={assignee.full_name} email={assignee.email} src={assignee.avatar_url} className="size-5" /> : null}
        </span>
      </div>
    </>
  );
}

function TaskCard({ task }: { task: TaskRow }) {
  const w = useWorkspace();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !w.canEdit });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-label={`${task.key} ${task.title}`}
      className={cn(
        "group rounded-lg border bg-card p-2.5 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
        w.canEdit && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <CardContent task={task} />
    </div>
  );
}

function Column({
  group, canDrop, dragging, onAdd, wip,
}: {
  group: TaskGroup;
  canDrop: boolean;
  dragging: boolean;
  onAdd: (title: string) => Promise<boolean>;
  wip?: number | null;
}) {
  const w = useWorkspace();
  const { setNodeRef, isOver } = useDroppable({ id: group.id });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [shown, setShown] = useState(PAGE);
  const visible = group.tasks.slice(0, shown);
  const over = wip != null && group.tasks.length > wip;

  return (
    <section
      aria-label={`${group.label} column`}
      className={cn(
        "flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-muted/50 transition-opacity",
        dragging && !canDrop && "opacity-40",
        isOver && canDrop && "ring-2 ring-primary/60",
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2">
        {group.color && <span className="size-2.5 rounded-full" style={{ backgroundColor: group.color }} />}
        <h3 className="truncate text-sm font-semibold">{group.label}</h3>
        <span
          className={cn("rounded-full bg-background px-1.5 text-xs text-muted-foreground", over && "bg-red-100 font-semibold text-red-700 dark:bg-red-950 dark:text-red-300")}
          title={wip != null ? `Work-in-progress limit: ${wip}` : undefined}
        >
          {group.tasks.length}{wip != null ? ` / ${wip}` : ""}
        </span>
        {w.canEdit && (
          <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label={`Add task to ${group.label}`} onClick={() => setAdding(true)}>
            <Plus />
          </Button>
        )}
      </header>
      <div ref={setNodeRef} className="min-h-12 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        <SortableContext items={visible.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {visible.map((t) => <TaskCard key={t.id} task={t} />)}
        </SortableContext>
        {group.tasks.length > shown && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setShown((s) => s + PAGE)}>
            Show {Math.min(PAGE, group.tasks.length - shown)} more
          </Button>
        )}
        {adding && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!title.trim()) return;
              if (await onAdd(title.trim())) setTitle("");
            }}
          >
            <Input
              autoFocus
              aria-label={`New task title in ${group.label}`}
              placeholder="Task title, then Enter"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setAdding(false); setTitle(""); }
              }}
              onBlur={() => { if (!title.trim()) setAdding(false); }}
            />
          </form>
        )}
        {group.tasks.length === 0 && !adding && (
          <p className="px-1 py-3 text-center text-xs text-muted-foreground">{w.canEdit ? "Drop tasks here" : "No tasks"}</p>
        )}
      </div>
    </section>
  );
}

export function BoardView({ config }: { config: ViewConfig }) {
  const w = useWorkspace();
  const mode = (config.group === "assignee" || config.group === "priority" ? config.group : "status") as "status" | "assignee" | "priority";
  const manual = !config.sort && mode === "status";
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns = useMemo<TaskGroup[]>(() => {
    if (mode === "assignee") {
      const people = new Map(w.members.map((m) => [m.id, personName(m)]));
      const cols: TaskGroup[] = [{ id: "unassigned", label: "Unassigned", tasks: [] }, ...w.members.map((m) => ({ id: m.id, label: personName(m), tasks: [] as TaskRow[] }))];
      for (const t of w.tasks) (cols.find((c) => c.id === (t.assignee_id ?? "unassigned")) ?? cols[0]).tasks.push(t);
      void people;
      return cols.filter((c) => c.tasks.length || c.id === "unassigned");
    }
    return groupTasks(w.tasks, mode, {
      statuses: w.statuses, people: new Map(), labels: [],
      priorities: PRIORITIES.map((p) => ({ id: p, name: PRIORITY_LABEL[p], color: PRIORITY_COLOR[p] })),
    });
  }, [w.tasks, w.statuses, w.members, mode]);

  const activeTask = activeId ? w.allTasks.find((t) => t.id === activeId) : undefined;
  const targets = activeTask && mode === "status" ? w.allowedTargets(activeTask.status_id) : null;
  const colOf = (t: TaskRow) => (mode === "status" ? t.status_id : mode === "priority" ? t.priority : (t.assignee_id ?? "unassigned"));

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const task = w.allTasks.find((t) => t.id === active.id);
    if (!task) return;
    const overId = String(over.id);
    const overTask = columns.some((c) => c.id === overId) ? undefined : w.allTasks.find((t) => t.id === overId);
    const target = overTask ? colOf(overTask) : overId;
    if (!columns.some((c) => c.id === target)) return;

    if (mode === "status") {
      if (target !== task.status_id && targets && !targets.has(target)) {
        const from = w.statusById.get(task.status_id)?.name;
        const to = w.statusById.get(target)?.name;
        toast.error(`The workflow does not allow moving from “${from}” to “${to}”.`);
        return;
      }
      const col = columns.find((c) => c.id === target)!;
      const rest = col.tasks.filter((t) => t.id !== task.id);
      let idx = rest.length;
      if (overTask) {
        idx = rest.findIndex((t) => t.id === overTask.id);
        const from = col.tasks.findIndex((t) => t.id === task.id);
        const to = col.tasks.findIndex((t) => t.id === overTask.id);
        if (from !== -1 && from < to) idx += 1; // dragging downwards: land after the hovered card
      }
      if (!manual && target === task.status_id) return; // sorted view: nothing to persist within a column
      const pos = positionBetween(rest[idx - 1]?.position, rest[idx]?.position);
      if (target === task.status_id && idx === col.tasks.findIndex((t) => t.id === task.id)) return;
      await w.moveTask(task.id, target, pos);
    } else if (mode === "assignee") {
      const next = target === "unassigned" ? null : target;
      if (next !== task.assignee_id) await w.updateTask(task.id, { assigneeId: next });
    } else if (target !== task.priority) {
      await w.updateTask(task.id, { priority: target as TaskPriority });
    }
  }

  async function addTo(group: TaskGroup, title: string) {
    const r = await runAction(() =>
      createTaskAction({
        projectId: w.project.id,
        title,
        statusId: mode === "status" ? group.id : null,
        priority: mode === "priority" ? group.id : "medium",
        assigneeId: mode === "assignee" && group.id !== "unassigned" ? group.id : null,
      }),
    );
    if (r.ok) w.refresh();
    return r.ok;
  }

  if (w.allTasks.length === 0 && !w.canEdit) {
    return <p className="p-8 text-center text-sm text-muted-foreground">No tasks yet.</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="flex h-[calc(100dvh-15rem)] min-h-96 items-start gap-3 overflow-x-auto pb-3">
        {columns.map((g) => (
          <Column
            key={g.id}
            group={g}
            canDrop={targets ? g.id === activeTask?.status_id || targets.has(g.id) : true}
            dragging={!!activeId}
            onAdd={(t) => addTo(g, t)}
            wip={mode === "status" ? w.statusById.get(g.id)?.wip_limit : null}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="rotate-1 rounded-lg border bg-card p-2.5 text-sm shadow-lg">
            <CardContent task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
