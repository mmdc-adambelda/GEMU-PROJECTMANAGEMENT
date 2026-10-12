"use client";

import {
  Archive, ArchiveRestore, Copy, Eye, EyeOff, Link as LinkIcon, MoreHorizontal, MoveRight, Pencil, Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ActivityList } from "@/components/app/activity-list";
import { MarkdownEditor } from "@/components/app/markdown-editor";
import { Markdown } from "@/components/app/markdown";
import { orgPath, useShell } from "@/components/app/shell/shell-context";
import { SimpleSelect } from "@/components/app/simple-select";
import { PriorityIcon, StatusPill, TypeIcon } from "@/components/app/task-chips";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  deleteTaskAction, duplicateTaskAction, moveTaskToProjectAction, toggleWatchAction, updateTaskAction,
} from "@/features/tasks/actions";
import { getTaskDetailAction } from "@/features/tasks/detail-actions";
import { PRIORITIES, PRIORITY_LABEL, TASK_TYPES, TYPE_LABEL } from "@/lib/constants";
import type { TaskDetailData } from "@/lib/data/task-detail";
import { runAction } from "@/lib/hooks/use-run-action";
import { fmtDateTime, fmtMinutes, parseDuration, timeAgo } from "@/lib/utils/dates";
import type { TaskPriority, TaskType } from "@/types";
import type { TaskPatch } from "@/features/projects/workspace/context";
import { AttachmentsSection } from "./attachments-section";
import { CommentsSection } from "./comments-section";
import { personLabel, type DetailEnv } from "./env";
import { CustomFieldsSection, LabelsPicker } from "./fields-section";
import { DependenciesSection, SubtasksSection } from "./relations-section";
import { TimeSection } from "./time-section";

type DetailPatch = TaskPatch & { description?: string; resolution?: string | null };

