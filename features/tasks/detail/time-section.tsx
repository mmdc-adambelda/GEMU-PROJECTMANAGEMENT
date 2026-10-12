"use client";

import { Clock, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteTimeEntryAction, logTimeAction } from "@/features/tasks/actions";
import { runAction } from "@/lib/hooks/use-run-action";
import { fmtDate, fmtMinutes, parseDuration, todayStr } from "@/lib/utils/dates";
import type { TimeEntry } from "@/types";
import { personLabel, type DetailEnv } from "./env";

export function TimeSection({
  taskId, entries, estimate, env, onChanged,
}: { taskId: string; entries: TimeEntry[]; estimate: number | null; env: DetailEnv; onChanged: () => void }) {
  const [dur, setDur] = useState("");
  const [note, setNote] = useState("");
  const [day, setDay] = useState(todayStr());
  const spent = entries.reduce((n, e) => n + e.minutes, 0);
  const pct = estimate ? Math.min(100, Math.round((100 * spent) / estimate)) : 0;
  const parsed = parseDuration(dur);

  return (
    <section aria-labelledby="time-h" className="space-y-2">
      <h3 id="time-h" className="flex items-center gap-2 text-sm font-semibold"><Clock className="size-4" /> Time tracking</h3>
      <div>
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>Logged {fmtMinutes(spent)}</span>
          <span>{estimate ? `Estimate ${fmtMinutes(estimate)}` : "No estimate"}</span>
        </div>
        {estimate ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Time spent versus estimate">
            <div className={spent > estimate ? "h-full bg-red-500" : "h-full bg-primary"} style={{ width: `${pct}%` }} />
          </div>
        ) : null}
      </div>
      {env.canEdit && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!parsed) return;
            const r = await runAction(() => logTimeAction({ taskId, minutes: parsed, description: note, loggedOn: day }));
            if (r.ok) { setDur(""); setNote(""); onChanged(); }
          }}
        >
          <Input aria-label="Time spent (e.g. 1h 30m)" placeholder="1h 30m" className="w-24" value={dur} onChange={(e) => setDur(e.target.value)} aria-invalid={dur !== "" && !parsed} />
          <Input aria-label="Date" type="date" className="w-36" value={day} onChange={(e) => setDay(e.target.value)} />
          <Input aria-label="Note" placeholder="What did you work on?" className="min-w-40 flex-1" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          <Button type="submit" size="sm" variant="outline" disabled={!parsed}>Log time</Button>
        </form>
      )}
      {entries.length > 0 && (
        <ul className="divide-y rounded-lg border text-sm">
          {entries.slice(0, 20).map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-1.5">
              <span className="w-16 font-medium tabular-nums">{fmtMinutes(e.minutes)}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {personLabel(env.members.find((m) => m.id === e.user_id))} · {fmtDate(e.logged_on)}{e.description ? ` · ${e.description}` : ""}
              </span>
              {e.user_id === env.userId && (
                <Button variant="ghost" size="icon-xs" aria-label="Delete time entry" onClick={async () => { const r = await runAction(() => deleteTimeEntryAction(e.id), false); if (r.ok) onChanged(); }}><Trash2 /></Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
