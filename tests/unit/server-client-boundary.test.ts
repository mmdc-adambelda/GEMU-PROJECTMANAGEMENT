import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";

/**
 * Regression test for a production-only crash: a Server Component imported a helper (`orgPath`) from a
 * "use client" module and called it, which React forbids ("Attempted to call orgPath() from the server").
 * `tsc` cannot see this, so we check the import boundary directly.
 */
const root = process.cwd();
const SKIP = new Set(["node_modules", ".next", ".git", "tests", "supabase", "scripts", "docs", ".claude"]);

function walk(dir: string, out: string[] = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const isClient = (src: string) => /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(src);

function resolveImport(from: string, spec: string) {
  const base = spec.startsWith("@/") ? join(root, spec.slice(2)) : join(dirname(from), spec);
  return [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")].find(existsSync) ?? null;
}

it("server modules never import non-component values from 'use client' modules", () => {
  const problems: string[] = [];
  for (const file of walk(root)) {
    const src = readFileSync(file, "utf8");
    if (isClient(src)) continue;
    for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g)) {
      if (m[1]) continue;
      const target = resolveImport(file, m[3]);
      if (!target || !isClient(readFileSync(target, "utf8"))) continue;
      for (const raw of m[2].split(",").map((s) => s.trim()).filter(Boolean)) {
        if (raw.startsWith("type ")) continue;
        const name = raw.split(/\s+as\s+/)[0];
        // components (PascalCase) may be rendered by the server; everything else would be called on the server
        if (!/^[A-Z]/.test(name) || /^[A-Z0-9_]+$/.test(name)) problems.push(`${file.replace(root, "")} imports "${name}" from ${m[3]}`);
      }
    }
  }
  expect(problems).toEqual([]);
});
