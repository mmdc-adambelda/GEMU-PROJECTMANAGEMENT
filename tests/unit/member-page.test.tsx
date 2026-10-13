import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const uid = "eef49210-c634-4d18-897a-3d0ed96c3d5b";

// Rows shaped like the live database returns them through PostgREST.
const tables: Record<string, unknown> = {
  organization_members: {
    role: "owner",
    status: "active",
    profiles: { id: uid, full_name: "adam", email: "adam@example.test", avatar_url: null, job_title: null, timezone: "UTC" },
  },
  tasks: [
    {
      id: "t1", key: "OPS-1", title: "Email Campaign", due_date: "2026-10-16", priority: "medium", completed_at: null,
      status: { name: "In Progress", color: "#3b82f6", category: "in_progress" }, project: { key: "OPS", name: "Operations" },
    },
  ],
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      const chain = new Proxy(q, {
        get(_t, prop) {
          if (prop === "then") return (res: (v: unknown) => void) => res({ data: tables[table] ?? null, error: null });
          return () => chain;
        },
      });
      return chain;
    },
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  getOrgContext: async () => ({ org: { id: "o1", slug: "rrs", name: "RRS" }, role: "owner" }),
  getProfile: async () => ({ id: uid, timezone: "UTC", full_name: "adam" }),
}));
vi.mock("@/lib/data/stats", () => ({
  getWorkload: async () => [{ user_id: uid, open_tasks: 1, overdue_tasks: 0, completed_30d: 0, open_estimate_minutes: 0, logged_30d_minutes: 0 }],
}));

describe("team member page", () => {
  it("renders with realistic data", async () => {
    const mod = await import("@/app/o/[org]/team/[userId]/page");
    const el = await mod.default({ params: Promise.resolve({ org: "rrs", userId: uid }) } as never);
    const html = renderToString(el);
    expect(html).toContain("OPS-1");
    expect(html).toContain("adam");
  });
});
