import {
  Bug, CalendarDays, CheckSquare, ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, Equal, MessageSquare, TrendingUp, Zap, BookOpen,
  type LucideIcon,
} from "lucide-react";
import { fmtDate } from "@/lib/utils/dates";
import { PRIORITY_COLOR, PRIORITY_LABEL, TYPE_COLOR, TYPE_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Label, TaskPriority, TaskType } from "@/types";

const PRIORITY_ICON: Record<TaskPriority, LucideIcon> = {
  highest: ChevronsUp, high: ChevronUp, medium: Equal, low: ChevronDown, lowest: ChevronsDown,
};
const TYPE_ICON: Record<TaskType, LucideIcon> = {
  task: CheckSquare, bug: Bug, story: BookOpen, epic: Zap, improvement: TrendingUp, request: MessageSquare,
};

export function PriorityIcon({ priority, className }: { priority: TaskPriority; className?: string }) {
  const Icon = PRIORITY_ICON[priority];
  return (
    <span title={`${PRIORITY_LABEL[priority]} priority`} className="inline-flex">
      <Icon className={cn("size-4", className)} style={{ color: PRIORITY_COLOR[priority] }} aria-label={`${PRIORITY_LABEL[priority]} priority`} />
    </span>
  );
}

export function TypeIcon({ type, className }: { type: TaskType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return (
    <span title={TYPE_LABEL[type]} className="inline-flex">
      <Icon className={cn("size-4", className)} style={{ color: TYPE_COLOR[type] }} aria-label={TYPE_LABEL[type]} />
    </span>
  );
}

export function StatusPill({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-medium", className)}>
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function DueBadge({ due, overdue, done, className }: { due: string | null; overdue: boolean; done?: boolean; className?: string }) {
  if (!due) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        overdue ? "font-medium text-red-600 dark:text-red-400" : done ? "text-muted-foreground line-through" : "text-muted-foreground",
        className,
      )}
      title={overdue ? "Overdue" : "Due date"}
    >
      <CalendarDays className="size-3" aria-hidden />
      {fmtDate(due)}
      {overdue && <span className="sr-only">(overdue)</span>}
    </span>
  );
}

export function LabelChip({ label }: { label: Pick<Label, "name" | "color"> }) {
  return (
    <span
      className="inline-flex max-w-28 items-center truncate rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${label.color}22`, color: label.color }}
    >
      {label.name}
    </span>
  );
}
