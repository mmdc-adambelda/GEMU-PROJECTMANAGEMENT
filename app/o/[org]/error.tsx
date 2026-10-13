"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function OrgError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-24 text-center">
      <h1 className="text-lg font-semibold">This page could not be loaded</h1>
      <p className="text-sm text-muted-foreground">
        Something went wrong while loading your data. Please try again.{error.digest ? ` (ref: ${error.digest})` : ""}
      </p>
      {/* Production builds mask server error messages; in development show the real one to speed up debugging. */}
      {process.env.NODE_ENV !== "production" && error.message && (
        <pre className="max-h-48 w-full overflow-auto rounded-md border bg-muted p-3 text-left text-xs">{error.message}</pre>
      )}
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
