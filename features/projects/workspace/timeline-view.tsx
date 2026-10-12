"use client";

import { addDays, differenceInCalendarDays, format, isWeekend } from "date-fns";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { isDone, isTaskOverdue } from "@/lib/tasks/view-logic";
import { parseDay, toDay } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import type { TaskRow } from "@/types";
import { useWorkspace } from "./context";

const ROW = 34;
const LABEL_W = 220;
const ZOOMS = { day: 36, week: 18, month: 7 } as const;
type Zoom = keyof typeof ZOOMS;

interface Bar { task: TaskRow; start: Date; end: Date; milestone: boolean }

/** Hand-rolled Gantt: bars are positioned from real start/due dates and can be dragged / resized by the day. */
export function TimelineView() {
  const w = useWorkspace();
  const [zoom, setZoom] = useState<Zoom>("week");
  const dayW = ZOOMS[zoom];
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; kind: "move" | "start" | "end"; originX: number; delta: number } | null>(null);

  const bars = useMemo<Bar[]>(() => {
    const out: Bar[] = [];
    for (const t of w.tasks) {
      const due = parseDay(t.due_date);
      const start = parseDay(t.start_date);
      if (!due && !start) continue;
      const s = start ?? due!;
      const e = due ?? start!;
      out.push({ task: t, start: s <= e ? s : e, end: s <= e ? e : s, milestone: !start || (due && start && toDay(start) === toDay(due)) || false });
    }
    return out.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [w.tasks]);
  const unscheduled = w.tasks.length - bars.length;

  const today = new Date();
  const range = useMemo(() => {
    const starts = bars.map((b) => b.start.getTime());
    const ends = bars.map((b) => b.end.getTime());
    const min = new Date(Math.min(...starts, today.getTime()));
    const max = new Date(Math.max(...ends, today.getTime()));
    const from = addDays(min, -7);
    const to = addDays(max, 14);
    return { from, days: Math.max(differenceInCalendarDays(to, from), 30) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars]);

  const x = (d: Date) => differenceInCalendarDays(d, range.from) * dayW;
  const width = range.days * dayW;
  const rowOf = new Map(bars.map((b, i) => [b.task.id, i]));

  function onPointerDown(e: React.PointerEvent, id: string, kind: "move" | "start" | "end") {
    if (!w.canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, kind, originX: e.clientX, delta: 0 });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    setDrag({ ...drag, delta: Math.round((e.clientX - drag.originX) / dayW) });
  }
  async function onPointerUp() {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.delta === 0) return;
    const b = bars.find((x) => x.task.id === d.id);
    if (!b) return;
    const start = d.kind === "end" ? b.start : addDays(b.start, d.delta);
    const end = d.kind === "start" ? b.end : addDays(b.end, d.delta);
    if (end < start) return; // cannot resize past the other edge
    await w.updateTask(d.id, { startDate: toDay(start), dueDate: toDay(end) });
  }

  const shown = (b: Bar) => {
    if (!drag || drag.id !== b.task.id) return { start: b.start, end: b.end };
    return {
      start: drag.kind === "end" ? b.start : addDays(b.start, drag.delta),
      end: drag.kind === "start" ? b.end : addDays(b.end, drag.delta),
    };
  };

  // header cells
  const dayCells = Array.from({ length: range.days }, (_, i) => addDays(range.from, i));
  const months: Array<{ label: string; left: number; w: number }> = [];
  dayCells.forEach((d, i) => {
    const label = format(d, "MMM yyyy");
    const last = months[months.length - 1];
    if (last?.label === label) last.w += dayW;
    else months.push({ label, left: i * dayW, w: dayW });
  });

  if (bars.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="font-medium">Nothing to plot yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Give tasks a start and due date and they will appear here as bars. {w.tasks.length > 0 && `${w.tasks.length} tasks have no dates.`}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Zoom">
          {(Object.keys(ZOOMS) as Zoom[]).map((z) => (
            <button key={z} aria-pressed={zoom === z} onClick={() => setZoom(z)}
              className={cn("rounded px-2.5 py-1 text-xs capitalize", zoom === z ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{z}</button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => scroller.current?.scrollTo({ left: Math.max(x(today) - 200, 0), behavior: "smooth" })}>Today</Button>
        {unscheduled > 0 && <span className="text-xs text-muted-foreground">{unscheduled} task{unscheduled === 1 ? "" : "s"} without dates are not shown.</span>}
        <span className="ml-auto hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-primary" /> Task</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rotate-45 bg-amber-500" /> Milestone / single day</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-red-500" /> Overdue</span>
        </span>
      </div>

      <div className="flex overflow-hidden rounded-lg border">
        <div className="shrink-0 border-r bg-background" style={{ width: LABEL_W }}>
          <div className="h-14 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">Task</div>
          {bars.map((b) => (
            <div key={b.task.id} className="flex items-center gap-2 truncate border-b px-3 text-sm" style={{ height: ROW }}>
              <span className="font-mono text-[10px] text-muted-foreground">{b.task.key}</span>
              <button type="button" className="truncate text-left hover:underline" onClick={() => w.openTask(b.task.id)}>{b.task.title}</button>
            </div>
          ))}
        </div>
        <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <div className="relative" style={{ width, height: 56 + bars.length * ROW }}>
            <div className="sticky top-0 z-10 h-14 border-b bg-muted/40">
              {months.map((m) => (
                <div key={m.label + m.left} className="absolute top-0 h-7 truncate border-r px-2 py-1 text-xs font-medium" style={{ left: m.left, width: m.w }}>{m.label}</div>
              ))}
              {dayCells.map((d, i) => (
                (zoom === "day" || d.getDay() === 1 || (zoom === "month" && d.getDate() === 1)) ? (
                  <div key={i} className="absolute top-7 h-7 border-l px-1 py-1 text-[10px] text-muted-foreground" style={{ left: i * dayW }}>
                    {zoom === "day" ? format(d, "EEEEE d") : format(d, "d")}
                  </div>
                ) : null
              ))}
            </div>
            {/* weekend shading + today line */}
            {zoom !== "month" && dayCells.map((d, i) => isWeekend(d) ? (
              <div key={`w${i}`} className="absolute bottom-0 top-14 bg-muted/40" style={{ left: i * dayW, width: dayW }} />
            ) : null)}
            <div className="absolute bottom-0 top-0 z-10 w-px bg-primary" style={{ left: x(today) + dayW / 2 }} title="Today" />

            {/* dependency arrows */}
            <svg className="pointer-events-none absolute left-0 top-14" width={width} height={bars.length * ROW} aria-hidden>
              <defs>
                <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0 0 L8 4 L0 8 z" className="fill-muted-foreground" />
                </marker>
              </defs>
              {w.dependencies.map(([taskId, blockerId]) => {
                const a = rowOf.get(blockerId), b = rowOf.get(taskId);
                if (a === undefined || b === undefined) return null;
                const from = shown(bars[a]), to = shown(bars[b]);
                const x1 = x(from.end) + dayW, y1 = a * ROW + ROW / 2;
                const x2 = x(to.start), y2 = b * ROW + ROW / 2;
                const mid = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 12));
                return (
                  <path key={`${taskId}-${blockerId}`} d={`M${x1} ${y1} H${mid} V${y2} H${x2 - 2}`} fill="none" strokeWidth={1.5}
                    className="stroke-muted-foreground" markerEnd="url(#arrow)" />
                );
              })}
            </svg>

            {bars.map((b, i) => {
              const s = shown(b);
              const left = x(s.start);
              const wd = Math.max((differenceInCalendarDays(s.end, s.start) + 1) * dayW, dayW);
              const overdue = isTaskOverdue(b.task, w.viewCtx);
              const done = isDone(b.task, w.viewCtx);
              const status = w.statusById.get(b.task.status_id);
              const top = 56 + i * ROW + 6;
              return (
                <div key={b.task.id} className="absolute" style={{ left, top, width: wd, height: ROW - 12 }}>
                  {b.milestone && wd <= dayW * 1.5 ? (
                    <button type="button" onClick={() => w.openTask(b.task.id)} title={`${b.task.key} ${b.task.title}`}
                      onPointerDown={(e) => onPointerDown(e, b.task.id, "move")}
                      className={cn("mx-auto block size-4 rotate-45 touch-none", overdue ? "bg-red-500" : done ? "bg-emerald-500" : "bg-amber-500", w.canEdit && "cursor-grab")}
                      style={{ marginTop: 3 }} aria-label={`${b.task.key} milestone`} />
                  ) : (
                    <div
                      onPointerDown={(e) => onPointerDown(e, b.task.id, "move")}
                      onDoubleClick={() => w.openTask(b.task.id)}
                      title={`${b.task.key} · ${status?.name ?? ""} · ${format(s.start, "MMM d")} – ${format(s.end, "MMM d")}`}
                      className={cn("group relative h-full touch-none overflow-hidden rounded-md text-[11px] font-medium leading-[20px] text-white", w.canEdit && "cursor-grab",
                        overdue ? "bg-red-500" : done ? "bg-emerald-500" : "bg-primary")}
                    >
                      {w.canEdit && <span onPointerDown={(e) => onPointerDown(e, b.task.id, "start")} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-black/20 opacity-0 group-hover:opacity-100" aria-hidden />}
                      <span className="block truncate px-2.5">{b.task.title}</span>
                      {w.canEdit && <span onPointerDown={(e) => onPointerDown(e, b.task.id, "end")} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-black/20 opacity-0 group-hover:opacity-100" aria-hidden />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {w.canEdit ? "Drag a bar to reschedule it, or drag its edges to change the start / due date. Double-click to open." : "You have read-only access to this project."}
        {" "}Arrows point from a blocking task to the task it blocks.
      </p>
    </div>
  );
}
