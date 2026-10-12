# Project status

Honest accounting of what exists, what is verified, and what is not. "Verified" always names the method.

## Verification summary

| Check | Result |
|---|---|
| `npm run lint` | passes (0 errors, 0 warnings) |
| `npm run typecheck` (strict TS) | passes |
| `npm test` | passes — database suite (RLS, triggers, RPCs, storage policies) + unit suite |
| `npm run build` (Next.js 16, Turbopack) | passes with placeholder env values |
| Public pages rendered in a browser (register page, desktop + mobile) | looked at, layout OK |
| **Running the app against a live Supabase project** | **NOT done** — no Supabase credentials or Docker were available while building |
| **Deployed to Vercel** | **NOT done** |
| Browser end-to-end tests (Playwright) | **not written** |

What "database suite" means: the real SQL in `supabase/migrations` is applied to an in-process Postgres (PGlite) with
minimal stand-ins for Supabase's `auth`/`storage` schemas and roles; tests then impersonate users and assert behaviour.
This gives real evidence for RLS and trigger logic. It does **not** exercise GoTrue (Auth), the Storage HTTP API,
PostgREST query translation, Realtime, `pg_cron`, or any browser behaviour. Expect to find integration bugs (typically
PostgREST embed/filter syntax or UI wiring) the first time the app talks to a real project; the most likely places are
listed under "Highest-risk unverified areas".

### Required security scenarios (from the brief)

| Scenario | Test |
|---|---|
| User A cannot read User B's private organization data | `tests/db/rls.test.ts` › organization isolation |
| A member cannot promote themselves to owner | › roles cannot be escalated (also: admin cannot self-promote, owners-only, last owner) |
| A user without project access cannot modify project tasks | › project and space access |
| A removed member cannot keep accessing private data | › project and space access (removed from space; deactivated/reactivated org member) |
| A guest cannot perform administrator-only actions | › guests |
| Unauthorized user cannot access another org's private attachments | › private attachments (storage policies) |

Mutation check: replacing the `tasks` SELECT policy with `using (true)` makes 14 tests fail, i.e. the suite detects policy regressions.

## Feature status

Legend: **Done** = implemented and type/lint/build-checked; **DB-tested** = additionally covered by the database suite.
Nothing below is marked "UI-tested" because no browser E2E tests exist yet.

| Area | Status |
|---|---|
| Auth: register, login/logout, e-mail verification, forgot/reset password, session refresh, protected routes, Google OAuth (opt-in) | Done (Supabase Auth; unverified live) |
| Profile (name, title, timezone, avatar upload), password change, notification preferences, theme | Done |
| Onboarding wizard (org → workspace → invites → space+project → first task), resumable | Done |
| Organizations, members, roles (owner/admin/member/guest), deactivate/remove, invitations (hashed single-use tokens, expiry, revoke, email-bound) | Done · **DB-tested** |
| Workspaces (private/public, archive, delete, per-workspace access) | Done · DB-tested (policies) |
| Spaces (icon/colour/owner/privacy/members/archive), grid + list UI | Done · DB-tested (policies) |
| Projects: unique keys, templates (starter labels), lead, members, duplicate, archive, delete, progress | Done · DB-tested |
| Task keys (`DEV-1`) allocated atomically in the DB | **DB-tested** (sequential, per project, tamper-proof) |
| Tasks: all listed fields, subtasks, dependencies (cycle-safe), comments (threaded, mentions), attachments (private bucket + signed URLs), time logging, watchers, custom fields, duplicate, move, archive/restore, delete | Done · DB-tested (rules) |
| Data-driven workflows: statuses CRUD/reorder/default/WIP limit, allowed transitions, required fields, safe delete with reassignment | Done · **DB-tested** |
| Views: Overview, List (inline edit, bulk, group, sort, columns), Board (drag & drop, grouping, quick add, WIP warning, workflow-aware drops), Calendar (month/week/day, drag to reschedule), Timeline (bars, drag/resize, dependency arrows), Activity, Settings | Done (client logic unit-tested; drag/drop UX **not** browser-tested) |
| Saved views (personal/shared), quick filters, global search (`Ctrl+K`) | Done · search DB-tested |
| Notifications (assigned, mention, comment, status, due soon, overdue, invitation), read/unread, prefs, Realtime badge | Done · **DB-tested** |
| Activity history written by DB triggers | **DB-tested** |
| Custom fields (7 types) validated server-side | **DB-tested** |
| Automations (4 triggers, 5 actions, JSON-validated, no custom code, scheduled overdue job) | Done · **DB-tested** |
| Dashboards (12 widgets, per-user layout), Reports (throughput, burndown, cycle time, workload) | Done · reports DB-tested |
| Team directory + member profile with workload | Done |
| Security headers, safe redirects, input validation (Zod), generic error messages | Done |

## Deliberate decisions & simplifications

* **Rich text = Markdown** (toolbar + preview, rendered without raw HTML). Avoids HTML sanitisation risk; not WYSIWYG.
* **Invitations are links**, not e-mails: no third-party mail service. The plaintext token is shown once; only its SHA-256 is stored.
* **Statuses/workflows are per space** (projects in a space share them). No transition rules = any move allowed.
* **WIP limits are advisory** (shown in red on the board), not enforced.
* **`is_required` on custom fields** exists in the schema but is not exposed or enforced yet.
* Per-project fetch cap of **2000 tasks**; the UI warns when reached. Filtering/sorting is client-side over that set.
* Subtasks are limited to the parent's project. Moving a task that has subtasks is blocked until they are detached.
* Rate limiting: Supabase Auth's built-in limits for auth endpoints; invitations capped at 50/org/hour in SQL. No general API limiter.

## Not implemented / planned

* Dedicated organization-wide activity page (activity is shown on Home, per project, and per space).
* Adjustable column widths in the list view.
* Touch-specific drag & drop tuning; keyboard drag works on the board via dnd-kit's keyboard sensor, other views use dialogs.
* Optional e-mail notifications.
* Browser E2E tests and a live-Supabase integration test job in CI.
* Generated database types (`npm run db:types` once a project is linked); UI row types are hand-written in `types/index.ts`.

## Highest-risk unverified areas (check these first against a real project)

1. PostgREST embeds with explicit FK names (`lib/data/*.ts`, inbox, my-tasks) — constraint names are asserted in `tests/db/fknames.test.ts`, but the query strings themselves were not executed.
2. Storage uploads from the browser and `createSignedUrl` (policies are DB-tested; the HTTP path is not).
3. Realtime subscriptions (`tasks`, `notifications`) — publication is added by migration `…0006`.
4. `pg_cron` scheduling on Supabase.
5. Auth e-mail redirect flow (`/auth/confirm`, `/auth/callback`) and cookie refresh in `proxy.ts`.
