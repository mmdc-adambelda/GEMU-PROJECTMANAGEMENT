"use client";

import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { isDone, isTaskOverdue } from "@/lib/tasks/view-logic";
import { toDay } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import type { TaskRow } from "@/types";
import { useWorkspace } from "./context";

type Mode = "month" | "week" | "day";

function Chip({ task, floating = false }: { task: TaskRow; floating?: boolean }) {
  const w = useWorkspace();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled: !w.canEdit || floating });
  const status = w.statusById.get(task.status_id);
  const overdue = isTaskOverdue(task, w.viewCtx);
  const done = isDone(task, w.viewCtx);
  return (
    <div ref={floating ? undefined : setNodeRef} {...(floating ? {} : { ...attributes, ...listeners })}
      className={cn("rounded border-l-4 bg-card px-1.5 py-0.5 text-xs shadow-xs", w.canEdit && "cursor-grab", isDragging && "opacity-40",
        overdue && "bg-red-50 dark:bg-red-950/40", done && "opacity-60")}
      style={{ borderLeftColor: overdue ? "#dc2626" : (status?.color ?? "#94a3b8") }}>
      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => w.openTask(task.id)}
        className={cn("block w-full truncate text-left", done && "line-through")} title={`${task.key} ${task.title}${overdue ? " (overdue)" : ""}`}>
        <span className="font-mono text-[10px] text-muted-foreground">{task.key}</span> {task.title}
      </button>
    </div>
  );
}

function Day({ date, tasks, muted, roomy }: { date: Date; tasks: TaskRow[]; muted?: boolean; roomy?: boolean }) {
  const id = `day:${toDay(date)}`;
  const { setNodeRef, isOver } = useDroppable({ id });
  const max = roomy ? 50 : 3;
  return (
    <div ref={setNodeRef} className={cn("min-h-24 border-b border-r p-1", muted && "bg-muted/30", isOver && "bg-primary/10", roomy && "min-h-64")}>
      <div className={cn("mb-1 flex size-6 items-center justify-center rounded-full text-xs", isToday(date) && "bg-primary font-semibold text-primary-foreground", muted && !isToday(date) && "text-muted-foreground")}>
        {format(date, "d")}
      </div>
      <div className="space-y-1">
        {tasks.slice(0, max).map((t) => <Chip key={t.id} task={t} />)}
        {tasks.length > max && <p className="px-1 text-[11px] text-muted-foreground">+{tasks.length - max} more</p>}
      </div>
    </div>
  );
}

export function CalendarView() {
  const w = useWorkspace();
  const [mode, setMode] = useState<Mode>("month");
  const [cursor, setCursor] = useState(new Date());
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byDay = useMemo(() => {
    const m = new Map<string, TaskRow[]>();
    for (const t of w.tasks) if (t.due_date) (m.get(t.due_date) ?? m.set(t.due_date, []).get(t.due_date)!).push(t);
    return m;
  }, [w.tasks]);
  const unscheduled = w.tasks.filter((t) => !t.due_date && !isDone(t, w.viewCtx));

  const days = useMemo(() => {
    if (mode === "day") return [cursor];
    if (mode === "week") return eachDayOfInterval({ start: startOfWeek(cursor), end: endOfWeek(cursor) });
    return eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor)), end: endOfWeek(endOfMonth(cursor)) });
  }, [mode, cursor]);

  const step = (dir: 1 | -1) => setCursor((c) => (mode === "month" ? addMonths(c, dir) : mode === "week" ? addWeeks(c, dir) : addDays(c, dir)));
  const title = mode === "day" ? format(cursor, "EEEE, MMM d, yyyy") : mode === "week" ? `Week of ${format(days[0], "MMM d, yyyy")}` : format(cursor, "MMMM yyyy");
  const active = activeId ? w.allTasks.find((t) => t.id === activeId) : undefined;

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const over = e.over?.id ? String(e.over.id) : "";
    if (!over.startsWith("day:")) return;
    const day = over.slice(4);
    const t = w.allTasks.find((x) => x.id === e.active.id);
    if (!t || t.due_date === day) return;
    // keep start <= due
    const startFix = t.start_date && t.start_date > day ? { startDate: day } : {};
    await w.updateTask(t.id, { dueDate: day, ...startFix });
  }

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon-sm" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft /></Button>
          <Button variant="outline" size="icon-sm" aria-label="Next" onClick={() => step(1)}><ChevronRight /></Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
          <h2 className="text-base font-semibold" aria-live="polite">{title}</h2>
          <div className="ml-auto inline-flex rounded-md border p-0.5" role="group" aria-label="Calendar mode">
            {(["month", "week", "day"] as Mode[]).map((m) => (
              <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}
                className={cn("rounded px-2.5 py-1 text-xs capitalize", mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{m}</button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <div className="min-w-0 flex-1 overflow-hidden rounded-lg border">
            {mode !== "day" && (
              <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
                {days.slice(0, 7).map((d) => <div key={d.toISOString()} className="py-1.5">{format(d, "EEE")}</div>)}
              </div>
            )}
            <div className={cn("grid", mode === "day" ? "grid-cols-1" : "grid-cols-7")}>
              {days.map((d) => (
                <Day key={d.toISOString()} date={d} tasks={byDay.get(toDay(d)) ?? []} muted={mode === "month" && !isSameMonth(d, cursor)} roomy={mode !== "month"} />
              ))}
            </div>
          </div>
          {unscheduled.length > 0 && (
            <aside className="hidden w-56 shrink-0 lg:block" aria-label="Unscheduled tasks">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unscheduled ({unscheduled.length})</h3>
              <div className="max-h-[32rem] space-y-1 overflow-y-auto">
                {unscheduled.slice(0, 60).map((t) => <Chip key={t.id} task={t} />)}
              </div>
              {w.canEdit && <p className="mt-2 text-[11px] text-muted-foreground">Drag a task onto a day to schedule it.</p>}
            </aside>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Showing tasks by due date. Overdue tasks are red; completed tasks are dimmed.</p>
      </div>
      <DragOverlay>{active ? <Chip task={active} floating /> : null}</DragOverlay>
    </DndContext>
  );
}
