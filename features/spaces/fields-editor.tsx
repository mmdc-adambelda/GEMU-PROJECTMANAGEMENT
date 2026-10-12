"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field } from "@/components/app/form-field";
import { SimpleSelect } from "@/components/app/simple-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCustomFieldAction, deleteCustomFieldAction } from "@/features/spaces/actions";
import { runAction } from "@/lib/hooks/use-run-action";
import type { CustomFieldDefinition, CustomFieldType } from "@/types";

const TYPES: Array<{ value: CustomFieldType; label: string }> = [
  { value: "text", label: "Text" }, { value: "number", label: "Number" }, { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" }, { value: "select", label: "Single select" },
  { value: "multi_select", label: "Multi select" }, { value: "url", label: "URL" },
];

export function FieldsEditor({
  orgId, spaceId, fields, canManage, isOrgAdmin,
}: { orgId: string; spaceId: string; fields: CustomFieldDefinition[]; canManage: boolean; isOrgAdmin: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [options, setOptions] = useState("");
  const [scope, setScope] = useState<"space" | "org">("space");
  const needsOptions = type === "select" || type === "multi_select";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Custom fields</h2>
        <p className="text-sm text-muted-foreground">
          Extra data on every task in this space. Values are validated by the database against the field type, so bad data cannot get in through any route.
        </p>
      </div>
      {fields.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No custom fields yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {fields.map((f) => (
            <li key={f.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{f.name}</p>
                <p className="text-xs text-muted-foreground">
                  {TYPES.find((t) => t.value === f.field_type)?.label}
                  {f.options.length ? ` · ${f.options.join(", ")}` : ""} · {f.space_id ? "This space" : "Whole organization"}
                </p>
              </div>
              {(f.space_id ? canManage : isOrgAdmin) && (
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${f.name}`}
                  onClick={async () => { if (confirm(`Delete “${f.name}” and all its values?`)) { const r = await runAction(() => deleteCustomFieldAction(f.id)); if (r.ok) router.refresh(); } }}><Trash2 /></Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <form className="space-y-3 rounded-xl border p-4" onSubmit={async (e) => {
          e.preventDefault();
          const r = await runAction(() => createCustomFieldAction({
            orgId, spaceId: scope === "space" ? spaceId : null, name, fieldType: type,
            options: needsOptions ? options.split(",").map((o) => o.trim()).filter(Boolean) : [],
          }));
          if (r.ok) { setName(""); setOptions(""); router.refresh(); }
        }}>
          <h3 className="text-sm font-semibold">Add a field</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name" htmlFor="cf-name"><Input id="cf-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Type" htmlFor="cf-type"><SimpleSelect id="cf-type" className="w-full" value={type} onChange={setType} options={TYPES} /></Field>
            {isOrgAdmin && (
              <Field label="Available in" htmlFor="cf-scope">
                <SimpleSelect id="cf-scope" className="w-full" value={scope} onChange={setScope}
                  options={[{ value: "space", label: "This space" }, { value: "org", label: "Whole organization" }]} />
              </Field>
            )}
          </div>
          {needsOptions && (
            <Field label="Options" htmlFor="cf-options" hint="Comma-separated, e.g. Low, Medium, High">
              <Input id="cf-options" value={options} onChange={(e) => setOptions(e.target.value)} />
            </Field>
          )}
          <Button type="submit" variant="outline" disabled={!name.trim()}><Plus /> Add field</Button>
        </form>
      )}
    </div>
  );
}
