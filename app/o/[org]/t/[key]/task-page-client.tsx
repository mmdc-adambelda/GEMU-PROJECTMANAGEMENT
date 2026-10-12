"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { orgPath } from "@/components/app/shell/shell-context";
import type { DetailEnv } from "@/features/tasks/detail/env";
import { TaskDetail } from "@/features/tasks/detail/task-detail";
import type { TaskDetailData } from "@/lib/data/task-detail";

export function TaskPageClient({
  taskId, orgSlug, projectName, initial, env,
}: { taskId: string; orgSlug: string; projectName: string; initial: TaskDetailData; env: DetailEnv }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-6xl">
      <div className="px-5 pt-4">
        <Link href={orgPath(orgSlug, `/p/${env.project.key}`)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {projectName}
        </Link>
      </div>
      <TaskDetail
        key={taskId}
        taskId={taskId}
        env={env}
        initial={initial}
        variant="page"
        onChanged={() => router.refresh()}
        onNavigate={(_id, key) => router.push(orgPath(orgSlug, `/t/${key}`))}
        onGone={() => router.push(orgPath(orgSlug, `/p/${env.project.key}`))}
      />
    </div>
  );
}
