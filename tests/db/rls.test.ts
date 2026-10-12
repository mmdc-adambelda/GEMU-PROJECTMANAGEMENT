import { beforeAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, expectDenied } from "./harness";
import { buildWorld, invite, type World } from "./world";

let w: World;
beforeAll(async () => {
  w = await buildWorld();
});

const count = async (user: string, table: string, where = "true") =>
  Number((await asUser<{ n: string }>(w.db, user, `select count(*)::int as n from public.${table} where ${where}`))[0].n);

describe("organization isolation", () => {
  it("User A cannot read User B's private organization data", async () => {
    for (const t of ["organizations", "workspaces", "spaces", "projects", "tasks", "organization_members", "activity_log"]) {
      const orgCol = t === "organizations" ? "id" : "org_id";
      expect(await count(w.u.dave, t, `${orgCol} = '${w.orgA}'`), `dave reading ${t} of org A`).toBe(0);
      expect(await count(w.u.alice, t, `${orgCol} = '${w.orgB}'`), `alice reading ${t} of org B`).toBe(0);
    }
  });

  it("a user with no organization sees nothing", async () => {
    for (const t of ["organizations", "workspaces", "spaces", "projects", "tasks", "workflow_statuses", "labels", "notifications"]) {
      expect(await count(w.u.eve, t), t).toBe(0);
    }
  });

  it("cannot write into another organization", async () => {
    await expectDenied(asUser(w.db, w.u.dave, `insert into public.workspaces (org_id, name) values ($1, 'x')`, [w.orgA]));
    await expectDenied(asUser(w.db, w.u.dave, `insert into public.tasks (project_id, title) values ($1, 'x')`, [w.projDev]));
    await expectDenied(asUser(w.db, w.u.dave, `insert into public.spaces (workspace_id, name) values ($1, 'x')`, [w.wsA]));
    const upd = await asUser(w.db, w.u.dave, `update public.tasks set title = 'pwned' where id = $1 returning id`, [w.taskA]);
    expect(upd).toHaveLength(0);
    const del = await asUser(w.db, w.u.dave, `delete from public.projects where id = $1 returning id`, [w.projDev]);
    expect(del).toHaveLength(0);
    const [t] = await asAdmin<{ title: string }>(w.db, `select title from public.tasks where id = $1`, [w.taskA]);
    expect(t.title).toBe("First task");
  });

  it("cannot inject foreign ids through child tables", async () => {
    // a comment on someone else's task
    await expectDenied(asUser(w.db, w.u.dave, `insert into public.task_comments (task_id, author_id, body) values ($1, $2, 'hi')`, [w.taskA, w.u.dave]));
    // assigning an outsider is rejected
    await expectDenied(asUser(w.db, w.u.alice, `update public.tasks set assignee_id = $1 where id = $2`, [w.u.dave, w.taskA]), /access/);
    // adding an outsider as project member is rejected
    await expectDenied(asUser(w.db, w.u.alice, `insert into public.project_members (project_id, user_id) values ($1, $2)`, [w.projDev, w.u.dave]));
  });

  it("profiles: users only see people they share an organization with", async () => {
    expect(await count(w.u.dave, "profiles", `id = '${w.u.alice}'`)).toBe(0);
    expect(await count(w.u.bob, "profiles", `id = '${w.u.alice}'`)).toBe(1);
    expect(await count(w.u.eve, "profiles")).toBe(1);
  });

  it("profiles: cannot edit someone else's profile or protected columns", async () => {
    const other = await asUser(w.db, w.u.bob, `update public.profiles set full_name = 'hacked' where id = $1 returning id`, [w.u.alice]);
    expect(other).toHaveLength(0);
    await expectDenied(asUser(w.db, w.u.bob, `update public.profiles set email = 'x@y.z' where id = $1`, [w.u.bob]), /permission denied/);
    await asUser(w.db, w.u.bob, `update public.profiles set job_title = 'Dev', timezone = 'Asia/Manila' where id = $1`, [w.u.bob]);
  });
});

