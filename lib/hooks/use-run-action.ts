"use client";

import { useCallback, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/utils/action";

/**
 * Runs a Server Action inside a transition and reports the outcome with a toast.
 * Failures are always shown to the user; success toasts use the action's own message.
 */
export function useRunAction() {
  const [pending, start] = useTransition();
  const run = useCallback(
    <T,>(fn: () => Promise<ActionResult<T>>, opts?: { success?: string | false; onOk?: (data: T) => void; onFail?: (e: string) => void }) => {
      start(async () => {
        const r = await fn();
        if (!r.ok) {
          toast.error(r.error);
          opts?.onFail?.(r.error);
          return;
        }
        const msg = opts?.success === false ? undefined : (opts?.success ?? r.message);
        if (msg) toast.success(msg);
        opts?.onOk?.(r.data);
      });
    },
    [],
  );
  return { pending, run };
}

/** Same as the hook, but awaitable (for forms that need the result). */
export async function runAction<T>(fn: () => Promise<ActionResult<T>>, success?: string | false): Promise<ActionResult<T>> {
  const r = await fn();
  if (!r.ok) toast.error(r.error);
  else {
    const msg = success === false ? undefined : (success ?? r.message);
    if (msg) toast.success(msg);
  }
  return r;
}
