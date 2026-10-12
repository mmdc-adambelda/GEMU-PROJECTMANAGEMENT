"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">An unexpected error occurred. You can try again; if it keeps happening, contact your administrator.{error.digest ? ` (ref: ${error.digest})` : ""}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
