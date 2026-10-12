import { beforeAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, asUserTx, expectDenied } from "./harness";
import { buildWorld, type World } from "./world";

let w: World;
beforeAll(async () => {
  w = await buildWorld();
});

const newTask = async (user: string, project: string, title: string, extra = "") =>
  (await asUser<{ id: string }>(w.db, user, `insert into public.tasks (project_id, title${extra ? ", " + extra.split("=")[0] : ""}) values ($1, $2${extra ? ", " + extra.split("=")[1] : ""}) returning id`, [project, title]))[0].id;

describe("task keys", () => {
  it("are sequential per project, readable and unique", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) ids.push(await newTask(w.u.alice, w.projDev, `Task ${i}`));
    const rows = await asAdmin<{ key: string; number: number }>(w.db, `select key, number from public.tasks where project_id = $1 order by number`, [w.projDev]);
    expect(rows.map((r) => r.number)).toEqual(rows.map((_, i) => i + 1));
    expect(rows[0].key).toBe("DEV-1");
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    // numbering is independent per project
    const [first] = await asAdmin<{ key: string }>(w.db, `select key from public.tasks where project_id = $1 order by number limit 1`, [w.projSec]);
    expect(first.key).toBe("SEC-1");
  });

  it("cannot be forged or changed by clients", async () => {
    await expectDenied(asUser(w.db, w.u.alice, `update public.tasks set key = 'HACK-1' where id = $1`, [w.taskA]), /permission denied/);
    await expectDenied(asUser(w.db, w.u.alice, `update public.tasks set org_id = $1 where id = $2`, [w.orgB, w.taskA]), /permission denied/);
    await expectDenied(asUser(w.db, w.u.alice, `insert into public.tasks (project_id, title, number) values ($1, 'x', 99)`, [w.projDev]), /permission denied/);
  });

  it("moving a task to another project assigns a new key and logs it", async () => {
    const [p2] = await asUser<{ id: string }>(w.db, w.u.alice, `insert into public.projects (space_id, name, key) values ($1, 'Ops', 'OPS') returning id`, [w.spaceA]);
    const id = await newTask(w.u.alice, w.projDev, "Movable");
    const [moved] = await asUser<{ key: string }>(w.db, w.u.alice, `update public.tasks set project_id = $1 where id = $2 returning key`, [p2.id, id]);
    expect(moved.key).toBe("OPS-1");
    // cannot move into a project you cannot edit / see
    await expectDenied(asUser(w.db, w.u.bob, `update public.tasks set project_id = $1 where id = $2`, [w.projSec, id]));
    await expectDenied(asUser(w.db, w.u.alice, `update public.tasks set project_id = $1 where id = $2`, [w.projB, id]));
  });
});

