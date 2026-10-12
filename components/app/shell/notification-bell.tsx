"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { orgPath, useShell } from "@/components/app/shell/shell-context";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * Unread badge kept fresh with Supabase Realtime. Realtime honours RLS, so a user only ever
 * receives rows from `notifications` that belong to them.
 */
export function NotificationBell() {
  const { org, data, profile } = useShell();
  const router = useRouter();
  // server value is authoritative; realtime inserts add to it until the next refresh brings a new base
  const [live, setLive] = useState({ base: data.unread, extra: 0 });
  if (live.base !== data.unread) setLive({ base: data.unread, extra: 0 });
  const unread = live.base + live.extra;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` },
        (payload) => {
          setLive((l) => ({ ...l, extra: l.extra + 1 }));
          toast(String((payload.new as { title?: string }).title ?? "New notification"));
          router.refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile.id, router]);

  return (
    <Button variant="ghost" size="icon" render={<Link href={orgPath(org.slug, "/inbox")} />} aria-label={`Inbox, ${unread} unread`}>
      <span className="relative">
        <Bell />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </span>
    </Button>
  );
}
