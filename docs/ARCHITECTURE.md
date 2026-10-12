# Architecture

## Layout

```
app/                    Next.js routes (proxy.ts refreshes sessions and gates routes)
  (auth)/               login, register, forgot/reset password + server actions
  auth/                 /auth/confirm (e-mail OTP) and /auth/callback (OAuth PKCE) route handlers
  onboarding/ invite/   first-run wizard, invitation acceptance
  o/[org]/…             organization-scoped app: home, my-tasks, inbox, spaces, p/[key], t/[key],
                        dashboards, reports, team, settings, help
  account/              profile & preferences
components/ui/          shadcn/ui (Base UI flavour) · components/app/ shared app components
features/               feature modules: server actions + feature UI (orgs, spaces, projects, tasks, views, account, notifications)
lib/supabase/           browser / server / proxy clients (@supabase/ssr)
lib/auth/               session helpers, withAuth() wrapper for Server Actions
lib/validations/        Zod schemas (every Server Action re-validates untrusted input)
lib/permissions/        UI-side mirror of the role rules (decides what to SHOW only)
lib/data/               server-side loaders (RLS-bound client)
lib/tasks/              pure filter / sort / group logic (unit-tested)
supabase/migrations/    the whole backend; supabase/config.toml for the CLI
tests/                  db (RLS/trigger/RPC suite on PGlite) and unit
```

## Data model

`organizations → workspaces → spaces → projects → tasks (parent_id for subtasks)`.

* Statuses and transitions belong to a **space** (`workflow_statuses`, `workflow_transitions`); tasks reference a status row. Nothing in
  the code hard-codes status names — only the *category* (`todo | in_progress | done`) is semantic.
* `tasks.key` / `tasks.number` are assigned in a `BEFORE INSERT` trigger that increments `projects.next_task_number` atomically
  (the row lock serialises concurrent inserts). Clients cannot write them (column privileges + immutability triggers).
* `org_id` is denormalised onto spaces, projects and tasks by triggers (clients cannot supply it) so isolation checks are cheap and unforgeable.
* `activity_log` and `notifications` are written only by `SECURITY DEFINER` triggers; clients can read their own.
* Custom field values live in `task_custom_field_values.value jsonb`, validated by a trigger against the field definition.
* Reporting is done in SQL (`dashboard_stats`, `workload_report`, `throughput_report`, `cycle_time_report`, `project_burndown`,
  view `project_stats`) as `SECURITY INVOKER`, so every number is filtered by the caller's RLS.

## Authorization model

Defence in depth, in this order of authority:

1. **Postgres RLS** on every table (verified by a test that fails if any public table lacks it). Clients only have the table/column
   privileges they need (`revoke all` then explicit grants in `…0004_rls.sql`).
2. **Triggers** for rules a policy cannot express: no self-promotion, only owners manage owners, never orphan an org, workflow
   transitions and required fields, assignee must have access, same-project subtasks, dependency cycles, membership targets must be org members.
3. **Server Actions** validate input with Zod and call the database as the signed-in user (never with the service role).
4. **UI** hides controls the user cannot use (`lib/permissions`, `project_access`/`space_access` RPCs that call the same SQL functions as RLS).

Access rules (`…0002_authz_functions.sql`):

| Resource | Who can see it |
|---|---|
| Workspace | owner/admin; members (unless private → needs a `workspace_members` row); guests only via an explicit space/project grant |
| Space | owner/admin; its owner; `space_members`; members for non-private spaces in a visible workspace |
| Project | owner/admin; project lead / `project_members`; `space_members`; members who can see the space |
| Task & children | exactly the project's access; **edit** needs member+ access and no explicit `viewer` row; guests need an explicit member/lead grant |

Helper functions are `SECURITY DEFINER` with `search_path = ''`, live in the unexposed `private` schema, and the `u_*` variants (taking a user id)
are executable only by the owner. This avoids recursive policy evaluation.

Gotcha worth knowing: Postgres evaluates SELECT policies for `INSERT … RETURNING` **before** the row exists, so SELECT policies on
workspaces/spaces/projects also accept row-local conditions (org admin, space owner, project lead).

### Storage

`attachments` is private; path = `<org_id>/<task_id>/<uuid>-<name>`; policies authorise through the task row, so the app removes files
**before** deleting rows. MIME allow-list and 25 MB limit are enforced by the bucket itself. `avatars` / `org-logos` are public-read,
write-restricted by folder (`<user_id>/` or `<org_id>/` for admins).

### Invitations

`create_invitation` returns a random 244-bit token once and stores only its SHA-256. `accept_invitation` checks: not used / revoked /
expired, the caller's **verified** e-mail equals the invited address, and the caller is not already a member. Admins can only grant
member/guest; owners may grant admin; `owner` is never invitable.

## Automation engine

Declarative rules (`automation_rules`) are interpreted by `private.run_automations` from `AFTER` triggers; actions are a fixed set
(assign, set priority, set status, notify user, notify project lead). Inputs are validated by `validate_automation_actions`. Recursion is
bounded by `pg_trigger_depth()`. Overdue rules and due-soon/overdue notifications run from `private.run_scheduled_jobs()` via `pg_cron`,
never from a browser.

## Known limitations

See `docs/STATUS.md` ("Deliberate decisions", "Not implemented", "Highest-risk unverified areas").
