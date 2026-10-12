"use client";

import { Bookmark, ChevronDown, Filter, Plus, Search, Trash2, X } from "lucide-react";
import { useState } from "react";
import { SimpleSelect, type Option } from "@/components/app/simple-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createSavedViewAction, deleteSavedViewAction } from "@/features/views/actions";
import { PRIORITIES, PRIORITY_LABEL, TASK_TYPES, TYPE_LABEL } from "@/lib/constants";
import { runAction } from "@/lib/hooks/use-run-action";
import { countActiveFilters } from "@/lib/tasks/view-logic";
import { cn } from "@/lib/utils";
import type { SavedView, TaskFilters, ViewConfig } from "@/types";
import { personName, useWorkspace } from "./context";

function Facet({
  label, options, selected, onChange,
}: { label: string; options: Array<{ value: string; label: string }>; selected: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</legend>
      <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
        {options.map((o) => {
          const checked = selected.includes(o.value);
          return (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
              <Checkbox
                checked={checked}
                onCheckedChange={(c) => onChange(c ? [...selected, o.value] : selected.filter((x) => x !== o.value))}
              />
              <span className="truncate">{o.label}</span>
            </label>
          );
        })}
        {options.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
      </div>
    </fieldset>
  );
}

const QUICK: Array<{ id: NonNullable<TaskFilters["quick"]>; label: string }> = [
  { id: "mine", label: "Assigned to me" },
  { id: "created", label: "Created by me" },
  { id: "unassigned", label: "Unassigned" },
  { id: "recent", label: "Recently updated" },
];

export const SORT_OPTIONS: Option<string>[] = [
  { value: "manual", label: "Manual order" },
  { value: "due_date:asc", label: "Due date (soonest)" },
  { value: "due_date:desc", label: "Due date (latest)" },
  { value: "priority:desc", label: "Priority (highest)" },
  { value: "priority:asc", label: "Priority (lowest)" },
  { value: "created_at:desc", label: "Newest" },
  { value: "updated_at:desc", label: "Recently updated" },
  { value: "title:asc", label: "Title A–Z" },
];

export function Toolbar({
  config, onConfig, groupOptions, showSubtasks, onShowSubtasks, savedViews, onApplyView, onCreateTask, view,
}: {
  config: ViewConfig;
  onConfig: (c: ViewConfig) => void;
  groupOptions: Option<string>[] | null;
  showSubtasks: boolean;
  onShowSubtasks: (v: boolean) => void;
  savedViews: SavedView[];
  onApplyView: (v: SavedView) => void;
  onCreateTask: () => void;
  view: string;
}) {
  const w = useWorkspace();
  const f = config.filters ?? {};
  const set = (patch: Partial<TaskFilters>) => onConfig({ ...config, filters: { ...f, ...patch } });
  const active = countActiveFilters({ ...f, q: undefined, quick: undefined, due: undefined });
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [shared, setShared] = useState(false);
  const [views, setViews] = useState(savedViews);

  const sortValue = config.sort ? `${config.sort.field}:${config.sort.dir}` : "manual";

  async function saveView() {
    const r = await runAction(() =>
      createSavedViewAction({ orgId: w.orgId, projectId: w.project.id, name: viewName, isShared: shared, config: { ...config, view } }),
    );
    if (r.ok) {
      setViews((v) => [...v, r.data as SavedView]);
      setSaveOpen(false);
      setViewName("");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Filter tasks"
          placeholder="Filter tasks…"
          className="pl-8"
          value={f.q ?? ""}
          onChange={(e) => set({ q: e.target.value })}
        />
      </div>

      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" />}>
          <Filter /> Filters
          {active > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{active}</span>}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(36rem,92vw)]">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Facet label="Status" selected={f.status ?? []} onChange={(v) => set({ status: v })}
              options={w.statuses.map((s) => ({ value: s.id, label: s.name }))} />
            <Facet label="Assignee" selected={f.assignee ?? []} onChange={(v) => set({ assignee: v })}
              options={[{ value: "unassigned", label: "Unassigned" }, ...w.members.map((m) => ({ value: m.id, label: personName(m) }))]} />
            <Facet label="Reporter" selected={f.reporter ?? []} onChange={(v) => set({ reporter: v })}
              options={w.members.map((m) => ({ value: m.id, label: personName(m) }))} />
            <Facet label="Priority" selected={f.priority ?? []} onChange={(v) => set({ priority: v as TaskFilters["priority"] })}
              options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
            <Facet label="Type" selected={f.type ?? []} onChange={(v) => set({ type: v as TaskFilters["type"] })}
              options={TASK_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
            <Facet label="Labels" selected={f.label ?? []} onChange={(v) => set({ label: v })}
              options={w.labels.map((l) => ({ value: l.id, label: l.name }))} />
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => onConfig({ ...config, filters: { q: f.q } })}>
              Clear filters
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Quick filters">
        {QUICK.map((q) => (
          <button
            key={q.id}
            aria-pressed={f.quick === q.id}
            onClick={() => set({ quick: f.quick === q.id ? undefined : q.id })}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
              f.quick === q.id && "border-primary bg-primary/10 font-medium text-primary",
            )}
          >
            {q.label}
          </button>
        ))}
        {(["today", "overdue"] as const).map((d) => (
          <button
            key={d}
            aria-pressed={f.due === d}
            onClick={() => set({ due: f.due === d ? undefined : d })}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
              f.due === d && "border-primary bg-primary/10 font-medium text-primary",
            )}
          >
            {d === "today" ? "Due today" : "Overdue"}
          </button>
        ))}
        {countActiveFilters(f) > 0 && (
          <Button variant="ghost" size="xs" onClick={() => onConfig({ ...config, filters: {} })}>
            <X /> Reset
          </Button>
        )}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {groupOptions && (
          <SimpleSelect
            aria-label="Group by"
            size="sm"
            className="w-36"
            value={config.group ?? groupOptions[0].value}
            onChange={(g) => onConfig({ ...config, group: g as ViewConfig["group"] })}
            options={groupOptions}
          />
        )}
        <SimpleSelect
          aria-label="Sort by"
          size="sm"
          className="w-44"
          value={sortValue}
          onChange={(v) => {
            if (v === "manual") return onConfig({ ...config, sort: undefined });
            const [field, dir] = v.split(":");
            onConfig({ ...config, sort: { field: field as NonNullable<ViewConfig["sort"]>["field"], dir: dir as "asc" | "desc" } });
          }}
          options={SORT_OPTIONS}
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={showSubtasks} onCheckedChange={(c) => onShowSubtasks(Boolean(c))} />
          Subtasks
        </label>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            <Bookmark /> Views <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>Saved views</DropdownMenuLabel>
            {views.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No saved views yet.</p>}
            {views.map((v) => (
              <DropdownMenuItem key={v.id} onClick={() => onApplyView(v)}>
                <span className="truncate">{v.name}</span>
                {v.is_shared && <span className="ml-auto text-[10px] text-muted-foreground">shared</span>}
                {v.owner_id === w.userId && (
                  <button
                    aria-label={`Delete view ${v.name}`}
                    className="ml-1 rounded p-0.5 text-muted-foreground hover:text-destructive"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const r = await runAction(() => deleteSavedViewAction(v.id));
                      if (r.ok) setViews((x) => x.filter((y) => y.id !== v.id));
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSaveOpen(true)}>
              <Plus /> Save current view…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {w.canEdit && (
          <Button size="sm" onClick={onCreateTask}>
            <Plus /> New task
          </Button>
        )}
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>Stores the current filters, sorting, grouping and visible columns.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (viewName.trim()) void saveView();
            }}
            className="space-y-3"
          >
            <Input aria-label="View name" placeholder="e.g. My open bugs" value={viewName} onChange={(e) => setViewName(e.target.value)} autoFocus />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={shared} onCheckedChange={(c) => setShared(Boolean(c))} />
              Share with everyone who can see this project
            </label>
            <div className="flex justify-end">
              <Button type="submit" disabled={!viewName.trim()}>Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