describe("roles cannot be escalated", () => {
  it("a member cannot promote themselves to owner", async () => {
    const r = await asUser(w.db, w.u.bob,
      `update public.organization_members set role = 'owner' where user_id = $1 and org_id = $2 returning id`, [w.u.bob, w.orgA]);
    expect(r).toHaveLength(0);
    const [m] = await asAdmin<{ role: string }>(w.db, `select role from public.organization_members where user_id = $1 and org_id = $2`, [w.u.bob, w.orgA]);
    expect(m.role).toBe("member");
  });

  it("an admin cannot promote themselves or anyone else to owner", async () => {
    await expectDenied(asUser(w.db, w.u.frank,
      `update public.organization_members set role = 'owner' where user_id = $1 and org_id = $2`, [w.u.frank, w.orgA]), /own role|owners/);
    await expectDenied(asUser(w.db, w.u.frank,
      `update public.organization_members set role = 'owner' where user_id = $1 and org_id = $2`, [w.u.bob, w.orgA]), /owners/);
  });

  it("an admin cannot demote or remove the owner", async () => {
    await expectDenied(asUser(w.db, w.u.frank,
      `update public.organization_members set role = 'member' where user_id = $1 and org_id = $2`, [w.u.alice, w.orgA]), /owners/);
    await expectDenied(asUser(w.db, w.u.frank,
      `delete from public.organization_members where user_id = $1 and org_id = $2`, [w.u.alice, w.orgA]), /owners/);
  });

  it("members cannot insert themselves into an organization directly", async () => {
    await expectDenied(asUser(w.db, w.u.eve,
      `insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'owner')`, [w.orgA, w.u.eve]));
  });

  it("the last owner cannot leave or be demoted", async () => {
    await expectDenied(asUser(w.db, w.u.dave,
      `delete from public.organization_members where user_id = $1 and org_id = $2`, [w.u.dave, w.orgB]), /own|at least one/);
  });

  it("an owner can change other members' roles", async () => {
    const r = await asUser(w.db, w.u.alice,
      `update public.organization_members set role = 'admin' where user_id = $1 and org_id = $2 returning role`, [w.u.frank, w.orgA]);
    expect(r).toHaveLength(1);
  });

  it("only org admins may change organization settings", async () => {
    expect(await asUser(w.db, w.u.bob, `update public.organizations set name = 'Mine' where id = $1 returning id`, [w.orgA])).toHaveLength(0);
    expect(await asUser(w.db, w.u.frank, `update public.organizations set name = 'Acme Inc' where id = $1 returning id`, [w.orgA])).toHaveLength(1);
    expect(await asUser(w.db, w.u.frank, `delete from public.organizations where id = $1 returning id`, [w.orgA])).toHaveLength(0);
  });
});

describe("guests", () => {
  it("see nothing until something is explicitly shared with them", async () => {
    expect(await count(w.u.carol, "projects")).toBe(0);
    expect(await count(w.u.carol, "tasks")).toBe(0);
    expect(await count(w.u.carol, "workspaces")).toBe(0);
  });

  it("cannot perform administrator-only actions", async () => {
    await expectDenied(asUser(w.db, w.u.carol, `select * from public.create_invitation($1, 'x@y.test', 'member')`, [w.orgA]), /admins/);
    await expectDenied(asUser(w.db, w.u.carol, `insert into public.workspaces (org_id, name) values ($1, 'x')`, [w.orgA]));
    await expectDenied(asUser(w.db, w.u.carol, `insert into public.spaces (workspace_id, name) values ($1, 'x')`, [w.wsA]));
    await expectDenied(asUser(w.db, w.u.carol, `insert into public.projects (space_id, name, key) values ($1, 'x', 'XX')`, [w.spaceA]));
    expect(await asUser(w.db, w.u.carol, `update public.organization_members set role = 'admin' where user_id = $1 returning id`, [w.u.carol])).toHaveLength(0);
    expect(await asUser(w.db, w.u.carol, `update public.organizations set name = 'x' where id = $1 returning id`, [w.orgA])).toHaveLength(0);
  });

  it("see only shared projects, read-only unless granted a member role", async () => {
    await asUser(w.db, w.u.alice, `insert into public.project_members (project_id, user_id, role) values ($1, $2, 'viewer')`, [w.projDev, w.u.carol]);
    expect(await count(w.u.carol, "projects")).toBe(1);
    expect(await count(w.u.carol, "tasks")).toBe(1);
    expect(await count(w.u.carol, "tasks", `project_id = '${w.projSec}'`)).toBe(0);
    expect(await asUser(w.db, w.u.carol, `update public.tasks set title = 'edit' where id = $1 returning id`, [w.taskA])).toHaveLength(0);
    await expectDenied(asUser(w.db, w.u.carol, `insert into public.tasks (project_id, title) values ($1, 'new')`, [w.projDev]));

    await asUser(w.db, w.u.alice, `update public.project_members set role = 'member' where project_id = $1 and user_id = $2`, [w.projDev, w.u.carol]);
    await asUser(w.db, w.u.carol, `insert into public.tasks (project_id, title) values ($1, 'guest task')`, [w.projDev]);
    await asUser(w.db, w.u.alice, `delete from public.project_members where project_id = $1 and user_id = $2`, [w.projDev, w.u.carol]);
    expect(await count(w.u.carol, "tasks")).toBe(0);
  });
});

