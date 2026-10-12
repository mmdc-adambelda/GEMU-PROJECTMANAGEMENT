"use client";

import { Tag } from "lucide-react";
import { useState } from "react";
import { SimpleSelect } from "@/components/app/simple-select";
import { LabelChip } from "@/components/app/task-chips";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createLabelAction, setCustomFieldValueAction, setTaskLabelsAction } from "@/features/tasks/actions";
import { ColorPicker } from "@/components/app/pickers";
import { runAction } from "@/lib/hooks/use-run-action";
import type { CustomFieldDefinition, Label } from "@/types";
import type { DetailEnv } from "./env";

export function LabelsPicker({
  taskId, selected, env, onChanged,
}: { taskId: string; selected: Label[]; env: DetailEnv; onChanged: () => void }) {
  const [labels, setLabels] = useState(env.labels);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const ids = selected.map((l) => l.id);

  async function toggle(id: string, on: boolean) {
    const next = on ? [...ids, id] : ids.filter((x) => x !== id);
    const r = await runAction(() => setTaskLabelsAction(taskId, next), false);
    if (r.ok) onChanged();
  }
  async function create() {
    if (!name.trim()) return;
    const r = await runAction(() => createLabelAction(env.orgId, name, color));
    if (!r.ok) return;
    setLabels((l) => [...l, r.data as Label]);
    setName("");
    await toggle(r.data.id, true);
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {selected.map((l) => <LabelChip key={l.id} label={l} />)}
      {env.canEdit && (
        <Popover>
          <PopoverTrigger render={<Button variant="ghost" size="xs" aria-label="Edit labels" />}><Tag /> {selected.length ? "" : "Add label"}</PopoverTrigger>
          <PopoverContent align="start" className="w-64 space-y-3">
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {labels.map((l) => (
                <li key={l.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
                    <Checkbox checked={ids.includes(l.id)} onCheckedChange={(c) => toggle(l.id, Boolean(c))} />
                    <LabelChip label={l} />
                  </label>
                </li>
              ))}
              {labels.length === 0 && <li className="text-xs text-muted-foreground">No labels yet — create one below.</li>}
            </ul>
            <form className="space-y-2 border-t pt-2" onSubmit={(e) => { e.preventDefault(); void create(); }}>
              <Input aria-label="New label name" placeholder="New label…" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              <ColorPicker value={color} onChange={setColor} label="Label color" />
              <Button type="submit" size="sm" variant="outline" disabled={!name.trim()}>Create label</Button>
            </form>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function FieldEditor({
  def, value, disabled, onSave,
}: { def: CustomFieldDefinition; value: unknown; disabled: boolean; onSave: (v: unknown) => Promise<boolean> }) {
  const [draft, setDraft] = useState<string>(value === undefined || value === null ? "" : String(value));
  const id = `cf-${def.id}`;
  switch (def.field_type) {
    case "checkbox":
      return <Checkbox id={id} checked={value === true} disabled={disabled} onCheckedChange={(c) => onSave(Boolean(c))} aria-label={def.name} />;
    case "select":
      return (
        <SimpleSelect id={id} size="sm" className="w-full" disabled={disabled} value={typeof value === "string" ? value : "__none"}
          onChange={(v) => onSave(v === "__none" ? null : v)}
          options={[{ value: "__none", label: "—" }, ...def.options.map((o) => ({ value: o, label: o }))]} />
      );
    case "multi_select": {
      const cur = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {def.options.map((o) => (
            <label key={o} className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={cur.includes(o)} disabled={disabled}
                onCheckedChange={(c) => onSave(c ? [...cur, o] : cur.filter((x) => x !== o))} /> {o}
            </label>
          ))}
        </div>
      );
    }
    default: {
      const type = def.field_type === "number" ? "number" : def.field_type === "date" ? "date" : def.field_type === "url" ? "url" : "text";
      const commit = async () => {
        const raw = draft.trim();
        const current = value === undefined || value === null ? "" : String(value);
        if (raw === current) return;
        if (raw === "") { await onSave(null); return; }
        const ok = await onSave(def.field_type === "number" ? Number(raw) : raw);
        if (!ok) setDraft(current);
      };
      return (
        <Input id={id} type={type} size={1} aria-label={def.name} disabled={disabled} value={draft} onChange={(e) => setDraft(e.target.value)}
          onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} className="h-7 text-sm" />
      );
    }
  }
}

export function CustomFieldsSection({
  taskId, values, env, onChanged,
}: { taskId: string; values: Record<string, unknown>; env: DetailEnv; onChanged: () => void }) {
  if (env.fields.length === 0) return null;
  return (
    <>
      {env.fields.map((f) => (
        <div key={f.id} className="grid grid-cols-[7rem_1fr] items-center gap-2">
          <label htmlFor={`cf-${f.id}`} className="truncate text-xs text-muted-foreground" title={f.name}>{f.name}</label>
          <FieldEditor def={f} value={values[f.id]} disabled={!env.canEdit}
            onSave={async (v) => { const r = await runAction(() => setCustomFieldValueAction(taskId, f.id, v), false); if (r.ok) onChanged(); return r.ok; }} />
        </div>
      ))}
    </>
  );
}
