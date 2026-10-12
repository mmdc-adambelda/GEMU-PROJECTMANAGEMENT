"use client";

import { CheckCircle2, Plus, Trash2, XCircle, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field } from "@/components/app/form-field";
import { SimpleSelect } from "@/components/app/simple-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { createAutomationAction, deleteAutomationAction, toggleAutomationAction } from "@/features/spaces/actions";
import { PRIORITIES, PRIORITY_LABEL } from "@/lib/constants";
import type { MemberLite } from "@/lib/data/project";
import { runAction } from "@/lib/hooks/use-run-action";
import { timeAgo } from "@/lib/utils/dates";
import type { AutomationRule, TaskPriority, WorkflowStatus } from "@/types";

export interface ExecutionLite { rule_id: string; outcome: string; message: string | null; executed_at: string }

const TRIGGERS = [
  { value: "task_created", label: "When a task is created" },
  { value: "status_changed", label: "When a task changes status" },
  { value: "subtasks_completed", label: "When all subtasks are done (acts on the parent)" },
  { value: "task_overdue", label: "When a task becomes overdue (checked every 15 min)" },
] as const;
const ACTION_TYPES = [
  { value: "assign_user", label: "Assign to… (if unassigned)" },
  { value: "set_priority", label: "Set priority to…" },
  { value: "set_status", label: "Move to status…" },
  { value: "notify_user", label: "Notify…" },
  { value: "notify_project_lead", label: "Notify the project lead" },
] as const;
type ActionType = (typeof ACTION_TYPES)[number]["value"];
interface Draft { type: ActionType; param: string }

function describe(rule: AutomationRule, statuses: WorkflowStatus[], members: MemberLite[]) {
  const st = (id: string) => statuses.find((s) => s.id === id)?.name ?? "?";
  const who = (id: string) => members.find((m) => m.id === id)?.full_name || "?";
  const c = rule.conditions;
  const conds = [c.to_status_id && `moved to ${st(c.to_status_id)}`, c.priority && `priority ${c.priority}`, c.type && `type ${c.type}`].filter(Boolean);
  const acts = rule.actions.map((a) => {
    switch (a.type) {
      case "assign_user": return `assign to ${who(a.user_id)}`;
      case "set_priority": return `set priority ${a.priority}`;
      case "set_status": return `move to ${st(a.status_id)}`;
      case "notify_user": return `notify ${who(a.user_id)}`;
      default: return "notify the project lead";
    }
  });
  return `${conds.length ? `If ${conds.join(" and ")}: ` : ""}${acts.join(", then ")}`;
}