describe("workflow transitions", () => {
  it("default workflow is seeded per space from data", async () => {
    const rows = await asUser<{ name: string; category: string; is_default: boolean }>(w.db, w.u.bob,
      `select name, category, is_default from public.workflow_statuses where space_id = $1 order by position`, [w.spaceA]);
    expect(rows.map((r) => r.name)).toEqual(["Backlog", "To Do", "In Progress", "In Review", "Blocked", "Done", "Cancelled"]);
    expect(rows.filter((r) => r.is_default).map((r) => r.name)).toEqual(["To Do"]);
  });

  it("new tasks start in the default status and stamp completion time", async () => {
    const id = await newTask(w.u.bob, w.projDev, "Flow");
    const [t] = await asAdmin<{ status_id: string; completed_at: string | null }>(w.db, `select status_id, completed_at from public.tasks where id = $1`, [id]);
    expect(t.status_id).toBe(w.statusA["To Do"]);
    expect(t.completed_at).toBeNull();
    const [done] = await asUser<{ completed_at: string | null }>(w.db, w.u.bob, `update public.tasks set status_id = $1 where id = $2 returning completed_at`, [w.statusA["Done"], id]);
    expect(done.completed_at).not.toBeNull();
    const [reopened] = await asUser<{ completed_at: string | null }>(w.db, w.u.bob, `update public.tasks set status_id = $1 where id = $2 returning completed_at`, [w.statusA["In Progress"], id]);
    expect(reopened.completed_at).toBeNull();
  });

  it("enforces configured transitions and required fields", async () => {
    // To Do may only move to In Progress; In Progress -> Done requires an assignee + resolution
    await asUser(w.db, w.u.alice, `insert into public.workflow_transitions (space_id, from_status_id, to_status_id) values ($1, $2, $3)`,
      [w.spaceA, w.statusA["To Do"], w.statusA["In Progress"]]);
    await asUser(w.db, w.u.alice, `insert into public.workflow_transitions (space_id, from_status_id, to_status_id, required_fields) values ($1, $2, $3, '{assignee,resolution}')`,
      [w.spaceA, w.statusA["In Progress"], w.statusA["Done"]]);
    await asUser(w.db, w.u.alice, `insert into public.workflow_transitions (space_id, from_status_id, to_status_id) values ($1, $2, $3)`,
      [w.spaceA, w.statusA["In Progress"], w.statusA["To Do"]]);

    const id = await newTask(w.u.alice, w.projDev, "Strict");
    await expectDenied(asUser(w.db, w.u.alice, `update public.tasks set status_id = $1 where id = $2`, [w.statusA["Done"], id]), /not allowed/);
    await asUser(w.db, w.u.alice, `update public.tasks set status_id = $1 where id = $2`, [w.statusA["In Progress"], id]);
    await expectDenied(asUser(w.db, w.u.alice, `update public.tasks set status_id = $1 where id = $2`, [w.statusA["Done"], id]), /required/);
    await asUser(w.db, w.u.alice, `update public.tasks set status_id = $1, assignee_id = $2, resolution = 'Fixed' where id = $3`, [w.statusA["Done"], w.u.bob, id]);
    // statuses without outgoing rules (Done) stay unrestricted
    await asUser(w.db, w.u.alice, `update public.tasks set status_id = $1 where id = $2`, [w.statusA["Backlog"], id]);
  });

  it("rejects statuses from another workflow", async () => {
    const [foreign] = await asAdmin<{ id: string }>(w.db, `select id from public.workflow_statuses where space_id = $1 limit 1`, [w.spaceB]);
    await expectDenied(asUser(w.db, w.u.alice, `update public.tasks set status_id = $1 where id = $2`, [foreign.id, w.taskA]), /workflow/);
    await expectDenied(asUser(w.db, w.u.alice, `insert into public.tasks (project_id, title, status_id) values ($1, 'x', $2)`, [w.projDev, foreign.id]), /workflow/);
  });

  it("only space managers can edit workflows", async () => {
    await expectDenied(asUser(w.db, w.u.bob, `insert into public.workflow_statuses (space_id, name) values ($1, 'Sneaky')`, [w.spaceA]));
    const [s] = await asUser<{ id: string }>(w.db, w.u.alice, `insert into public.workflow_statuses (space_id, name, category, color) values ($1, 'QA', 'in_progress', '#f59e0b') returning id`, [w.spaceA]);
    expect(s.id).toBeTruthy();
  });

  it("a status that is in use cannot be deleted without reassigning its tasks", async () => {
    const [s] = await asUser<{ id: string }>(w.db, w.u.alice, `insert into public.workflow_statuses (space_id, name) values ($1, 'Temp') returning id`, [w.spaceA]);
    const [t] = await asUser<{ id: string }>(w.db, w.u.alice, `insert into public.tasks (project_id, title, status_id) values ($1, 'In Temp', $2) returning id`, [w.projDev, s.id]);

    await expectDenied(asUser(w.db, w.u.alice, `delete from public.workflow_statuses where id = $1`, [s.id]), /foreign key|violates/);
    await expectDenied(asUser(w.db, w.u.alice, `select public.delete_status($1)`, [s.id]), /still use/);
    await expectDenied(asUser(w.db, w.u.bob, `select public.delete_status($1, $2)`, [s.id, w.statusA["Backlog"]]), /Not allowed/);
    await asUser(w.db, w.u.alice, `select public.delete_status($1, $2)`, [s.id, w.statusA["Backlog"]]);
    const [moved] = await asAdmin<{ status_id: string }>(w.db, `select status_id from public.tasks where id = $1`, [t.id]);
    expect(moved.status_id).toBe(w.statusA["Backlog"]);
  });

  it("the default status cannot be deleted", async () => {
    await expectDenied(asUser(w.db, w.u.alice, `select public.delete_status($1)`, [w.statusA["To Do"]]), /default/);
    await expectDenied(asUser(w.db, w.u.alice, `delete from public.workflow_statuses where id = $1`, [w.statusA["To Do"]]), /default/);
  });
});

