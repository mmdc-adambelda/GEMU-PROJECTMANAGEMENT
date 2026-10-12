import { asAdmin, asUser, createDb, createUser, type Db } from "./harness";

/**
 * A realistic multi-tenant fixture:
 *   Org Acme (A):  alice=owner, frank=admin, bob=member, carol=guest
 *     workspace "Engineering" -> space "Platform" (public) -> project DEV
 *                             -> space "Secret"   (private, alice only) -> project SEC
 *   Org Globex (B): dave=owner, with its own workspace/space/project/task
 *   eve: registered user who belongs to no organization
 */
export interface World {
  db: Db;
  u: { alice: string; frank: string; bob: string; carol: string; dave: string; eve: string };
  orgA: string;
  orgB: string;
  wsA: string;
  spaceA: string;
  spaceSecret: string;
  projDev: string;
  projSec: string;
  taskA: string; // DEV-1, reporter alice, assigned to bob
  taskSec: string;
  taskB: string;
  statusA: Record<string, string>; // by status name, space "Platform"
  wsB: string;
  spaceB: string;
  projB: string;
}

export async function invite(db: Db, adminId: string, org: string, email: string, role: string) {
  const [r] = await asUser<{ token: string }>(db, adminId, `select * from public.create_invitation($1, $2, $3::public.org_role)`, [org, email, role]);
  return r.token;
}

export async function join(db: Db, adminId: string, userId: string, org: string, email: string, role: string) {
  const token = await invite(db, adminId, org, email, role);
  await asUser(db, userId, `select public.accept_invitation($1)`, [token]);
}

export async function buildWorld(): Promise<World> {
  const db = await createDb();
  const u = {
    alice: await createUser(db, "alice@acme.test", "Alice"),
    frank: await createUser(db, "frank@acme.test", "Frank"),
    bob: await createUser(db, "bob@acme.test", "Bob"),
    carol: await createUser(db, "carol@acme.test", "Carol"),
    dave: await createUser(db, "dave@globex.test", "Dave"),
    eve: await createUser(db, "eve@nowhere.test", "Eve"),
  };

  const [{ create_organization: orgA }] = await asUser<{ create_organization: string }>(
    db, u.alice, `select public.create_organization('Acme', 'acme')`);
  const [{ create_organization: orgB }] = await asUser<{ create_organization: string }>(
    db, u.dave, `select public.create_organization('Globex', 'globex')`);

  await join(db, u.alice, u.frank, orgA, "frank@acme.test", "admin");
  await join(db, u.alice, u.bob, orgA, "bob@acme.test", "member");
  await join(db, u.alice, u.carol, orgA, "carol@acme.test", "guest");

  const [{ id: wsA }] = await asUser<{ id: string }>(db, u.alice,
    `insert into public.workspaces (org_id, name) values ($1, 'Engineering') returning id`, [orgA]);
  const [{ id: spaceA }] = await asUser<{ id: string }>(db, u.alice,
    `insert into public.spaces (workspace_id, name) values ($1, 'Platform') returning id`, [wsA]);
  const [{ id: spaceSecret }] = await asUser<{ id: string }>(db, u.alice,
    `insert into public.spaces (workspace_id, name, is_private) values ($1, 'Secret', true) returning id`, [wsA]);
  const [{ id: projDev }] = await asUser<{ id: string }>(db, u.alice,
    `insert into public.projects (space_id, name, key) values ($1, 'Dev', 'DEV') returning id`, [spaceA]);
  const [{ id: projSec }] = await asUser<{ id: string }>(db, u.alice,
    `insert into public.projects (space_id, name, key) values ($1, 'Secret', 'SEC') returning id`, [spaceSecret]);

  const statuses = await asAdmin<{ id: string; name: string }>(db,
    `select id, name from public.workflow_statuses where space_id = $1`, [spaceA]);
  const statusA = Object.fromEntries(statuses.map((s) => [s.name, s.id]));

  const [{ id: taskA }] = await asUser<{ id: string }>(db, u.alice,
    `insert into public.tasks (project_id, title, assignee_id) values ($1, 'First task', $2) returning id`, [projDev, u.bob]);
  const [{ id: taskSec }] = await asUser<{ id: string }>(db, u.alice,
    `insert into public.tasks (project_id, title) values ($1, 'Top secret plan') returning id`, [projSec]);

  const [{ id: wsB }] = await asUser<{ id: string }>(db, u.dave,
    `insert into public.workspaces (org_id, name) values ($1, 'Ops') returning id`, [orgB]);
  const [{ id: spaceB }] = await asUser<{ id: string }>(db, u.dave,
    `insert into public.spaces (workspace_id, name) values ($1, 'Infra') returning id`, [wsB]);
  const [{ id: projB }] = await asUser<{ id: string }>(db, u.dave,
    `insert into public.projects (space_id, name, key) values ($1, 'Infra', 'INF') returning id`, [spaceB]);
  const [{ id: taskB }] = await asUser<{ id: string }>(db, u.dave,
    `insert into public.tasks (project_id, title) values ($1, 'Globex confidential') returning id`, [projB]);

  return { db, u, orgA, orgB, wsA, spaceA, spaceSecret, projDev, projSec, taskA, taskSec, taskB, statusA, wsB, spaceB, projB };
}
