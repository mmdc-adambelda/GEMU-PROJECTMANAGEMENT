"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Field, FormError, SubmitButton } from "@/components/app/form-field";
import { ColorPicker } from "@/components/app/pickers";
import { useShell } from "@/components/app/shell/shell-context";
import { orgPath } from "@/lib/paths";
import { SimpleSelect } from "@/components/app/simple-select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createProjectAction } from "@/features/projects/actions";
import { PRIORITIES, PRIORITY_LABEL, PROJECT_TEMPLATES } from "@/lib/constants";
import { runAction } from "@/lib/hooks/use-run-action";
import { cn } from "@/lib/utils";

const schema = z
  .object({
    spaceId: z.string().min(1, "Choose a space"),
    name: z.string().trim().min(1, "Enter a name").max(100),
    key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/, "2-10 letters/numbers, starting with a letter"),
    description: z.string().max(2000),
    template: z.enum(["general", "software", "it_ops", "marketing"]),
    priority: z.enum(["lowest", "low", "medium", "high", "highest"]),
    startDate: z.string(),
    dueDate: z.string(),
    color: z.string(),
  })
  .refine((v) => !v.startDate || !v.dueDate || v.dueDate >= v.startDate, {
    path: ["dueDate"],
    message: "Due date must be on or after the start date",
  });
type Values = z.infer<typeof schema>;

export function suggestKey(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const k = words.length > 1 ? words.map((w) => w[0]).join("").slice(0, 4) : words[0].slice(0, 4);
  return /^[A-Z]/.test(k) ? k.padEnd(2, "X") : "P" + k;
}

export function CreateProjectDialog({
  trigger, defaultSpaceId, open: controlledOpen, onOpenChange, redirectTo = true,
}: {
  trigger?: ReactNode; defaultSpaceId?: string; open?: boolean; onOpenChange?: (o: boolean) => void; redirectTo?: boolean;
}) {
  const { org, data } = useShell();
  const router = useRouter();
  const [internal, setInternal] = useState(false);
  const open = controlledOpen ?? internal;
  const setOpen = onOpenChange ?? setInternal;
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      spaceId: defaultSpaceId ?? data.spaces[0]?.id ?? "",
      name: "", key: "", description: "", template: "general", priority: "medium", startDate: "", dueDate: "", color: "#6366f1",
    },
  });
  const { errors } = form.formState;
  const template = useWatch({ control: form.control, name: "template" });

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    setPending(true);
    const r = await runAction(() => createProjectAction({ ...v, leadId: null }));
    setPending(false);
    if (!r.ok) {
      if (r.fieldErrors?.key) form.setError("key", { message: r.fieldErrors.key[0] });
      return setError(r.error);
    }
    setOpen(false);
    form.reset();
    setKeyTouched(false);
    router.refresh();
    if (redirectTo) router.push(orgPath(org.slug, `/p/${r.data.key}`));
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger render={trigger as React.ReactElement} /> : null}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create a project</DialogTitle>
          <DialogDescription>Projects hold tasks. Task ids look like KEY-1, KEY-2…</DialogDescription>
        </DialogHeader>
        {data.spaces.length === 0 ? (
          <p className="rounded-md border bg-muted/50 p-3 text-sm">Create a space first — projects live inside spaces.</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormError message={error} />
            <Field label="Space" htmlFor="proj-space" error={errors.spaceId?.message}>
              <Controller
                control={form.control}
                name="spaceId"
                render={({ field }) => (
                  <SimpleSelect
                    id="proj-space"
                    value={field.value}
                    onChange={field.onChange}
                    options={data.spaces.map((s) => ({ value: s.id, label: s.name }))}
                    className="w-full"
                  />
                )}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <Field label="Name" htmlFor="proj-name" error={errors.name?.message}>
                <Input
                  id="proj-name"
                  autoFocus
                  placeholder="Website relaunch"
                  {...form.register("name", {
                    onChange: (e) => {
                      if (!keyTouched) form.setValue("key", suggestKey(e.target.value), { shouldValidate: false });
                    },
                  })}
                />
              </Field>
              <Field label="Key" htmlFor="proj-key" error={errors.key?.message}>
                <Input
                  id="proj-key"
                  className="font-mono uppercase"
                  maxLength={10}
                  {...form.register("key", { onChange: () => setKeyTouched(true) })}
                />
              </Field>
            </div>
            <Field label="Description" htmlFor="proj-desc" error={errors.description?.message}>
              <Textarea id="proj-desc" rows={2} {...form.register("description")} />
            </Field>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Template</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {PROJECT_TEMPLATES.map((t) => (
                  <label
                    key={t.value}
                    className={cn(
                      "cursor-pointer rounded-md border p-2.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      template === t.value && "border-primary bg-primary/5",
                    )}
                  >
                    <input type="radio" className="sr-only" value={t.value} {...form.register("template")} />
                    <span className="block font-medium">{t.label}</span>
                    <span className="block text-xs text-muted-foreground">{t.description}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Start date" htmlFor="proj-start">
                <Input id="proj-start" type="date" {...form.register("startDate")} />
              </Field>
              <Field label="Due date" htmlFor="proj-due" error={errors.dueDate?.message}>
                <Input id="proj-due" type="date" {...form.register("dueDate")} />
              </Field>
              <Field label="Priority" htmlFor="proj-prio">
                <Controller
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <SimpleSelect
                      id="proj-prio"
                      value={field.value}
                      onChange={field.onChange}
                      options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
                      className="w-full"
                    />
                  )}
                />
              </Field>
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Color</span>
              <Controller control={form.control} name="color" render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />} />
            </div>
            <div className="flex justify-end">
              <SubmitButton pending={pending}>Create project</SubmitButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
