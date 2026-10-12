# FlowSpace

A Jira-inspired project & task management platform: **Organizations → Workspaces → Spaces → Projects → Tasks**, with
Kanban / list / calendar / timeline views, data-driven workflows, custom fields, automations, notifications, dashboards and
reports. Built on **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui** with **Supabase** (Postgres, Auth, Storage,
Realtime) and deployable to **Vercel**.

> The name, logo colour and tagline live in [`lib/brand.ts`](lib/brand.ts) and [`components/app/logo.tsx`](components/app/logo.tsx).

**Read [`docs/STATUS.md`](docs/STATUS.md) first** — it states plainly what is implemented, what is tested, and what has not been
verified against a live Supabase project yet.

## Quick start

Prerequisites: Node 20.19+ (24 recommended), npm, a Supabase project (or the Supabase CLI + Docker for a local stack).

```bash
npm install
cp .env.example .env.local        # then fill in your Supabase values
npm run dev                       # http://localhost:3000
```

### 1. Create the Supabase project

1. Create a project at <https://supabase.com/dashboard>.
2. **Settings → API**: copy the project URL and the *publishable* (anon) key into `.env.local`.
3. Apply the schema (all of it lives in [`supabase/migrations`](supabase/migrations), applied in filename order):

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   For a local stack instead: `npx supabase start` (needs Docker) then `npm run db:reset`.
4. **Database → Extensions**: enable `pg_cron` (the migration schedules overdue/due-soon jobs when it is present; without it
   call `select private.run_scheduled_jobs();` from any external scheduler every ~15 minutes).
5. **Authentication → Providers → Email**: keep *Confirm email* **on**. Set the minimum password length to 10.
6. **Authentication → URL Configuration**: set *Site URL* to your app URL and add the redirect URLs
   `http://localhost:3000/**` and `https://<your-domain>/**` (the app uses `/auth/confirm` and `/auth/callback`).
7. Storage buckets (`avatars`, `org-logos` public; `attachments` **private**) and their policies are created by migration
   `…0007_storage.sql` — nothing to click. Verify under **Storage** that `attachments` is *not* public.

### 2. Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | Publishable/anon key — safe in the browser **only because RLS protects every table** |
| `NEXT_PUBLIC_SITE_URL` | browser + server | Public base URL used in auth e-mail redirects |
| `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH` | browser | `true` shows the Google button (see OAuth below) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server/scripts only** | Never used by the app at runtime; only `npm run seed:demo`. Never prefix with `NEXT_PUBLIC_`. |

`.env*` files are git-ignored; only `.env.example` (placeholders) is committed.

### 3. Optional: demo data

Nothing is seeded implicitly. To create a clearly labelled demo organization (needs `SUPABASE_SERVICE_ROLE_KEY` in
`.env.local`; development projects only):

```bash
npm run seed:demo -- --yes
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm test` | Unit tests **and** database tests (see below) |
| `npm run db:push` · `db:reset` · `db:types` | Supabase CLI helpers |
| `npm run seed:demo -- --yes` | Demo organization |

## Tests

`npm test` runs Vitest:

* **`tests/db`** boots an in-process Postgres ([PGlite](https://pglite.dev)), stubs the Supabase-managed pieces (`auth`
  schema, `storage` schema, API roles) and applies the **real migrations**. Tests then act as different end users
  (`set role authenticated` + a JWT subject) so RLS, triggers and RPCs are exercised for real — organization isolation,
  role escalation, guests, private spaces, removed/deactivated members, invitations, notifications, storage policies,
  workflow transitions, custom-field validation, automations, reports…
* **`tests/unit`** covers pure logic (filters/sorting/grouping, permission helpers, redirect safety).

PGlite is not Supabase itself: Auth, Storage API, PostgREST and Realtime are not exercised. See `docs/STATUS.md`.

## Deploying to Vercel

1. Push this repository to GitHub.
2. In Vercel: **Add New → Project → import the repository** (framework preset: Next.js, defaults are fine).
3. Add the environment variables above (Production *and* Preview). Use a **separate Supabase project** for production vs
   development; point Preview deployments at the development project.
4. Deploy. Then add your production domain in Vercel and put the same URL in Supabase **Auth → URL Configuration**
   (Site URL + redirect URLs) and in `NEXT_PUBLIC_SITE_URL`.
5. Smoke-test in production: register → verify e-mail → onboarding → create a task → drag it on the board → upload an
   attachment → sign in as a second user and confirm they cannot see the first organization.

### Google OAuth (optional)

Create OAuth credentials in Google Cloud, add the callback shown in Supabase **Auth → Providers → Google**, enable the
provider, then set `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true`.

### E-mail

Auth e-mails use Supabase's mailer (limited without custom SMTP — configure SMTP for production). Organization invitations
are delivered as **private links** shown to the inviting admin (no third-party mail service is required).

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `Missing NEXT_PUBLIC_SUPABASE_URL…` on start | `.env.local` missing or dev server not restarted |
| Redirect loop to `/login` after signing in | Cookies blocked, or *Site URL* in Supabase does not match the URL you are using |
| Confirmation / reset links open `/login?error=link` | Link expired or redirect URL not allow-listed in Supabase |
| "permission denied" / "row-level security" toasts | You lack the role for that action (this is working as intended); check membership |
| Uploads fail with "mime type not supported" | File type is outside the allow-list in `supabase/migrations/…0007_storage.sql` |
| Overdue notifications never appear | `pg_cron` not enabled — enable the extension or schedule `private.run_scheduled_jobs()` yourself |
| Build fails on Vercel with missing env | Add the `NEXT_PUBLIC_*` variables to the Vercel project |

## Documentation

* [`docs/STATUS.md`](docs/STATUS.md) — implemented / tested / not yet verified
* [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data model, authorization model, design decisions, known limitations
