import { describe, expect, it } from "vitest";
import { asAdmin, createDb } from "./harness";

describe("migrations", () => {
  it("apply cleanly and enable RLS on every public table", async () => {
    const db = await createDb();
    const rows = await asAdmin<{ tablename: string }>(
      db,
      `select c.relname as tablename from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });
});
