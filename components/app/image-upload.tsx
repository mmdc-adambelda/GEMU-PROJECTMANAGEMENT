"use client";

import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * Uploads an image straight to a Storage bucket from the browser. Storage RLS decides whether the
 * signed-in user may write to `<folder>/…`; size and MIME type are also enforced by the bucket itself.
 */
export function ImageUpload({
  bucket, folder, currentUrl, onChange, label, shape = "square", allowSvg = false, fallback,
}: {
  bucket: "avatars" | "org-logos";
  folder: string;
  currentUrl: string | null;
  onChange: (url: string | null) => Promise<void> | void;
  label: string;
  shape?: "square" | "round";
  allowSvg?: boolean;
  fallback?: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    const okTypes = allowSvg ? [...TYPES, "image/svg+xml"] : TYPES;
    if (!okTypes.includes(file.type)) return toast.error("Use a PNG, JPEG, WebP or GIF image.");
    if (file.size > MAX_BYTES) return toast.error("Images can be at most 2 MB.");
    setBusy(true);
    try {
      const supabase = createClient();
      const ext = file.type.split("/")[1].replace("svg+xml", "svg").replace("jpeg", "jpg");
      const path = `${folder}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      await onChange(data.publicUrl);
    } catch (e) {
      toast.error((e as Error).message || "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const rounded = shape === "round" ? "rounded-full" : "rounded-xl";
  return (
    <div className="flex items-center gap-4">
      <div className={`flex size-16 shrink-0 items-center justify-center overflow-hidden border bg-muted ${rounded}`}>
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentUrl} alt="" className="size-full object-cover" />
        ) : (
          (fallback ?? <ImagePlus className="size-6 text-muted-foreground" />)
        )}
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{label}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            {currentUrl ? "Replace" : "Upload"}
          </Button>
          {currentUrl && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onChange(null)}>
              <Trash2 /> Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPEG, WebP or GIF · up to 2 MB</p>
      </div>
      <input
        ref={input}
        type="file"
        accept={(allowSvg ? [...TYPES, "image/svg+xml"] : TYPES).join(",")}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </div>
  );
}