describe("hierarchy and dependencies", () => {
  it("subtasks must live in the same project; parent cycles are rejected", async () => {
    const parent = await newTask(w.u.alice, w.projDev, "Parent");
    const [child] = await asUser<{ id: string }>(w.db, w.u.alice, `insert into public.tasks (project_id, title, parent_id) values ($1, 'Child', $2) returning id`, [w.projDev, parent]);
    await expectDenied(asUser(w.db, w.u.alice, `insert into public.tasks (project_id, title, parent_id) values ($1, 'Bad', $2)`, [w.projSec, parent]), /same project/);
    await expectDenied(asUser(w.db, w.u.alice, `update public.tasks set parent_id = $1 where id = $2`, [child.id, parent]), /Invalid parent/);
  });

  it("dependencies cannot form cycles", async () => {
    const a = await newTask(w.u.alice, w.projDev, "A");
    const b = await newTask(w.u.alice, w.projDev, "B");
    await asUser(w.db, w.u.alice, `insert into public.task_dependencies (task_id, blocked_by_task_id) values ($1, $2)`, [a, b]);
    await expectDenied(asUser(w.db, w.u.alice, `insert into public.task_dependencies (task_id, blocked_by_task_id) values ($1, $2)`, [b, a]), /cycle/);
    await expectDenied(asUser(w.db, w.u.alice, `insert into public.task_dependencies (task_id, blocked_by_task_id) values ($1, $1)`, [a]));
  });
});

describe("custom fields", () => {
  const defs: Record<string, string> = {};
  beforeAll(async () => {
    const mk = async (name: string, type: string, options = "[]") =>
      (await asUser<{ id: string }>(w.db, w.u.alice,
        `insert into public.custom_field_definitions (org_id, space_id, name, field_type, options) values ($1, $2, $3, $4::public.custom_field_type, $5::jsonb) returning id`,
        [w.orgA, w.spaceA, name, type, options]))[0].id;
    defs.text = await mk("Notes", "text");
    defs.number = await mk("Points", "number");
    defs.date = await mk("Review date", "date");
    defs.check = await mk("Customer facing", "checkbox");
    defs.select = await mk("Severity", "select", '["S1","S2"]');
    defs.multi = await mk("Platforms", "multi_select", '["web","ios"]');
    defs.url = await mk("Link", "url");
  });

  const set = (field: string, value: unknown) =>
    asUser(w.db, w.u.alice, `insert into public.task_custom_field_values (task_id, field_id, value) values ($1, $2, $3::jsonb)
                              on conflict (task_id, field_id) do update set value = excluded.value`, [w.taskA, defs[field], JSON.stringify(value)]);

  it("accepts valid values for every type", async () => {
    await set("text", "hello");
    await set("number", 5);
    await set("date", "2026-12-31");
    await set("check", true);
    await set("select", "S1");
    await set("multi", ["web", "ios"]);
    await set("url", "https://example.com/x");
  });

  it("rejects invalid values on the server", async () => {
    await expectDenied(set("number", "five"), /number/);
    await expectDenied(set("date", "tomorrow"), /date/);
    await expectDenied(set("date", "2026-13-45"));
    await expectDenied(set("check", "yes"), /true or false/);
    await expectDenied(set("select", "S9"), /options/);
    await expectDenied(set("multi", ["web", "android"]), /options/);
    await expectDenied(set("url", "javascript:alert(1)"), /URL/);
    await expectDenied(set("text", "x".repeat(2001)), /2000/);
  });

  it("rejects fields from another organization and admin-only definition changes", async () => {
    const [other] = await asUser<{ id: string }>(w.db, w.u.dave,
      `insert into public.custom_field_definitions (org_id, name, field_type) values ($1, 'Secret', 'text') returning id`, [w.orgB]);
    await expectDenied(asUser(w.db, w.u.alice, `insert into public.task_custom_field_values (task_id, field_id, value) values ($1, $2, '"x"')`, [w.taskA, other.id]));
    await expectDenied(asUser(w.db, w.u.bob, `insert into public.custom_field_definitions (org_id, space_id, name, field_type) values ($1, $2, 'Nope', 'text')`, [w.orgA, w.spaceA]));
    await expectDenied(asUser(w.db, w.u.alice, `insert into public.custom_field_definitions (org_id, space_id, name, field_type) values ($1, $2, 'Cross', 'text')`, [w.orgB, w.spaceA]));
  });
});

