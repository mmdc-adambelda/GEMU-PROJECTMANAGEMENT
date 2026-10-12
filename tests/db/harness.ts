import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Boots an in-process Postgres (PGlite), stubs the Supabase-managed pieces
 * (auth schema, storage schema, API roles) and applies the REAL migrations from
 * supabase/migrations. RLS tests therefore exercise the same SQL that production runs.
 */

const STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  email_confirmed_at timestamptz default now(),
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text, owner_id text
);
alter table storage.objects enable row level security;

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant select on auth.users to service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
`;

export type Db = PGlite;

export async function createDb(): Promise<Db> {
  const db = new PGlite();
  await db.exec(STUBS);
  const dir = join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(join(dir, file), "utf8"));
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }
  return db;
}

export async function createUser(db: Db, email: string, name = email.split("@")[0]): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [email, JSON.stringify({ full_name: name })],
  );
  return r.rows[0].id;
}

/** Run SQL as an authenticated end user (RLS enforced). Throws on policy / trigger errors. */
export async function asUser<T = Record<string, unknown>>(
  db: Db,
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await tx.exec(`set local role authenticated`);
    const r = await tx.query<T>(sql, params);
    return r.rows;
  });
}

/** Run several statements as one user inside a single transaction. */
export async function asUserTx<T>(db: Db, userId: string, fn: (q: (sql: string, params?: unknown[]) => Promise<any[]>) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await tx.exec(`set local role authenticated`);
    return fn(async (sql, params = []) => (await tx.query(sql, params)).rows as any[]);
  });
}

/** Run as superuser (the table owner), bypassing RLS - for fixtures and assertions about stored state. */
export async function asAdmin<T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

export async function expectDenied(promise: Promise<unknown>, pattern?: RegExp) {
  try {
    await promise;
  } catch (e) {
    const msg = (e as Error).message;
    if (pattern && !pattern.test(msg)) throw new Error(`Denied, but with unexpected message: ${msg}`);
    return;
  }
  throw new Error("Expected the statement to be denied, but it succeeded");
}
