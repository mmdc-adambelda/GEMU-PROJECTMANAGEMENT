"use client";

import { Bold, Code, Italic, Link2, List, ListOrdered, Quote } from "lucide-react";
import { useRef, useState } from "react";
import { Markdown } from "@/components/app/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Wrap = { before: string; after?: string; placeholder: string; block?: boolean };
const TOOLS: Array<{ label: string; icon: typeof Bold; wrap: Wrap }> = [
  { label: "Bold", icon: Bold, wrap: { before: "**", after: "**", placeholder: "bold text" } },
  { label: "Italic", icon: Italic, wrap: { before: "_", after: "_", placeholder: "italic text" } },
  { label: "Code", icon: Code, wrap: { before: "`", after: "`", placeholder: "code" } },
  { label: "Link", icon: Link2, wrap: { before: "[", after: "](https://)", placeholder: "link text" } },
  { label: "Bulleted list", icon: List, wrap: { before: "- ", placeholder: "item", block: true } },
  { label: "Numbered list", icon: ListOrdered, wrap: { before: "1. ", placeholder: "item", block: true } },
  { label: "Quote", icon: Quote, wrap: { before: "> ", placeholder: "quote", block: true } },
];

/** Markdown textarea with a small formatting toolbar and a live preview tab. */
export function MarkdownEditor({
  value, onChange, rows = 6, placeholder, id, "aria-label": ariaLabel,
}: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; id?: string; "aria-label"?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");

  function apply(w: Wrap) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = value.slice(s, e) || w.placeholder;
    const lead = w.block && s > 0 && value[s - 1] !== "\n" ? "\n" : "";
    const next = value.slice(0, s) + lead + w.before + sel + (w.after ?? "") + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const start = s + lead.length + w.before.length;
      el.setSelectionRange(start, start + sel.length);
    });
  }

  return (
    <div className="rounded-lg border focus-within:ring-2 focus-within:ring-ring/50">
      <div className="flex items-center gap-0.5 border-b bg-muted/30 px-1.5 py-1">
        <div className="mr-2 inline-flex rounded-md border p-0.5 text-xs" role="tablist" aria-label="Editor mode">
          {(["write", "preview"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={cn("rounded px-2 py-0.5 capitalize", tab === t ? "bg-background shadow-xs" : "text-muted-foreground")}>{t}</button>
          ))}
        </div>
        {tab === "write" && TOOLS.map((t) => (
          <Button key={t.label} type="button" variant="ghost" size="icon-xs" aria-label={t.label} title={t.label} onClick={() => apply(t.wrap)}>
            <t.icon />
          </Button>
        ))}
      </div>
      {tab === "write" ? (
        <Textarea
          id={id}
          ref={ref}
          aria-label={ariaLabel}
          rows={rows}
          value={value}
          placeholder={placeholder}
          maxLength={50000}
          onChange={(e) => onChange(e.target.value)}
          className="resize-y rounded-none border-0 shadow-none focus-visible:ring-0"
        />
      ) : (
        <div className="min-h-24 p-3">{value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-muted-foreground">Nothing to preview.</p>}</div>
      )}
    </div>
  );
}
