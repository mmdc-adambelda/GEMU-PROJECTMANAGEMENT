#!/usr/bin/env node
/**
 * Creates a clearly labelled DEMO organization ("Demo Co (sample data)") with a few users, one workspace,
 * two spaces, two projects and a handful of tasks. Development / evaluation only.
 *
 *   npm run seed:demo -- --yes
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and
 * SUPABASE_SERVICE_ROLE_KEY (server-only; used here solely to create the demo auth users).
 * Everything else is done as those users through RLS, exactly like the app does.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!process.argv.includes("--yes")) {
  console.error(`This will create demo users and data in ${url}.\nRe-run with --yes to confirm.`);
  process.exit(1);
}

const PASSWORD = process.env.DEMO_PASSWORD || "DemoPassw0rd!2026";
const admin = createClient(url, service, { auth: { persistSession: false } });

const people = [
  { email: "demo.owner@example.test", name: "Olivia Owner", role: "owner" },
  { email: "demo.member@example.test", name: "Mateo Member", role: "member" },
  { email: "demo.guest@example.test", name: "Gwen Guest", role: "guest" },
];

async function ensureUser(p) {
  const { data, error } = await admin.auth.admin.createUser({
    email: p.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: p.name },
  });
  if (error && !/already/i.test(error.message)) throw error;
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email: p.email, password: PASSWORD });
  if (e2) throw e2;
  return { client, id: s.user.id, created: Boolean(data?.user) };
}

const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

const users = {};
for (const p of people) users[p.role] = { ...(await ensureUser(p)), ...p };
const owner = users.owner.client;

const existing = await owner.from("organizations").select("id").eq("slug", "demo-co").maybeSingle();
if (existing.data) {
  console.log("Demo organization already exists - nothing to do.");
  process.exit(0);
}

const orgId = must(await owner.rpc("create_organization", { p_name: "Demo Co (sample data)", p_slug: "demo-co" }), "create org");
// add the other demo users directly (service role bypasses the invitation flow; this is seed data only)
for (const r of ["member", "guest"]) {
  must(await admin.from("organization_members").insert({ org_id: orgId, user_id: users[r].id, role: r }), "add member");
}

const ws = must(await owner.from("workspaces").insert({ org_id: orgId, name: "Main workspace" }).select("id").single(), "workspace");
const dev = must(await owner.from("spaces").insert({ workspace_id: ws.id, name: "Software Development", color: "#3b82f6", icon: "code" }).select("id").single(), "space");
const ops = must(await owner.from("spaces").insert({ workspace_id: ws.id, name: "IT Operations", color: "#10b981", icon: "server" }).select("id").single(), "space");
const web = must(await owner.from("projects").insert({ space_id: dev.id, name: "Website relaunch", key: "WEB", template: "software", description: "Sample project" }).select("id").single(), "project");
const inf = must(await owner.from("projects").insert({ space_id: ops.id, name: "Infrastructure", key: "OPS", template: "it_ops" }).select("id").single(), "project");

const statuses = must(await owner.from("workflow_statuses").select("id, name").eq("space_id", dev.id), "statuses");
const st = Object.fromEntries(statuses.map((s) => [s.name, s.id]));
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const member = users.member.id;

const tasks = [
  { title: "Design the new landing page", status: "In Progress", priority: "high", type: "story", assignee: member, due: day(3), start: day(-2) },
  { title: "Fix broken checkout redirect", status: "In Review", priority: "highest", type: "bug", assignee: member, due: day(-1), start: day(-4) },
  { title: "Migrate blog content", status: "To Do", priority: "medium", type: "task", due: day(10), start: day(2) },
  { title: "Set up analytics", status: "Backlog", priority: "low", type: "task" },
  { title: "Launch announcement", status: "Done", priority: "medium", type: "task", assignee: member },
];
for (const t of tasks) {
  must(await owner.from("tasks").insert({
    project_id: web.id, title: t.title, status_id: st[t.status], priority: t.priority, type: t.type,
    assignee_id: t.assignee ?? null, due_date: t.due ?? null, start_date: t.start ?? null,
  }), "task");
}
must(await owner.from("tasks").insert({ project_id: inf.id, title: "Rotate database credentials", priority: "high", type: "task" }), "task");
// the guest only sees the website project
must(await owner.from("project_members").insert({ project_id: web.id, user_id: users.guest.id, role: "viewer" }), "guest access");

console.log("Demo data created.\nLog in with any of:");
for (const p of people) console.log(`  ${p.email}  /  ${PASSWORD}   (${p.role})`);