describe("automations", () => {
  it("only space managers can create rules, and actions are validated", async () => {
    await expectDenied(asUser(w.db, w.u.bob, `insert into public.automation_rules (org_id, space_id, name, trigger_type, actions) values ($1,$2,'x','task_created','[{"type":"set_priority","priority":"high"}]')`, [w.orgA, w.spaceA]));
    await expectDenied(asUser(w.db, w.u.alice, `insert into public.automation_rules (org_id, space_id, name, trigger_type, actions) values ($1,$2,'x','task_created','[{"type":"run_sql","sql":"drop table tasks"}]')`, [w.orgA, w.spaceA]), /Invalid automation/);
    await expectDenied(asUser(w.db, w.u.alice, `insert into public.automation_rules (org_id, space_id, name, trigger_type, actions) values ($1,$2,'x','task_created','[]')`, [w.orgA, w.spaceA]), /Invalid automation/);
  });

  it("assigns new tasks, escalates on status change, and completes parents", async () => {
    await asUser(w.db, w.u.alice, `insert into public.automation_rules (org_id, space_id, name, trigger_type, actions) values ($1,$2,'Triage','task_created',$3::jsonb)`,
      [w.orgA, w.spaceA, JSON.stringify([{ type: "assign_user", user_id: w.u.frank }])]);
    await asUser(w.db, w.u.alice, `insert into public.automation_rules (org_id, space_id, name, trigger_type, conditions, actions) values ($1,$2,'Review ping','status_changed',$3::jsonb,$4::jsonb)`,
      [w.orgA, w.spaceA, JSON.stringify({ to_status_id: w.statusA["In Review"] }), JSON.stringify([{ type: "notify_project_lead" }, { type: "set_priority", priority: "high" }])]);
    await asUser(w.db, w.u.alice, `insert into public.automation_rules (org_id, space_id, name, trigger_type, actions) values ($1,$2,'Close parent','subtasks_completed',$3::jsonb)`,
      [w.orgA, w.spaceA, JSON.stringify([{ type: "set_status", status_id: w.statusA["Done"] }])]);
    // the earlier workflow test restricted transitions; clear them for a free-flowing board here
    await asAdmin(w.db, `delete from public.workflow_transitions where space_id = $1`, [w.spaceA]);

    const t = await newTask(w.u.bob, w.projDev, "Auto me");
    const [row] = await asAdmin<{ assignee_id: string }>(w.db, `select assignee_id from public.tasks where id = $1`, [t]);
    expect(row.assignee_id).toBe(w.u.frank);

    await asUser(w.db, w.u.bob, `update public.tasks set status_id = $1 where id = $2`, [w.statusA["In Review"], t]);
    const [after] = await asAdmin<{ priority: string }>(w.db, `select priority from public.tasks where id = $1`, [t]);
    expect(after.priority).toBe("high");
    expect(await asUser(w.db, w.u.alice, `select 1 from public.notifications where task_id = $1 and title like 'Automation%'`, [t])).toHaveLength(1);

    const parent = await newTask(w.u.alice, w.projDev, "Epic-ish");
    const kids: string[] = [];
    for (let i = 0; i < 2; i++) kids.push((await asUser<{ id: string }>(w.db, w.u.alice, `insert into public.tasks (project_id, title, parent_id) values ($1, 'kid', $2) returning id`, [w.projDev, parent]))[0].id);
    await asUser(w.db, w.u.alice, `update public.tasks set status_id = $1 where id = $2`, [w.statusA["Done"], kids[0]]);
    expect((await asAdmin<{ status_id: string }>(w.db, `select status_id from public.tasks where id = $1`, [parent]))[0].status_id).not.toBe(w.statusA["Done"]);
    await asUser(w.db, w.u.alice, `update public.tasks set status_id = $1 where id = $2`, [w.statusA["Done"], kids[1]]);
    expect((await asAdmin<{ status_id: string }>(w.db, `select status_id from public.tasks where id = $1`, [parent]))[0].status_id).toBe(w.statusA["Done"]);

    const runs = await asUser<{ outcome: string }>(w.db, w.u.alice, `select outcome from public.automation_executions`);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((r) => r.outcome === "success")).toBe(true);
    expect(await asUser(w.db, w.u.bob, `select 1 from public.automation_executions`)).toHaveLength(0);
  });

  it("scheduled job notifies overdue and due-soon assignees exactly once per day", async () => {
    const [{ id }] = await asUser<{ id: string }>(w.db, w.u.alice,
      `insert into public.tasks (project_id, title, assignee_id, due_date) values ($1, 'Late', $2, current_date - 2) returning id`, [w.projDev, w.u.bob]);
    await asAdmin(w.db, `select private.run_scheduled_jobs()`);
    await asAdmin(w.db, `select private.run_scheduled_jobs()`);
    const rows = await asUser(w.db, w.u.bob, `select 1 from public.notifications where task_id = $1 and type = 'overdue'`, [id]);
    expect(rows).toHaveLength(1);
    await expectDenied(asUser(w.db, w.u.bob, `select private.run_scheduled_jobs()`), /permission denied/);
  });
});