describe("project and space access", () => {
  it("private spaces hide their projects and tasks from regular members", async () => {
    expect(await count(w.u.bob, "projects", `id = '${w.projSec}'`)).toBe(0);
    expect(await count(w.u.bob, "tasks", `project_id = '${w.projSec}'`)).toBe(0);
    expect(await count(w.u.bob, "spaces", `id = '${w.spaceSecret}'`)).toBe(0);
    expect(await count(w.u.frank, "tasks", `project_id = '${w.projSec}'`)).toBe(1); // admins see everything
  });

  it("a user without project access cannot modify project tasks", async () => {
    expect(await asUser(w.db, w.u.bob, `update public.tasks set title = 'x' where id = $1 returning id`, [w.taskSec])).toHaveLength(0);
    await expectDenied(asUser(w.db, w.u.bob, `insert into public.tasks (project_id, title) values ($1, 'x')`, [w.projSec]));
    await expectDenied(asUser(w.db, w.u.bob, `insert into public.task_comments (task_id, author_id, body) values ($1, $2, 'x')`, [w.taskSec, w.u.bob]));
    expect(await asUser(w.db, w.u.bob, `delete from public.tasks where id = $1 returning id`, [w.taskSec])).toHaveLength(0);
  });

  it("members can work in visible projects but explicit viewers cannot edit", async () => {
    await asUser(w.db, w.u.bob, `update public.tasks set priority = 'high' where id = $1`, [w.taskA]);
    await asUser(w.db, w.u.alice, `insert into public.project_members (project_id, user_id, role) values ($1, $2, 'viewer')`, [w.projDev, w.u.bob]);
    expect(await asUser(w.db, w.u.bob, `update public.tasks set priority = 'low' where id = $1 returning id`, [w.taskA])).toHaveLength(0);
    expect(await count(w.u.bob, "tasks", `id = '${w.taskA}'`)).toBe(1);
    await asUser(w.db, w.u.alice, `delete from public.project_members where project_id = $1 and user_id = $2`, [w.projDev, w.u.bob]);
  });

  it("a removed member cannot continue accessing private project data", async () => {
    await asUser(w.db, w.u.alice, `insert into public.space_members (space_id, user_id) values ($1, $2)`, [w.spaceSecret, w.u.bob]);
    expect(await count(w.u.bob, "tasks", `project_id = '${w.projSec}'`)).toBe(1);
    await asUser(w.db, w.u.alice, `delete from public.space_members where space_id = $1 and user_id = $2`, [w.spaceSecret, w.u.bob]);
    expect(await count(w.u.bob, "tasks", `project_id = '${w.projSec}'`)).toBe(0);
  });

  it("a deactivated member loses all access immediately; reactivation restores it", async () => {
    await asUser(w.db, w.u.alice, `update public.organization_members set status = 'deactivated' where user_id = $1 and org_id = $2`, [w.u.bob, w.orgA]);
    expect(await count(w.u.bob, "tasks")).toBe(0);
    expect(await count(w.u.bob, "organizations")).toBe(0);
    expect(await asUser(w.db, w.u.bob, `update public.tasks set title = 'x' where id = $1 returning id`, [w.taskA])).toHaveLength(0);
    await asUser(w.db, w.u.alice, `update public.organization_members set status = 'active' where user_id = $1 and org_id = $2`, [w.u.bob, w.orgA]);
    expect(await count(w.u.bob, "tasks", `id = '${w.taskA}'`)).toBe(1);
  });

  it("workspace and project management is limited to authorized roles", async () => {
    await expectDenied(asUser(w.db, w.u.bob, `insert into public.workspaces (org_id, name) values ($1, 'mine')`, [w.orgA]));
    expect(await asUser(w.db, w.u.bob, `update public.projects set name = 'renamed' where id = $1 returning id`, [w.projDev])).toHaveLength(0);
    const [p] = await asUser<{ id: string }>(w.db, w.u.bob, `insert into public.projects (space_id, name, key) values ($1, 'Bob proj', 'BOB') returning id`, [w.spaceA]);
    // creator becomes lead and may manage it
    expect(await asUser(w.db, w.u.bob, `update public.projects set name = 'Bob project' where id = $1 returning id`, [p.id])).toHaveLength(1);
    // key must be unique inside the org
    await expectDenied(asUser(w.db, w.u.bob, `insert into public.projects (space_id, name, key) values ($1, 'dup', 'DEV')`, [w.spaceA]), /duplicate|unique/);
    // client cannot forge the org or key counters
    await expectDenied(asUser(w.db, w.u.bob, `update public.projects set org_id = $1 where id = $2`, [w.orgB, p.id]), /permission denied/);
    await expectDenied(asUser(w.db, w.u.bob, `update public.projects set next_task_number = 999 where id = $1`, [p.id]), /permission denied/);
  });
});