export function AutomationsEditor({
  orgId, spaceId, rules, executions, statuses, members, canManage,
}: { orgId: string; spaceId: string; rules: AutomationRule[]; executions: ExecutionLite[]; statuses: WorkflowStatus[]; members: MemberLite[]; canManage: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<(typeof TRIGGERS)[number]["value"]>("task_created");
  const [condStatus, setCondStatus] = useState("");
  const [condPriority, setCondPriority] = useState("");
  const [actions, setActions] = useState<Draft[]>([{ type: "notify_project_lead", param: "" }]);

  const buildActions = () =>
    actions.map((a) => {
      switch (a.type) {
        case "assign_user": case "notify_user": return { type: a.type, user_id: a.param };
        case "set_priority": return { type: a.type, priority: a.param as TaskPriority };
        case "set_status": return { type: a.type, status_id: a.param };
        default: return { type: a.type };
      }
    });
  const valid = name.trim() && actions.length > 0 && actions.every((a) => a.type === "notify_project_lead" || a.param);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Automations</h2>
        <p className="text-sm text-muted-foreground">
          Rules run inside the database whenever tasks change — no browser needs to be open. Only a fixed set of triggers and actions is supported;
          there is no custom code. Overdue rules are evaluated by a scheduled job.
        </p>
      </div>

      {rules.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No automations yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {rules.map((r) => {
            const last = executions.filter((e) => e.rule_id === r.id)[0];
            return (
              <li key={r.id} className="flex items-start gap-3 p-3">
                <Zap className="mt-1 size-4 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{TRIGGERS.find((t) => t.value === r.trigger_type)?.label}</p>
                  <p className="text-sm">{describe(r, statuses, members)}</p>
                  {last && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      {last.outcome === "success" ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : <XCircle className="size-3.5 text-red-500" />}
                      Last run {timeAgo(last.executed_at)}{last.message ? ` — ${last.message}` : ""}
                    </p>
                  )}
                </div>
                {canManage && (
                  <>
                    <Switch checked={r.is_enabled} aria-label={`${r.name} enabled`}
                      onCheckedChange={async (on) => { const x = await runAction(() => toggleAutomationAction(r.id, Boolean(on))); if (x.ok) router.refresh(); }} />
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${r.name}`}
                      onClick={async () => { if (confirm(`Delete automation “${r.name}”?`)) { const x = await runAction(() => deleteAutomationAction(r.id)); if (x.ok) router.refresh(); } }}><Trash2 /></Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <form className="space-y-4 rounded-xl border p-4" onSubmit={async (e) => {
          e.preventDefault();
          const conditions: Record<string, string> = {};
          if (trigger === "status_changed" && condStatus) conditions.to_status_id = condStatus;
          if (condPriority) conditions.priority = condPriority;
          const r = await runAction(() => createAutomationAction({ orgId, spaceId, name, trigger, conditions, actions: buildActions() }));
          if (r.ok) { setName(""); setActions([{ type: "notify_project_lead", param: "" }]); setCondStatus(""); setCondPriority(""); router.refresh(); }
        }}>
          <h3 className="text-sm font-semibold">New automation</h3>
          <Field label="Name" htmlFor="au-name"><Input id="au-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ping the lead when work enters review" /></Field>
          <Field label="Trigger" htmlFor="au-trigger"><SimpleSelect id="au-trigger" className="w-full" value={trigger} onChange={setTrigger} options={[...TRIGGERS]} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            {trigger === "status_changed" && (
              <Field label="Only when moved to (optional)" htmlFor="au-status">
                <SimpleSelect id="au-status" className="w-full" value={condStatus || "any"} onChange={(v) => setCondStatus(v === "any" ? "" : v)}
                  options={[{ value: "any", label: "Any status" }, ...statuses.map((s) => ({ value: s.id, label: s.name }))]} />
              </Field>
            )}
            <Field label="Only for priority (optional)" htmlFor="au-prio">
              <SimpleSelect id="au-prio" className="w-full" value={condPriority || "any"} onChange={(v) => setCondPriority(v === "any" ? "" : v)}
                options={[{ value: "any", label: "Any priority" }, ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))]} />
            </Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Then</legend>
            {actions.map((a, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <SimpleSelect className="w-64" value={a.type} aria-label={`Action ${i + 1}`} onChange={(type) => setActions((x) => x.map((y, j) => (j === i ? { type, param: "" } : y)))} options={[...ACTION_TYPES]} />
                {(a.type === "assign_user" || a.type === "notify_user") && (
                  <SimpleSelect className="w-52" placeholder="Choose a person" aria-label="Person" value={a.param || null} onChange={(param) => setActions((x) => x.map((y, j) => (j === i ? { ...y, param } : y)))}
                    options={members.map((m) => ({ value: m.id, label: m.full_name || m.email }))} />
                )}
                {a.type === "set_priority" && (
                  <SimpleSelect className="w-40" placeholder="Priority" aria-label="Priority" value={a.param || null} onChange={(param) => setActions((x) => x.map((y, j) => (j === i ? { ...y, param } : y)))}
                    options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
                )}
                {a.type === "set_status" && (
                  <SimpleSelect className="w-44" placeholder="Status" aria-label="Status" value={a.param || null} onChange={(param) => setActions((x) => x.map((y, j) => (j === i ? { ...y, param } : y)))}
                    options={statuses.map((s) => ({ value: s.id, label: s.name }))} />
                )}
                {actions.length > 1 && <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove action" onClick={() => setActions((x) => x.filter((_, j) => j !== i))}><Trash2 /></Button>}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setActions((x) => [...x, { type: "notify_project_lead", param: "" }])}><Plus /> Add action</Button>
          </fieldset>
          <Button type="submit" disabled={!valid}>Create automation</Button>
        </form>
      )}
    </div>
  );
}