describe("search, stats and duplication", () => {
  it("search only returns what the caller may see", async () => {
    const mine = await asUser<{ search_org: any }>(w.db, w.u.alice, `select public.search_org($1, 'secret')`, [w.orgA]);
    expect(mine[0].search_org.tasks.length).toBeGreaterThan(0);
    const bob = await asUser<{ search_org: any }>(w.db, w.u.bob, `select public.search_org($1, 'secret')`, [w.orgA]);
    expect(bob[0].search_org.tasks).toHaveLength(0);
    expect(bob[0].search_org.projects).toHaveLength(0);
    const dave = await asUser<{ search_org: any }>(w.db, w.u.dave, `select public.search_org($1, 'first')`, [w.orgA]);
    expect(dave[0].search_org.tasks).toHaveLength(0);
    expect(dave[0].search_org.people).toHaveLength(0);
    const key = await asUser<{ search_org: any }>(w.db, w.u.alice, `select public.search_org($1, 'DEV-1')`, [w.orgA]);
    expect(key[0].search_org.tasks[0].key).toBe("DEV-1");
  });

  it("dashboard stats are scoped to the viewer's access", async () => {
    const [a] = await asUser<{ dashboard_stats: any }>(w.db, w.u.alice, `select public.dashboard_stats($1)`, [w.orgA]);
    const [b] = await asUser<{ dashboard_stats: any }>(w.db, w.u.bob, `select public.dashboard_stats($1)`, [w.orgA]);
    const [d] = await asUser<{ dashboard_stats: any }>(w.db, w.u.dave, `select public.dashboard_stats($1)`, [w.orgA]);
    const total = (s: any) => s.by_status.reduce((n: number, x: any) => n + x.count, 0);
    expect(total(a.dashboard_stats)).toBeGreaterThan(total(b.dashboard_stats)); // alice also sees the private space
    expect(total(d.dashboard_stats)).toBe(0);
    expect(a.dashboard_stats.created_vs_completed).toHaveLength(14);
  });

  it("project progress is derived from real task data", async () => {
    const [s] = await asUser<{ total_tasks: string; done_tasks: string; progress_pct: number }>(w.db, w.u.alice,
      `select total_tasks::int, done_tasks::int, progress_pct from public.project_stats where project_id = $1`, [w.projDev]);
    const [chk] = await asAdmin<{ t: string; d: string }>(w.db,
      `select count(*)::int t, count(*) filter (where s.category = 'done')::int d from public.tasks k join public.workflow_statuses s on s.id = k.status_id where k.project_id = $1 and k.archived_at is null`, [w.projDev]);
    expect(Number(s.total_tasks)).toBe(Number(chk.t));
    expect(Number(s.done_tasks)).toBe(Number(chk.d));
    expect(s.progress_pct).toBe(Math.round((100 * Number(chk.d)) / Number(chk.t)));
    expect(await asUser(w.db, w.u.dave, `select 1 from public.project_stats where project_id = $1`, [w.projDev])).toHaveLength(0);
  });

  it("duplicating a task or project runs as the caller (RLS applies)", async () => {
    const [{ duplicate_task: copy }] = await asUser<{ duplicate_task: string }>(w.db, w.u.alice, `select public.duplicate_task($1)`, [w.taskA]);
    const [c] = await asAdmin<{ title: string; key: string }>(w.db, `select title, key from public.tasks where id = $1`, [copy]);
    expect(c.title).toBe("First task (copy)");
    await expectDenied(asUser(w.db, w.u.bob, `select public.duplicate_task($1)`, [w.taskSec]), /not found/);
    const [{ duplicate_project: np }] = await asUser<{ duplicate_project: string }>(w.db, w.u.alice,
      `select public.duplicate_project($1, 'Dev copy', 'DEV2', true)`, [w.projDev]);
    const [{ n }] = await asAdmin<{ n: string }>(w.db, `select count(*)::int n from public.tasks where project_id = $1`, [np]);
    expect(Number(n)).toBeGreaterThan(5);
  });
});