describe("invitations", () => {
  it("only admins can invite, and only owners can invite admins", async () => {
    await expectDenied(asUser(w.db, w.u.bob, `select * from public.create_invitation($1, 'n@x.test', 'member')`, [w.orgA]), /admins/);
    await expectDenied(asUser(w.db, w.u.frank, `select * from public.create_invitation($1, 'n@x.test', 'admin')`, [w.orgA]), /owners/);
    await expectDenied(asUser(w.db, w.u.alice, `select * from public.create_invitation($1, 'n@x.test', 'owner')`, [w.orgA]), /promote/);
  });

  it("can only be accepted by the invited address, once", async () => {
    const token = await invite(w.db, w.u.alice, w.orgA, "eve@nowhere.test", "member");
    await expectDenied(asUser(w.db, w.u.dave, `select public.accept_invitation($1)`, [token]), /different email/);
    await asUser(w.db, w.u.eve, `select public.accept_invitation($1)`, [token]);
    await expectDenied(asUser(w.db, w.u.eve, `select public.accept_invitation($1)`, [token]), /invalid|expired|used/);
    await asUser(w.db, w.u.alice, `delete from public.organization_members where user_id = $1 and org_id = $2`, [w.u.eve, w.orgA]);
  });

  it("rejects bogus, revoked and expired tokens", async () => {
    await expectDenied(asUser(w.db, w.u.eve, `select public.accept_invitation('nope')`), /invalid/);
    const t1 = await invite(w.db, w.u.alice, w.orgA, "eve@nowhere.test", "member");
    await asUser(w.db, w.u.alice, `update public.organization_invitations set revoked_at = now() where org_id = $1 and email = 'eve@nowhere.test' and accepted_at is null`, [w.orgA]);
    await expectDenied(asUser(w.db, w.u.eve, `select public.accept_invitation($1)`, [t1]), /invalid/);
    const t2 = await invite(w.db, w.u.alice, w.orgA, "eve@nowhere.test", "member");
    await asAdmin(w.db, `update public.organization_invitations set expires_at = now() - interval '1 day' where accepted_at is null and revoked_at is null`);
    await expectDenied(asUser(w.db, w.u.eve, `select public.accept_invitation($1)`, [t2]), /invalid|expired/);
  });

  it("tokens are stored hashed and invitations are hidden from non-admins", async () => {
    const token = await invite(w.db, w.u.alice, w.orgA, "eve@nowhere.test", "guest");
    const rows = await asAdmin<{ token_hash: string }>(w.db, `select token_hash from public.organization_invitations where token_hash = $1`, [token]);
    expect(rows).toHaveLength(0);
    expect(await count(w.u.bob, "organization_invitations")).toBe(0);
    expect(await count(w.u.frank, "organization_invitations")).toBeGreaterThan(0);
  });
});

