"use client";

import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { SidebarContent } from "@/components/app/shell/sidebar";
import { ShellProvider, useShell, type ShellContextValue } from "@/components/app/shell/shell-context";
import { Topbar } from "@/components/app/shell/topbar";
import { updatePreferencesAction } from "@/features/account/actions";
import { cn } from "@/lib/utils";

/** Applies the theme stored on the profile once, so it follows the user across devices. */
function ThemeSync() {
  const { profile } = useShell();
  const { setTheme } = useTheme();
  const saved = profile.preferences.theme;
  useEffect(() => {
    if (saved === "light" || saved === "dark" || saved === "system") setTheme(saved);
  }, [saved, setTheme]);
  return null;
}

function Frame({ initialCollapsed, children }: { initialCollapsed: boolean; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  return (
    <div className="flex min-h-dvh">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
          collapsed ? "w-[60px]" : "w-64",
        )}
        aria-label="Sidebar"
      >
        <SidebarContent
          collapsed={collapsed}
          onToggle={() => {
            const next = !collapsed;
            setCollapsed(next);
            void updatePreferencesAction({ sidebarCollapsed: next });
          }}
        />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

export function AppShell({
  value, initialCollapsed, children,
}: { value: ShellContextValue; initialCollapsed: boolean; children: ReactNode }) {
  return (
    <ShellProvider value={value}>
      <ThemeSync />
      <a
        href="#main"
        className="sr-only z-50 rounded bg-background px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
      >
        Skip to content
      </a>
      <Frame initialCollapsed={initialCollapsed}>{children}</Frame>
    </ShellProvider>
  );
}
