import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-semibold text-primary">404</p>
      <h1 className="text-xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="text-sm text-muted-foreground">It may not exist, or you may not have access to it.</p>
      <Button render={<Link href="/" />}>Go home</Button>
    </div>
  );
}
