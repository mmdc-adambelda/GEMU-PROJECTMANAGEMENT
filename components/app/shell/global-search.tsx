"use client";

import { FolderKanban, Layers, ListChecks, Search, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { orgPath, useShell } from "@/components/app/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { createClient } from "@/lib/supabase/client";

interface Results {
  tasks: Array<{ id: string; key: string; title: string }>;
  projects: Array<{ id: string; key: string; name: string }>;
  spaces: Array<{ id: string; name: string }>;
  people: Array<{ id: string; full_name: string; email: string }>;
}
const EMPTY: Results = { tasks: [], projects: [], spaces: [], people: [] };

export function GlobalSearch() {
  const { org } = useShell();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; res: Results }>({ q: "", res: EMPTY });
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      // Runs as the signed-in user: RLS decides what comes back.
      const { data, error } = await createClient().rpc("search_org", { p_org: org.id, p_query: q });
      if (id !== seq.current) return;
      setFound({ q, res: error ? EMPTY : { ...EMPTY, ...(data as Partial<Results>) } });
    }, 200);
    return () => clearTimeout(t);
  }, [q, org.id]);

  const active = q.trim().length >= 2;
  const res = active && found.q === q ? found.res : EMPTY;
  const loading = active && found.q !== q;

  function go(path: string) {
    setOpen(false);
    setQ("");
    router.push(path);
  }

  const empty = !loading && active && Object.values(res).every((a) => a.length === 0);

  return (
    <>
      <Button
        variant="outline"
        className="w-full max-w-sm justify-start gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
        aria-label="Search"
      >
        <Search />
        <span className="hidden flex-1 text-left sm:inline">Search tasks, projects, people…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search tasks, projects, spaces and people">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by key, title or name…" value={q} onValueChange={setQ} />
          <CommandList>
            {q.trim().length < 2 && <p className="p-4 text-center text-sm text-muted-foreground">Type at least 2 characters.</p>}
            {loading && <p className="p-4 text-center text-sm text-muted-foreground">Searching…</p>}
            {empty && <CommandEmpty>No results for “{q}”.</CommandEmpty>}
            {res.tasks.length > 0 && (
              <CommandGroup heading="Tasks">
                {res.tasks.map((t) => (
                  <CommandItem key={t.id} value={`task-${t.id}`} onSelect={() => go(orgPath(org.slug, `/t/${t.key}`))}>
                    <ListChecks />
                    <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                    <span className="truncate">{t.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {res.projects.length > 0 && (
              <CommandGroup heading="Projects">
                {res.projects.map((p) => (
                  <CommandItem key={p.id} value={`project-${p.id}`} onSelect={() => go(orgPath(org.slug, `/p/${p.key}`))}>
                    <FolderKanban />
                    <span className="font-mono text-xs text-muted-foreground">{p.key}</span>
                    {p.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {res.spaces.length > 0 && (
              <CommandGroup heading="Spaces">
                {res.spaces.map((s) => (
                  <CommandItem key={s.id} value={`space-${s.id}`} onSelect={() => go(orgPath(org.slug, `/spaces/${s.id}`))}>
                    <Layers />
                    {s.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {res.people.length > 0 && (
              <CommandGroup heading="People">
                {res.people.map((u) => (
                  <CommandItem key={u.id} value={`user-${u.id}`} onSelect={() => go(orgPath(org.slug, `/team/${u.id}`))}>
                    <User />
                    {u.full_name || u.email}
                    <span className="text-xs text-muted-foreground">{u.email}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
