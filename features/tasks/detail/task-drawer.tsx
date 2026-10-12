"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { orgPath } from "@/components/app/shell/shell-context";
import type { DetailEnv } from "./env";
import { TaskDetail } from "./task-detail";

/** Right-hand detail drawer; the page-level equivalent lives at /o/[org]/t/[key]. */
export function TaskDrawer({
  taskId, taskKey, env, onClose, onChanged, onNavigate,
}: {
  taskId: string | null;
  taskKey?: string;
  env: DetailEnv;
  onClose: () => void;
  onChanged: () => void;
  onNavigate: (id: string, key: string) => void;
}) {
  return (
    <Sheet open={!!taskId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-3xl">
        <SheetTitle className="sr-only">Task details</SheetTitle>
        <SheetDescription className="sr-only">View and edit the selected task</SheetDescription>
        {taskId && (
          <>
            {taskKey && (
              <div className="flex justify-end border-b px-5 py-1.5 pr-12">
                <Button variant="ghost" size="xs" render={<Link href={orgPath(env.orgSlug, `/t/${taskKey}`)} />}>
                  <ExternalLink /> Open full page
                </Button>
              </div>
            )}
            <TaskDetail key={taskId} taskId={taskId} env={env} variant="drawer" onChanged={onChanged} onNavigate={onNavigate} onGone={onClose} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
