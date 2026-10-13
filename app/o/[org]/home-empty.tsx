"use client";

import { FolderKanban, Layers, Rocket, Users } from "lucide-react";
import Link from "next/link";
import { useShell } from "@/components/app/shell/shell-context";
import { orgPath } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import { CreateProjectDialog } from "@/features/projects/create-project-dialog";
import { CreateSpaceDialog } from "@/features/spaces/create-space-dialog";

/** First-run state: guides a new organization through workspace → space → project. */
export function HomeEmpty({ orgSlug, canCreateWorkspace, name }: { orgSlug: string; canCreateWorkspace: boolean; name: string }) {
  const { data } = useShell();
  const hasWorkspace = data.workspaces.length > 0;
  const hasSpace = data.spaces.length > 0;
  const steps = [
    {
      icon: Layers, title: "Create a workspace", done: hasWorkspace,
      body: "Workspaces group related spaces, such as a department or client.",
      action: canCreateWorkspace
        ? <Button size="sm" variant={hasWorkspace ? "outline" : "default"} render={<Link href={orgPath(orgSlug, "/settings/workspaces")} />}>{hasWorkspace ? "Manage" : "Create workspace"}</Button>
        : <span className="text-xs text-muted-foreground">Ask an admin</span>,
    },
    {
      icon: FolderKanban, title: "Create a space", done: hasSpace,
      body: "A space owns a workflow, custom fields and projects — e.g. Engineering.",
      action: hasWorkspace ? <CreateSpaceDialog trigger={<Button size="sm" variant={hasSpace ? "outline" : "default"}>Create space</Button>} /> : <span className="text-xs text-muted-foreground">Needs a workspace</span>,
    },
    {
      icon: Rocket, title: "Create a project", done: false,
      body: "Projects hold your tasks, with Kanban, list, calendar and timeline views.",
      action: hasSpace ? <CreateProjectDialog trigger={<Button size="sm">Create project</Button>} /> : <span className="text-xs text-muted-foreground">Needs a space</span>,
    },
    {
      icon: Users, title: "Invite your team", done: false,
      body: "Share a private invitation link with each teammate.",
      action: <Button size="sm" variant="outline" render={<Link href={orgPath(orgSlug, "/settings/members")} />}>Invite people</Button>,
    },
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {name}!</h1>
        <p className="text-muted-foreground">Let&apos;s set up your organization. Follow these steps — it takes a couple of minutes.</p>
      </div>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-center gap-4 rounded-xl border bg-card p-4">
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-primary/10 text-primary"}`}>
              <s.icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{i + 1}. {s.title}</p>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </div>
            {s.action}
          </li>
        ))}
      </ol>
    </div>
  );
}