interface Props {
  taskId: string;
  env: DetailEnv;
  initial?: TaskDetailData | null;
  variant: "drawer" | "page";
  /** Called after any mutation so the surrounding board/list can refresh. */
  onChanged?: () => void;
  onNavigate?: (id: string, key: string) => void;
  onGone?: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TaskDetail({ taskId, env, initial = null, variant, onChanged, onNavigate, onGone }: Props) {
  const shell = useShell();
  const [data, setData] = useState<TaskDetailData | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(initial?.task.title ?? "");
  const [desc, setDesc] = useState(initial?.task.description ?? "");
  const [editingDesc, setEditingDesc] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [estimateText, setEstimateText] = useState(initial?.task.estimate_minutes ? fmtMinutes(initial.task.estimate_minutes) : "");

  const load = useCallback(async () => {
    const r = await getTaskDetailAction(taskId);
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    setData(r.data);
    setTitle(r.data.task.title);
    setDesc((d) => (editingDesc ? d : r.data.task.description));
    setEstimateText(r.data.task.estimate_minutes ? fmtMinutes(r.data.task.estimate_minutes) : "");
  }, [taskId, editingDesc]);

  // callers mount this component with key={taskId}, so state never leaks between tasks
  useEffect(() => {
    // load() only sets state after awaiting the server, so this is not a synchronous cascade
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!initial) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changed = useCallback(async () => {
    await load();
    onChanged?.();
  }, [load, onChanged]);

  const people = useMemo(() => new Map(env.members.map((m) => [m.id, m])), [env.members]);

  if (error) {
    return (
      <div className="space-y-3 p-6">
        <p role="alert" className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={() => onGone?.()}>Close</Button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4 p-6" aria-busy="true" aria-label="Loading task">
        <Skeleton className="h-6 w-40" /><Skeleton className="h-8 w-3/4" /><Skeleton className="h-32 w-full" /><Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const t = data.task;
  const status = env.statuses.find((s) => s.id === t.status_id);
  const allowed = (() => {
    const out = env.transitions.filter((x) => x.from_status_id === t.status_id);
    return out.length === 0 ? null : new Set(out.map((x) => x.to_status_id));
  })();
  const watching = data.watchers.includes(env.userId);
  const archived = Boolean(t.archived_at);

  async function patch(p: DetailPatch) {
    const r = await runAction(() => updateTaskAction(taskId, p), false);
    if (r.ok) await changed();
    else await load(); // restore server truth after a rejected change (e.g. workflow rule)
    return r.ok;
  }

  const open = (id: string) => {
    const key = [...data.subtasks, ...data.blockedBy, ...data.blocking, ...(data.parent ? [data.parent] : [])].find((x) => x.id === id)?.key ?? "";
    onNavigate?.(id, key);
  };

  return (
    <div className="flex min-h-0 flex-col">
      <header className="flex items-start gap-3 border-b px-5 py-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <TypeIcon type={t.type} />
            {data.parent && (
              <>
                <button className="font-mono text-xs hover:underline" onClick={() => open(data.parent!.id)}>{data.parent.key}</button>
                <span aria-hidden>/</span>
              </>
            )}
            <span className="font-mono text-xs">{t.key}</span>
            {archived && <span className="rounded bg-muted px-1.5 text-xs">Archived</span>}
          </div>
          {editingTitle ? (
            <Input
              autoFocus aria-label="Task title" value={title} maxLength={300} className="h-auto text-lg font-semibold"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={async () => {
                setEditingTitle(false);
                if (title.trim() && title.trim() !== t.title) await patch({ title: title.trim() });
                else setTitle(t.title);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setTitle(t.title); setEditingTitle(false); } }}
            />
          ) : (
            <h2 className="text-lg font-semibold leading-snug">
              {env.canEdit ? (
                <button className="group flex items-start gap-2 text-left" onClick={() => setEditingTitle(true)} aria-label="Edit title">
                  {t.title} <Pencil className="mt-1.5 size-3.5 shrink-0 opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60" />
                </button>
              ) : t.title}
            </h2>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" onClick={async () => { const r = await runAction(() => toggleWatchAction(taskId, !watching), false); if (r.ok) { toast.success(watching ? "Stopped watching" : "Watching"); await changed(); } }}
            aria-pressed={watching}>
            {watching ? <EyeOff /> : <Eye />} {watching ? "Unwatch" : "Watch"} <span className="text-muted-foreground">{data.watchers.length}</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Task actions" />}><MoreHorizontal /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}${orgPath(env.orgSlug, `/t/${t.key}`)}`); toast.success("Link copied"); }}><LinkIcon /> Copy link</DropdownMenuItem>
              {env.canEdit && (
                <>
                  <DropdownMenuItem onClick={async () => { const r = await runAction(() => duplicateTaskAction(taskId)); if (r.ok) { onChanged?.(); onNavigate?.(r.data.id, r.data.key); } }}><Copy /> Duplicate</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMoveOpen(true)}><MoveRight /> Move to project…</DropdownMenuItem>
                  <DropdownMenuItem onClick={async () => { const ok = await patch({ archived: !archived }); if (ok) toast.success(archived ? "Task restored" : "Task archived"); }}>
                    {archived ? <><ArchiveRestore /> Restore</> : <><Archive /> Archive</>}
                  </DropdownMenuItem>
                </>
              )}
              {(env.canManage || t.reporter_id === env.userId) && env.canEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setDelOpen(true)}><Trash2 /> Delete…</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className={variant === "page" ? "grid gap-8 p-5 lg:grid-cols-[1fr_20rem]" : "grid gap-6 p-5"}>
        <div className="min-w-0 space-y-7">
          <section aria-labelledby="desc-h" className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 id="desc-h" className="text-sm font-semibold">Description</h3>
              {env.canEdit && !editingDesc && <Button variant="ghost" size="xs" onClick={() => setEditingDesc(true)}><Pencil /> Edit</Button>}
            </div>
            {editingDesc ? (
              <div className="space-y-2">
                <MarkdownEditor value={desc} onChange={setDesc} rows={8} aria-label="Description" placeholder="Describe the work. Markdown is supported." />
                <div className="flex gap-2">
                  <Button size="sm" onClick={async () => { if (await patch({ description: desc })) setEditingDesc(false); }}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setDesc(t.description); setEditingDesc(false); }}>Cancel</Button>
                </div>
              </div>
            ) : t.description.trim() ? (
              <Markdown>{t.description}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">{env.canEdit ? "No description yet. Add context, acceptance criteria or links." : "No description."}</p>
            )}
          </section>

          <SubtasksSection parentId={taskId} subtasks={data.subtasks} env={env} onChanged={changed} onOpen={open} />
          <DependenciesSection taskId={taskId} blockedBy={data.blockedBy} blocking={data.blocking} env={env} onChanged={changed} onOpen={open} />
          <AttachmentsSection taskId={taskId} attachments={data.attachments} env={env} onChanged={changed} />
          <TimeSection taskId={taskId} entries={data.timeEntries} estimate={t.estimate_minutes} env={env} onChanged={changed} />

          <Tabs defaultValue="comments">
            <TabsList>
              <TabsTrigger value="comments">Comments ({data.comments.length})</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="comments" className="pt-3">
              <CommentsSection taskId={taskId} comments={data.comments} env={env} onChanged={changed} />
            </TabsContent>
            <TabsContent value="activity" className="pt-3">
              <ActivityList entries={data.activity} people={people} />
            </TabsContent>
          </Tabs>
        </div>

        <aside aria-label="Task properties" className="space-y-3 text-sm lg:border-l lg:pl-6">
          <Row label="Status">
            <SimpleSelect size="sm" className="w-full" disabled={!env.canEdit} value={t.status_id} aria-label="Status"
              onChange={(statusId) => patch({ statusId })}
              options={env.statuses.filter((s) => s.id === t.status_id || !allowed || allowed.has(s.id))
                .map((s) => ({ value: s.id, label: s.name, icon: <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} /> }))} />
          </Row>
          <Row label="Priority">
            <SimpleSelect size="sm" className="w-full" disabled={!env.canEdit} value={t.priority} aria-label="Priority"
              onChange={(priority: TaskPriority) => patch({ priority })}
              options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p], icon: <PriorityIcon priority={p} /> }))} />
          </Row>
          <Row label="Type">
            <SimpleSelect size="sm" className="w-full" disabled={!env.canEdit} value={t.type} aria-label="Type"
              onChange={(type: TaskType) => patch({ type })}
              options={TASK_TYPES.map((x) => ({ value: x, label: TYPE_LABEL[x], icon: <TypeIcon type={x} /> }))} />
          </Row>
          <Row label="Assignee">
            <SimpleSelect size="sm" className="w-full" disabled={!env.canEdit} value={t.assignee_id ?? "none"} aria-label="Assignee"
              onChange={(v) => patch({ assigneeId: v === "none" ? null : v })}
              options={[{ value: "none", label: "Unassigned" }, ...env.members.map((m) => ({ value: m.id, label: personLabel(m), icon: <UserAvatar name={m.full_name} email={m.email} src={m.avatar_url} className="size-5" /> }))]} />
          </Row>
          <Row label="Reporter">
            <span className="flex items-center gap-1.5">
              {t.reporter_id ? <><UserAvatar name={people.get(t.reporter_id)?.full_name} email={people.get(t.reporter_id)?.email} src={people.get(t.reporter_id)?.avatar_url} className="size-5" />{personLabel(people.get(t.reporter_id))}</> : "—"}
            </span>
          </Row>
          <Row label="Start date"><Input type="date" className="h-7 text-sm" disabled={!env.canEdit} value={t.start_date ?? ""} aria-label="Start date" onChange={(e) => patch({ startDate: e.target.value || null })} /></Row>
          <Row label="Due date"><Input type="date" className="h-7 text-sm" disabled={!env.canEdit} value={t.due_date ?? ""} aria-label="Due date" onChange={(e) => patch({ dueDate: e.target.value || null })} /></Row>
          <Row label="Estimate">
            <Input className="h-7 text-sm" placeholder="e.g. 2h 30m" disabled={!env.canEdit} value={estimateText} aria-label="Estimate"
              onChange={(e) => setEstimateText(e.target.value)}
              onBlur={() => {
                const v = estimateText.trim() ? parseDuration(estimateText) : null;
                if (estimateText.trim() && v === null) { toast.error("Use a format like 1h 30m"); setEstimateText(t.estimate_minutes ? fmtMinutes(t.estimate_minutes) : ""); return; }
                if (v !== t.estimate_minutes) void patch({ estimateMinutes: v });
              }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
          </Row>
          <Row label="Resolution">
            <Input className="h-7 text-sm" placeholder="e.g. Fixed, Won't do" disabled={!env.canEdit} defaultValue={t.resolution ?? ""} aria-label="Resolution" maxLength={500}
              key={t.resolution ?? ""} onBlur={(e) => { if (e.target.value !== (t.resolution ?? "")) void patch({ resolution: e.target.value }); }} />
          </Row>
          <Row label="Labels"><LabelsPicker taskId={taskId} selected={data.labels} env={env} onChanged={changed} /></Row>
          <CustomFieldsSection taskId={taskId} values={data.customValues} env={env} onChanged={changed} />
          <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
            <p title={fmtDateTime(t.created_at)}>Created {timeAgo(t.created_at)}</p>
            <p title={fmtDateTime(t.updated_at)}>Updated {timeAgo(t.updated_at)}</p>
            {t.completed_at && <p title={fmtDateTime(t.completed_at)}>Completed {timeAgo(t.completed_at)}</p>}
          </div>
          {status && <StatusPill name={status.name} color={status.color} />}
        </aside>
      </div>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {t.key}</DialogTitle>
            <DialogDescription>The task gets a new key in the target project. Its status is mapped by name, otherwise reset to the default.</DialogDescription>
          </DialogHeader>
          <SimpleSelect className="w-full" placeholder="Choose a project" value={moveTo || null} onChange={setMoveTo}
            options={shell.data.projects.filter((p) => p.id !== t.project_id).map((p) => ({ value: p.id, label: `${p.key} · ${p.name}` }))} />
          <DialogFooter>
            <Button disabled={!moveTo} onClick={async () => {
              const r = await runAction(() => moveTaskToProjectAction(taskId, moveTo));
              if (r.ok) { setMoveOpen(false); onChanged?.(); onNavigate?.(taskId, r.data.key); }
            }}>Move task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {t.key}?</DialogTitle>
            <DialogDescription>This permanently deletes the task, its subtasks, comments and attachments. Consider archiving instead.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => { const r = await runAction(() => deleteTaskAction(taskId)); if (r.ok) { setDelOpen(false); onChanged?.(); onGone?.(); } }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
