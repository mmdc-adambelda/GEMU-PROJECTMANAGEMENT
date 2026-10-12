"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Field, FormError, SubmitButton } from "@/components/app/form-field";
import { SimpleSelect } from "@/components/app/simple-select";
import { orgPath, useShell } from "@/components/app/shell/shell-context";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createTaskAction } from "@/features/tasks/actions";
import { PRIORITIES, PRIORITY_LABEL, TASK_TYPES, TYPE_LABEL } from "@/lib/constants";
import type { TaskPriority, TaskType } from "@/types";

export function CreateTaskDialog({
  trigger, defaultProjectId, defaultStatusId, open: controlledOpen, onOpenChange, members, onCreated,
}: {
  trigger?: ReactNode;
  defaultProjectId?: string;
  defaultStatusId?: string;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  members?: Array<{ id: string; name: string }>;
  onCreated?: () => void;
}) {
  const { org, data } = useShell();
  const router = useRouter();
  const [internal, setInternal] = useState(false);
  const open = controlledOpen ?? internal;
  const setOpen = onOpenChange ?? setInternal;
  const [projectId, setProjectId] = useState(defaultProjectId ?? data.projects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [type, setType] = useState<TaskType>("task");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError("Enter a title.");
    if (!projectId) return setError("Choose a project.");
    setPending(true);
    const r = await createTaskAction({
      projectId, title, description, priority, type, dueDate: dueDate || null,
      assigneeId: assignee || null, statusId: defaultStatusId ?? null,
    });
    setPending(false);
    if (!r.ok) return setError(r.error);
    toast.success(r.message ?? "Task created", {
      action: { label: "Open", onClick: () => router.push(orgPath(org.slug, `/t/${r.data.key}`)) },
    });
    setTitle(""); setDescription(""); setDueDate(""); setAssignee("");
    setOpen(false);
    router.refresh();
    onCreated?.();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger render={trigger as React.ReactElement} /> : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>You can add labels, subtasks, attachments and more once it exists.</DialogDescription>
        </DialogHeader>
        {data.projects.length === 0 ? (
          <p className="rounded-md border bg-muted/50 p-3 text-sm">Create a project first — tasks live inside projects.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <FormError message={error} />
            <Field label="Project" htmlFor="task-project">
              <SimpleSelect
                id="task-project"
                value={projectId}
                onChange={setProjectId}
                className="w-full"
                options={data.projects.map((p) => ({ value: p.id, label: `${p.key} · ${p.name}` }))}
              />
            </Field>
            <Field label="Title" htmlFor="task-title">
              <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={300} placeholder="What needs to be done?" />
            </Field>
            <Field label="Description" htmlFor="task-desc" hint="Markdown is supported.">
              <Textarea id="task-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type" htmlFor="task-type">
                <SimpleSelect id="task-type" value={type} onChange={setType} className="w-full" options={TASK_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
              </Field>
              <Field label="Priority" htmlFor="task-prio">
                <SimpleSelect id="task-prio" value={priority} onChange={setPriority} className="w-full" options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
              </Field>
              <Field label="Due date" htmlFor="task-due">
                <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
              {members && (
                <Field label="Assignee" htmlFor="task-assignee">
                  <SimpleSelect
                    id="task-assignee"
                    value={assignee || "none"}
                    onChange={(v) => setAssignee(v === "none" ? "" : v)}
                    className="w-full"
                    options={[{ value: "none", label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
                  />
                </Field>
              )}
            </div>
            <div className="flex justify-end">
              <SubmitButton pending={pending}>Create task</SubmitButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
