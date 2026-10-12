"use client";

import { Download, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteAttachmentAction, getAttachmentUrlAction, recordAttachmentAction } from "@/features/tasks/actions";
import { runAction } from "@/lib/hooks/use-run-action";
import { createClient } from "@/lib/supabase/client";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MIME_ALLOWLIST } from "@/lib/validations/domain";
import { timeAgo } from "@/lib/utils/dates";
import type { TaskAttachment } from "@/types";
import { personLabel, type DetailEnv } from "./env";

const fmtSize = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_").slice(-80);

export function AttachmentsSection({
  taskId, attachments, env, onChanged,
}: { taskId: string; attachments: TaskAttachment[]; env: DetailEnv; onChanged: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const supabase = createClient();
    for (const file of Array.from(files)) {
      if (!ATTACHMENT_MIME_ALLOWLIST.includes(file.type)) { toast.error(`${file.name}: this file type is not allowed.`); continue; }
      if (file.size > ATTACHMENT_MAX_BYTES) { toast.error(`${file.name}: files can be at most 25 MB.`); continue; }
      // Private bucket; path layout <org>/<task>/<uuid>-<name> is what the storage policies authorise against.
      const path = `${env.orgId}/${taskId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error } = await supabase.storage.from("attachments").upload(path, file, { contentType: file.type, upsert: false });
      if (error) { toast.error(`${file.name}: ${error.message}`); continue; }
      await runAction(() => recordAttachmentAction({ taskId, storagePath: path, fileName: file.name, mimeType: file.type, sizeBytes: file.size }));
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    onChanged();
  }

  async function open(id: string) {
    const r = await getAttachmentUrlAction(id);
    if (!r.ok) return toast.error(r.error);
    window.open(r.data.url, "_blank", "noopener,noreferrer");
  }

  return (
    <section aria-labelledby="att-h" className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 id="att-h" className="text-sm font-semibold">Attachments <span className="font-normal text-muted-foreground">({attachments.length})</span></h3>
        {env.canEdit && (
          <>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? <Loader2 className="animate-spin" /> : <Paperclip />} Attach
            </Button>
            <input ref={input} type="file" multiple className="sr-only" tabIndex={-1} accept={ATTACHMENT_MIME_ALLOWLIST.join(",")} onChange={(e) => upload(e.target.files)} />
          </>
        )}
      </div>
      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files attached.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 p-2.5">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.file_name}</p>
                <p className="text-xs text-muted-foreground">{fmtSize(a.size_bytes)} · {personLabel(env.members.find((m) => m.id === a.uploaded_by))} · {timeAgo(a.created_at)}</p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={`Download ${a.file_name}`} onClick={() => open(a.id)}><Download /></Button>
              {(env.canManage || a.uploaded_by === env.userId) && env.canEdit && (
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${a.file_name}`}
                  onClick={async () => { const r = await runAction(() => deleteAttachmentAction(a.id)); if (r.ok) onChanged(); }}><Trash2 /></Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
