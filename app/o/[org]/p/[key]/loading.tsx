import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-label="Loading project">
      <div className="flex items-center gap-3"><Skeleton className="size-9 rounded-md" /><div className="space-y-2"><Skeleton className="h-5 w-48" /><Skeleton className="h-3 w-32" /></div></div>
      <Skeleton className="h-9 w-full max-w-lg" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-72 shrink-0 space-y-2 rounded-xl bg-muted/50 p-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
