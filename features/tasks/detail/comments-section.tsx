"use client";

import { CornerDownRight, Pencil, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/app/markdown";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addCommentAction, deleteCommentAction, editCommentAction } from "@/features/tasks/actions";
import { runAction } from "@/lib/hooks/use-run-action";
import { fmtDateTime, timeAgo } from "@/lib/utils/dates";
import type { TaskComment } from "@/types";
import { personLabel, type DetailEnv } from "./env";

/** Textarea that offers @mention suggestions and inserts [@Name](user:<uuid>) tokens. */
function MentionBox({
  value, onChange, members, placeholder, rows = 3, label, onSubmit,
}: {
  value: string; onChange: (v: string) => void; members: DetailEnv["members"]; placeholder: string; rows?: number; label: string; onSubmit?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null);
  const matches = useMemo(
    () => (query ? members.filter((m) => personLabel(m).toLowerCase().includes(query.text.toLowerCase())).slice(0, 5) : []),
    [query, members],
  );

  function detect(text: string, caret: number) {
    const m = /(^|\s)@([\w.\- ]{0,30})$/.exec(text.slice(0, caret));
    setQuery(m ? { start: caret - m[2].length - 1, text: m[2] } : null);
  }

  function pick(m: DetailEnv["members"][number]) {
    if (!query) return;
    const caret = ref.current?.selectionStart ?? value.length;
    const token = `[@${personLabel(m)}](user:${m.id}) `;
    onChange(value.slice(0, query.start) + token + value.slice(caret));
    setQuery(null);
    requestAnimationFrame(() => ref.current?.focus());
  }

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        aria-label={label}
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={20000}
        onChange={(e) => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart); }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSubmit?.();
          if (e.key === "Escape") setQuery(null);
        }}
      />
      {matches.length > 0 && (
        <ul role="listbox" aria-label="Mention suggestions" className="absolute z-20 mt-1 w-64 rounded-md border bg-popover p-1 shadow-md">
          {matches.map((m) => (
            <li key={m.id} role="option" aria-selected={false}>
              <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent" onMouseDown={(e) => { e.preventDefault(); pick(m); }}>
                <UserAvatar name={m.full_name} email={m.email} src={m.avatar_url} className="size-5" /> {personLabel(m)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentItem({
  c, env, replies, onChanged, onReply,
}: { c: TaskComment; env: DetailEnv; replies: TaskComment[]; onChanged: () => void; onReply: (id: string) => void }) {
  const author = env.members.find((m) => m.id === c.author_id);
  const mine = c.author_id === env.userId;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body);
  const canDelete = mine || env.canManage;
  return (
    <li className="flex gap-3">
      <UserAvatar name={author?.full_name} email={author?.email} src={author?.avatar_url} className="mt-0.5 size-7" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium">{personLabel(author)}</span>
          <time dateTime={c.created_at} title={fmtDateTime(c.created_at)} className="text-xs text-muted-foreground">{timeAgo(c.created_at)}</time>
          {c.edited_at && <span className="text-xs text-muted-foreground">(edited)</span>}
        </div>
        {editing ? (
          <div className="mt-1 space-y-2">
            <MentionBox label="Edit comment" value={text} onChange={setText} members={env.members} placeholder="" />
            <div className="flex gap-2">
              <Button size="sm" onClick={async () => { const r = await runAction(() => editCommentAction(c.id, text), false); if (r.ok) { setEditing(false); onChanged(); } }}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(c.body); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Markdown>{c.body}</Markdown>
        )}
        {!editing && (
          <div className="mt-0.5 flex gap-1 text-xs text-muted-foreground">
            {!c.parent_id && <Button variant="ghost" size="xs" onClick={() => onReply(c.id)}><CornerDownRight /> Reply</Button>}
            {mine && <Button variant="ghost" size="xs" onClick={() => setEditing(true)}><Pencil /> Edit</Button>}
            {canDelete && (
              <Button variant="ghost" size="xs" onClick={async () => { const r = await runAction(() => deleteCommentAction(c.id)); if (r.ok) onChanged(); }}><Trash2 /> Delete</Button>
            )}
          </div>
        )}
        {replies.length > 0 && (
          <ul className="mt-3 space-y-3 border-l pl-4">
            {replies.map((r) => <CommentItem key={r.id} c={r} env={env} replies={[]} onChanged={onChanged} onReply={onReply} />)}
          </ul>
        )}
      </div>
    </li>
  );
}

export function CommentsSection({ taskId, comments, env, onChanged }: { taskId: string; comments: TaskComment[]; env: DetailEnv; onChanged: () => void }) {
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const roots = comments.filter((c) => !c.parent_id);
  const repliesOf = (id: string) => comments.filter((c) => c.parent_id === id);
  const replyTarget = replyTo ? comments.find((c) => c.id === replyTo) : null;

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    const r = await runAction(() => addCommentAction({ taskId, body, parentId: replyTo }), false);
    setBusy(false);
    if (r.ok) { setBody(""); setReplyTo(null); onChanged(); }
  }

  return (
    <section aria-labelledby="comments-h" className="space-y-4">
      <h3 id="comments-h" className="text-sm font-semibold">Comments <span className="font-normal text-muted-foreground">({comments.length})</span></h3>
      {roots.length === 0 && <p className="text-sm text-muted-foreground">No comments yet. Start the conversation.</p>}
      <ul className="space-y-5">
        {roots.map((c) => <CommentItem key={c.id} c={c} env={env} replies={repliesOf(c.id)} onChanged={onChanged} onReply={setReplyTo} />)}
      </ul>
      <div className="space-y-2">
        {replyTarget && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            Replying to {personLabel(env.members.find((m) => m.id === replyTarget.author_id))}
            <Button variant="ghost" size="xs" onClick={() => setReplyTo(null)}>Cancel</Button>
          </p>
        )}
        <MentionBox label="Write a comment" value={body} onChange={setBody} members={env.members} placeholder="Write a comment… use @ to mention someone (Ctrl+Enter to send)" onSubmit={send} />
        <div className="flex justify-end">
          <Button size="sm" disabled={busy || !body.trim()} onClick={send}>Comment</Button>
        </div>
      </div>
    </section>
  );
}