describe("time tracking and watchers", () => {
  it("users log time only as themselves on tasks they can edit", async () => {
    await asUser(w.db, w.u.bob, `insert into public.time_entries (task_id, user_id, minutes) values ($1, $2, 90)`, [w.taskA, w.u.bob]);
    await expectDenied(asUser(w.db, w.u.bob, `insert into public.time_entries (task_id, user_id, minutes) values ($1, $2, 90)`, [w.taskA, w.u.alice]));
    await expectDenied(asUser(w.db, w.u.bob, `insert into public.time_entries (task_id, user_id, minutes) values ($1, $2, 90)`, [w.taskSec, w.u.bob]));
    await expectDenied(asUser(w.db, w.u.bob, `insert into public.time_entries (task_id, user_id, minutes) values ($1, $2, -5)`, [w.taskA, w.u.bob]));
  });

  it("users can watch/unwatch visible tasks but not force others onto hidden ones", async () => {
    await asUser(w.db, w.u.bob, `insert into public.task_watchers (task_id, user_id) values ($1, $2) on conflict do nothing`, [w.taskA, w.u.bob]);
    await asUser(w.db, w.u.bob, `delete from public.task_watchers where task_id = $1 and user_id = $2`, [w.taskA, w.u.bob]);
    await expectDenied(asUser(w.db, w.u.bob, `insert into public.task_watchers (task_id, user_id) values ($1, $2)`, [w.taskSec, w.u.bob]));
  });

  it("comments can only be edited by their author", async () => {
    const [c] = await asUser<{ id: string }>(w.db, w.u.bob, `insert into public.task_comments (task_id, author_id, body) values ($1, $2, 'mine') returning id`, [w.taskA, w.u.bob]);
    expect(await asUser(w.db, w.u.alice, `update public.task_comments set body = 'edited' where id = $1 returning id`, [c.id])).toHaveLength(0);
    const [e] = await asUser<{ edited_at: string | null }>(w.db, w.u.bob, `update public.task_comments set body = 'edited' where id = $1 returning edited_at`, [c.id]);
    expect(e.edited_at).not.toBeNull();
    await expectDenied(asUser(w.db, w.u.bob, `insert into public.task_comments (task_id, author_id, body) values ($1, $2, 'spoof')`, [w.taskA, w.u.alice]));
  });
});

describe("upsert patterns used by the app (PostgREST semantics)", () => {
  it("membership and custom-field upserts work for managers but cannot re-key rows", async () => {
    const up = (project: string, user: string, role: string) =>
      asUser(w.db, w.u.alice,
        `insert into public.project_members (project_id, user_id, role) values ($1, $2, $3::public.project_role)
         on conflict (project_id, user_id) do update set project_id = excluded.project_id, user_id = excluded.user_id, role = excluded.role`,
        [project, user, role]);
    await up(w.projDev, w.u.bob, "viewer");
    await up(w.projDev, w.u.bob, "member");
    const [row] = await asAdmin<{ role: string }>(w.db, `select role from public.project_members where project_id = $1 and user_id = $2`, [w.projDev, w.u.bob]);
    expect(row.role).toBe("member");
    // a plain UPDATE that moves the row to another user/project is rejected by the immutability trigger
    await expectDenied(asUser(w.db, w.u.alice, `update public.project_members set user_id = $1 where project_id = $2 and user_id = $3`, [w.u.frank, w.projDev, w.u.bob]), /cannot be changed/);
    // non-managers cannot upsert
    await expectDenied(asUser(w.db, w.u.bob,
      `insert into public.project_members (project_id, user_id, role) values ($1, $2, 'lead')
       on conflict (project_id, user_id) do update set role = excluded.role`, [w.projDev, w.u.bob]));
    await asUser(w.db, w.u.alice, `delete from public.project_members where project_id = $1 and user_id = $2`, [w.projDev, w.u.bob]);
  });

  it("limits invitation volume per organization", async () => {
    for (let i = 0; i < 47; i++) {
      await asUser(w.db, w.u.alice, `select * from public.create_invitation($1, $2, 'member')`, [w.orgA, `bulk${i}@acme.test`]);
    }
    await expectDenied(asUser(w.db, w.u.alice, `select * from public.create_invitation($1, 'overflow@acme.test', 'member')`, [w.orgA]), /Too many/);
  });
});