describe("notifications", () => {
  it("are private to their recipient", async () => {
    const [{ id }] = await asUser<{ id: string }>(w.db, w.u.alice,
      `insert into public.tasks (project_id, title, assignee_id) values ($1, 'Notify me', $2) returning id`, [w.projDev, w.u.bob]);
    expect(await count(w.u.bob, "notifications", `task_id = '${id}' and type = 'assigned'`)).toBe(1);
    expect(await count(w.u.alice, "notifications", `task_id = '${id}'`)).toBe(0);
    expect(await count(w.u.dave, "notifications")).toBe(0);
    // cannot read or flip someone else's notification
    expect(await asUser(w.db, w.u.alice, `update public.notifications set read_at = now() where task_id = $1 returning id`, [id])).toHaveLength(0);
    expect(await asUser(w.db, w.u.bob, `update public.notifications set read_at = now() where task_id = $1 returning id`, [id])).toHaveLength(1);
  });

  it("hide task details once the recipient loses access", async () => {
    const [{ id }] = await asUser<{ id: string }>(w.db, w.u.alice,
      `insert into public.tasks (project_id, title) values ($1, 'Leaky') returning id`, [w.projSec]);
    await asUser(w.db, w.u.alice, `insert into public.space_members (space_id, user_id) values ($1, $2)`, [w.spaceSecret, w.u.bob]);
    await asUser(w.db, w.u.alice, `update public.tasks set assignee_id = $1 where id = $2`, [w.u.bob, id]);
    expect(await count(w.u.bob, "notifications", `task_id = '${id}'`)).toBe(1);
    await asUser(w.db, w.u.alice, `delete from public.space_members where space_id = $1 and user_id = $2`, [w.spaceSecret, w.u.bob]);
    expect(await count(w.u.bob, "notifications", `task_id = '${id}'`)).toBe(0);
  });

  it("are never created for users who cannot view the task", async () => {
    const before = await asAdmin<{ n: string }>(w.db, `select count(*)::int n from public.notifications where user_id = $1`, [w.u.bob]);
    const [{ id }] = await asUser<{ id: string }>(w.db, w.u.alice,
      `insert into public.tasks (project_id, title) values ($1, 'Private') returning id`, [w.projSec]);
    await asUser(w.db, w.u.alice, `insert into public.task_comments (task_id, author_id, body) values ($1, $2, $3)`,
      [id, w.u.alice, `hey [@Bob](user:${w.u.bob})`]);
    const after = await asAdmin<{ n: string }>(w.db, `select count(*)::int n from public.notifications where user_id = $1`, [w.u.bob]);
    expect(after[0].n).toBe(before[0].n);
  });

  it("deliver mentions and comments to watchers", async () => {
    await asUser(w.db, w.u.alice, `insert into public.task_comments (task_id, author_id, body) values ($1, $2, $3)`,
      [w.taskA, w.u.alice, `please look [@Bob](user:${w.u.bob})`]);
    expect(await count(w.u.bob, "notifications", `task_id = '${w.taskA}' and type = 'mention'`)).toBe(1);
    await asUser(w.db, w.u.bob, `insert into public.task_comments (task_id, author_id, body) values ($1, $2, 'on it')`, [w.taskA, w.u.bob]);
    expect(await count(w.u.alice, "notifications", `task_id = '${w.taskA}' and type = 'comment'`)).toBeGreaterThan(0);
  });

  it("respect per-type preferences", async () => {
    await asUser(w.db, w.u.bob, `update public.profiles set preferences = '{"notifications": {"assigned": false}}' where id = $1`, [w.u.bob]);
    const [{ id }] = await asUser<{ id: string }>(w.db, w.u.alice,
      `insert into public.tasks (project_id, title, assignee_id) values ($1, 'Muted', $2) returning id`, [w.projDev, w.u.bob]);
    expect(await count(w.u.bob, "notifications", `task_id = '${id}'`)).toBe(0);
    await asUser(w.db, w.u.bob, `update public.profiles set preferences = '{}' where id = $1`, [w.u.bob]);
  });
});

