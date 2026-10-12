"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Field, FormError, SubmitButton } from "@/components/app/form-field";
import { ColorPicker, IconPicker } from "@/components/app/pickers";
import { SimpleSelect } from "@/components/app/simple-select";
import { orgPath, useShell } from "@/components/app/shell/shell-context";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createSpaceAction } from "@/features/spaces/actions";
import { runAction } from "@/lib/hooks/use-run-action";

const schema = z.object({
  workspaceId: z.string().min(1, "Choose a workspace"),
  name: z.string().trim().min(1, "Enter a name").max(100),
  description: z.string().max(500),
  color: z.string(),
  icon: z.string(),
  isPrivate: z.boolean(),
});
type Values = z.infer<typeof schema>;

export function CreateSpaceDialog({
  trigger, open: controlledOpen, onOpenChange,
}: { trigger?: ReactNode; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  const { org, data, activeWorkspaceId } = useShell();
  const router = useRouter();
  const [internal, setInternal] = useState(false);
  const open = controlledOpen ?? internal;
  const setOpen = onOpenChange ?? setInternal;
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      workspaceId: activeWorkspaceId ?? data.workspaces[0]?.id ?? "",
      name: "", description: "", color: "#6366f1", icon: "layers", isPrivate: false,
    },
  });
  const { errors } = form.formState;
  const colorValue = useWatch({ control: form.control, name: "color" });

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    setPending(true);
    const r = await runAction(() => createSpaceAction(v));
    setPending(false);
    if (!r.ok) return setError(r.error);
    setOpen(false);
    form.reset();
    router.push(orgPath(org.slug, `/spaces/${r.data.id}`));
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger render={trigger as React.ReactElement} /> : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a space</DialogTitle>
          <DialogDescription>
            A space is a major area of work, such as Engineering or Customer Success. It owns its workflow and projects.
          </DialogDescription>
        </DialogHeader>
        {data.workspaces.length === 0 ? (
          <p className="rounded-md border bg-muted/50 p-3 text-sm">
            Create a workspace first (Settings → Workspaces). Only organization admins can do that.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormError message={error} />
            <Field label="Workspace" htmlFor="space-ws" error={errors.workspaceId?.message}>
              <Controller
                control={form.control}
                name="workspaceId"
                render={({ field }) => (
                  <SimpleSelect
                    id="space-ws"
                    value={field.value}
                    onChange={field.onChange}
                    options={data.workspaces.map((w) => ({ value: w.id, label: w.name }))}
                    className="w-full"
                  />
                )}
              />
            </Field>
            <Field label="Name" htmlFor="space-name" error={errors.name?.message}>
              <Input id="space-name" placeholder="Software Development" autoFocus {...form.register("name")} />
            </Field>
            <Field label="Description" htmlFor="space-desc" error={errors.description?.message}>
              <Textarea id="space-desc" rows={2} {...form.register("description")} />
            </Field>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Color</span>
              <Controller control={form.control} name="color" render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />} />
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Icon</span>
              <Controller
                control={form.control}
                name="icon"
                render={({ field }) => <IconPicker value={field.value} onChange={field.onChange} color={colorValue} />}
              />
            </div>
            <label className="flex items-start justify-between gap-4 rounded-md border p-3">
              <span>
                <span className="block text-sm font-medium">Private space</span>
                <span className="block text-xs text-muted-foreground">
                  Only admins and people you add can see it. Otherwise all members of the workspace can.
                </span>
              </span>
              <Controller control={form.control} name="isPrivate" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
            </label>
            <div className="flex justify-end">
              <SubmitButton pending={pending}>Create space</SubmitButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