describe("reports", () => {
  it("workload covers org members and only counts what the caller can see", async () => {
    const rep = async (u: string) =>
      asUser<{ user_id: string; open_tasks: string; overdue_tasks: string }>(w.db, u, `select * from public.workload_report($1)`, [w.orgA]);
    const alice = await rep(w.u.alice);
    expect(alice.map((r) => r.user_id)).toContain(w.u.bob);
    const bobRow = alice.find((r) => r.user_id === w.u.bob)!;
    expect(Number(bobRow.open_tasks)).toBeGreaterThan(0);
    expect(Number(bobRow.overdue_tasks)).toBeGreaterThan(0); // the "Late" task from the scheduler test
    expect((await rep(w.u.dave))).toHaveLength(0);
  });

  it("throughput and burndown return one row per day and respect access", async () => {
    const t = await asUser<{ day: string; created: string }>(w.db, w.u.alice, `select * from public.throughput_report($1, 14)`, [w.orgA]);
    expect(t).toHaveLength(14);
    expect(t.reduce((n, r) => n + Number(r.created), 0)).toBeGreaterThan(0);
    const b = await asUser<{ remaining: string; scope: string }>(w.db, w.u.alice, `select * from public.project_burndown($1, 10)`, [w.projDev]);
    expect(b).toHaveLength(10);
    expect(Number(b[9].scope)).toBeGreaterThanOrEqual(Number(b[9].remaining));
    const hidden = await asUser<{ scope: string }>(w.db, w.u.dave, `select * from public.project_burndown($1, 5)`, [w.projDev]);
    expect(hidden.every((r) => Number(r.scope) === 0)).toBe(true);
  });

  it("cycle time reports completed work per project", async () => {
    const rows = await asUser<{ project_key: string; completed: string }>(w.db, w.u.alice, `select * from public.cycle_time_report($1)`, [w.orgA]);
    const dev = rows.find((r) => r.project_key === "DEV")!;
    expect(Number(dev.completed)).toBeGreaterThan(0);
    expect(await asUser(w.db, w.u.dave, `select * from public.cycle_time_report($1)`, [w.orgA])).toHaveLength(0);
  });
});

describe("capability probes", () => {
  it("report what the caller can do using the policy functions", async () => {
    const acc = async (u: string, p: string) => (await asUser<{ project_access: any }>(w.db, u, `select public.project_access($1)`, [p]))[0].project_access;
    expect(await acc(w.u.alice, w.projDev)).toEqual({ can_view: true, can_edit: true, can_manage: true });
    expect(await acc(w.u.bob, w.projDev)).toMatchObject({ can_view: true, can_edit: true, can_manage: false });
    expect(await acc(w.u.bob, w.projSec)).toEqual({ can_view: false, can_edit: false, can_manage: false });
    expect(await acc(w.u.dave, w.projDev)).toEqual({ can_view: false, can_edit: false, can_manage: false });
    const [s] = await asUser<{ space_access: any }>(w.db, w.u.bob, `select public.space_access($1)`, [w.spaceA]);
    expect(s.space_access).toMatchObject({ can_view: true, can_manage: false, can_create_project: true });
  });
});

describe("transactional integrity", () => {
  it("numbers stay consistent when a task insert fails and rolls back", async () => {
    const before = (await asAdmin<{ n: number }>(w.db, `select next_task_number n from public.projects where id = $1`, [w.projDev]))[0].n;
    await expectDenied(asUserTx(w.db, w.u.alice, async (q) => {
      await q(`insert into public.tasks (project_id, title) values ($1, 'ok')`, [w.projDev]);
      await q(`insert into public.tasks (project_id, title) values ($1, '')`, [w.projDev]); // violates title check
    }));
    const after = (await asAdmin<{ n: number }>(w.db, `select next_task_number n from public.projects where id = $1`, [w.projDev]))[0].n;
    expect(after).toBe(before);
  });
});
