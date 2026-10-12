"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders user-written Markdown WITHOUT raw HTML (react-markdown escapes it), restricts link
 * protocols, and opens links safely. Mentions are stored as [@Name](user:<uuid>) and shown as chips.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-sm max-w-none text-sm leading-relaxed [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:my-1.5 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_table]:my-2 [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_ul]:ml-5 [&_ul]:list-disc", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => (/^(https?:|mailto:|user:|#|\/)/i.test(url) ? url : "")}
        components={{
          a({ href, children: kids }) {
            if (href?.startsWith("user:")) {
              return <span className="rounded bg-primary/10 px-1 font-medium text-primary">{kids}</span>;
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline underline-offset-2">
                {kids}
              </a>
            );
          },
          img: () => null, // no remote image loading from user content (tracking / mixed content)
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