describe("activity log", () => {
  it("is written by the database, visible only with task access, and cannot be forged", async () => {
    await asUser(w.db, w.u.alice, `update public.tasks set priority = 'highest' where id = $1`, [w.taskA]);
    const rows = await asUser<{ action: string }>(w.db, w.u.bob, `select action from public.activity_log where task_id = $1`, [w.taskA]);
    expect(rows.map((r) => r.action)).toContain("task.priority_changed");
    expect(await count(w.u.dave, "activity_log", `task_id = '${w.taskA}'`)).toBe(0);
    await expectDenied(asUser(w.db, w.u.alice, `insert into public.activity_log (org_id, action) values ($1, 'forged')`, [w.orgA]));
  });
});

describe("private attachments (storage policies)", () => {
  let path: string;
  beforeAll(async () => {
    path = `${w.orgA}/${w.taskA}/${crypto.randomUUID()}-spec.pdf`;
    await asUser(w.db, w.u.alice, `insert into storage.objects (bucket_id, name, owner_id) values ('attachments', $1, $2)`, [path, w.u.alice]);
  });

  it("authorized users can read; other organizations cannot", async () => {
    expect(await asUser(w.db, w.u.bob, `select 1 from storage.objects where name = $1`, [path])).toHaveLength(1);
    expect(await asUser(w.db, w.u.dave, `select 1 from storage.objects where name = $1`, [path])).toHaveLength(0);
    expect(await asUser(w.db, w.u.eve, `select 1 from storage.objects where name = $1`, [path])).toHaveLength(0);
  });

  it("members without access to the project cannot read or upload", async () => {
    const secretPath = `${w.orgA}/${w.taskSec}/${crypto.randomUUID()}-plan.pdf`;
    await asUser(w.db, w.u.alice, `insert into storage.objects (bucket_id, name, owner_id) values ('attachments', $1, $2)`, [secretPath, w.u.alice]);
    expect(await asUser(w.db, w.u.bob, `select 1 from storage.objects where name = $1`, [secretPath])).toHaveLength(0);
    await expectDenied(asUser(w.db, w.u.bob, `insert into storage.objects (bucket_id, name, owner_id) values ('attachments', $1, $2)`, [`${w.orgA}/${w.taskSec}/${crypto.randomUUID()}-x.pdf`, w.u.bob]));
  });

  it("cannot be uploaded under a forged path or another org's prefix", async () => {
    await expectDenied(asUser(w.db, w.u.dave, `insert into storage.objects (bucket_id, name, owner_id) values ('attachments', $1, $2)`, [`${w.orgB}/${w.taskA}/${crypto.randomUUID()}-x`, w.u.dave]));
    await expectDenied(asUser(w.db, w.u.alice, `insert into storage.objects (bucket_id, name, owner_id) values ('attachments', $1, $2)`, [`${w.orgB}/${w.taskA}/${crypto.randomUUID()}-x`, w.u.alice]));
    await expectDenied(asUser(w.db, w.u.alice, `insert into storage.objects (bucket_id, name, owner_id) values ('attachments', 'garbage', $1)`, [w.u.alice]));
  });

  it("attachment metadata rows must match the task's storage prefix", async () => {
    await expectDenied(asUser(w.db, w.u.alice,
      `insert into public.task_attachments (task_id, uploaded_by, storage_path, file_name, size_bytes) values ($1, $2, $3, 'a', 1)`,
      [w.taskA, w.u.alice, `${w.orgB}/${w.taskB}/x`]));
    await asUser(w.db, w.u.alice,
      `insert into public.task_attachments (task_id, uploaded_by, storage_path, file_name, size_bytes) values ($1, $2, $3, 'a', 1)`,
      [w.taskA, w.u.alice, path]);
    expect(await count(w.u.dave, "task_attachments")).toBe(0);
  });

  it("avatars may only be written inside your own folder", async () => {
    await asUser(w.db, w.u.bob, `insert into storage.objects (bucket_id, name, owner_id) values ('avatars', $1, $2)`, [`${w.u.bob}/me.png`, w.u.bob]);
    await expectDenied(asUser(w.db, w.u.bob, `insert into storage.objects (bucket_id, name, owner_id) values ('avatars', $1, $2)`, [`${w.u.alice}/me.png`, w.u.bob]));
  });
});
