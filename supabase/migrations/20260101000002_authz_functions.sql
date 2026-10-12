-- Authorization helpers used by RLS policies and triggers.
--
-- Design (avoids recursive RLS):
--   * Every helper is SECURITY DEFINER with search_path = '' so it reads membership
--     tables WITHOUT triggering their RLS policies.
--   * `private.u_*(uid, ...)` take an explicit user id and are executable only by the
--     function owner (used by triggers and by the wrappers below).
--   * `private.*(...)` wrappers use auth.uid() and are what policies call.
--   * The `private` schema is not exposed through PostgREST.
--   * NOTE for `INSERT ... RETURNING`: Postgres evaluates the SELECT policy BEFORE the new row
--     exists, so a helper that re-reads the row (e.g. can_view_space(id)) cannot succeed for it.
--     SELECT policies on workspaces/spaces/projects therefore also accept conditions that depend
--     only on the new row's own columns (org admin, space owner, project lead).
--
-- Access model
--   org role   owner | admin | member | guest   (membership must be `active`)
--   workspace  owner/admin always; members see non-private workspaces; private ones need a row
--   space      owner/admin always; members see non-private spaces in visible workspaces; private ones need a row
--   project    owner/admin always; project_members row; space_members row; else `member` + visible space
--   guests     only what is explicitly shared through space_members / project_members
--   edit       viewer rows are read-only; guests need an explicit member/lead row

create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;
alter default privileges in schema private revoke execute on functions from public;

-- ---------------------------------------------------------------- org level
create function private.u_org_role(uid uuid, org uuid) returns public.org_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.organization_members m
  where m.org_id = org and m.user_id = uid and m.status = 'active'
$$;

create function private.u_is_org_admin(uid uuid, org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.u_org_role(uid, org) in ('owner', 'admin'), false)
$$;

-- ---------------------------------------------------------------- workspace
create function private.u_has_workspace_access(uid uuid, ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = ws and (
      private.u_is_org_admin(uid, w.org_id)
      or (private.u_org_role(uid, w.org_id) is not null
          and exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = uid))
      or (not w.is_private and private.u_org_role(uid, w.org_id) = 'member')
    )
  )
$$;

-- "reach": a user explicitly added to a space/project inside the workspace can see its container
create function private.u_can_view_workspace(uid uuid, ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.u_has_workspace_access(uid, ws) or exists (
    select 1 from public.workspaces w
    where w.id = ws and private.u_org_role(uid, w.org_id) is not null and (
      exists (select 1 from public.space_members sm join public.spaces s on s.id = sm.space_id
              where s.workspace_id = w.id and sm.user_id = uid)
      or exists (select 1 from public.project_members pm
                 join public.projects p on p.id = pm.project_id
                 join public.spaces s on s.id = p.space_id
                 where s.workspace_id = w.id and pm.user_id = uid)
    )
  )
$$;

-- ---------------------------------------------------------------- space
create function private.u_has_space_access(uid uuid, sp uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.spaces s
    where s.id = sp and (
      private.u_is_org_admin(uid, s.org_id)
      or (private.u_org_role(uid, s.org_id) is not null
          and (s.owner_id = uid
               or exists (select 1 from public.space_members m where m.space_id = s.id and m.user_id = uid)))
      or (not s.is_private and private.u_org_role(uid, s.org_id) = 'member'
          and private.u_has_workspace_access(uid, s.workspace_id))
    )
  )
$$;

create function private.u_can_view_space(uid uuid, sp uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.u_has_space_access(uid, sp) or exists (
    select 1 from public.spaces s
    where s.id = sp and private.u_org_role(uid, s.org_id) is not null
      and exists (select 1 from public.project_members pm join public.projects p on p.id = pm.project_id
                  where p.space_id = s.id and pm.user_id = uid)
  )
$$;

create function private.u_can_manage_space(uid uuid, sp uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.spaces s
    where s.id = sp and (
      private.u_is_org_admin(uid, s.org_id)
      or (private.u_org_role(uid, s.org_id) is not null and (
            s.owner_id = uid
            or exists (select 1 from public.space_members m
                       where m.space_id = s.id and m.user_id = uid and m.role = 'admin')))
    )
  )
$$;

-- ---------------------------------------------------------------- project
create function private.u_can_view_project(uid uuid, pr uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p
    where p.id = pr and (
      private.u_is_org_admin(uid, p.org_id)
      or (private.u_org_role(uid, p.org_id) is not null and (
            p.lead_id = uid
            or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = uid)
            or exists (select 1 from public.space_members m where m.space_id = p.space_id and m.user_id = uid)
            or (private.u_org_role(uid, p.org_id) = 'member' and private.u_has_space_access(uid, p.space_id))))
    )
  )
$$;

create function private.u_can_edit_project(uid uuid, pr uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  p record;
  role_ public.org_role;
  pm public.project_role;
  sm public.space_role;
begin
  select id, org_id, space_id into p from public.projects where id = pr;
  if not found then return false; end if;
  role_ := private.u_org_role(uid, p.org_id);
  if role_ is null then return false; end if;
  if role_ in ('owner', 'admin') then return true; end if;
  select role into pm from public.project_members where project_id = pr and user_id = uid;
  if pm = 'viewer' then return false; end if;
  if pm in ('lead', 'member') then return true; end if;
  select role into sm from public.space_members where space_id = p.space_id and user_id = uid;
  if sm = 'viewer' then return false; end if;
  if sm in ('admin', 'member') then return true; end if;
  return role_ = 'member' and private.u_has_space_access(uid, p.space_id);
end $$;

create function private.u_can_manage_project(uid uuid, pr uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p
    where p.id = pr and (
      private.u_is_org_admin(uid, p.org_id)
      or (private.u_org_role(uid, p.org_id) is not null and (
            p.lead_id = uid
            or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = uid and m.role = 'lead')
            or private.u_can_manage_space(uid, p.space_id)))
    )
  )
$$;

-- ---------------------------------------------------------------- task
create function private.u_task_project(task uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select project_id from public.tasks where id = task
$$;

create function private.u_can_view_task(uid uuid, task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.u_can_view_project(uid, private.u_task_project(task)), false)
$$;

create function private.u_can_edit_task(uid uuid, task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.u_can_edit_project(uid, private.u_task_project(task)), false)
$$;

-- ---------------------------------------------------------------- profiles directory
-- Guests cannot enumerate the org directory; they only see people who share a project with them.
create function private.u_shares_org_with(uid uuid, other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select uid = other or exists (
    select 1
    from public.organization_members a
    join public.organization_members b on b.org_id = a.org_id
    where a.user_id = uid and a.status = 'active'
      and b.user_id = other and b.status = 'active'
      and (a.role <> 'guest'
           or b.role in ('owner', 'admin')
           or exists (select 1 from public.project_members x join public.project_members y on y.project_id = x.project_id
                      where x.user_id = uid and y.user_id = other))
  )
$$;

-- ---------------------------------------------------------------- wrappers (auth.uid())
create function private.org_role(org uuid) returns public.org_role
language sql stable security definer set search_path = '' as $$
  select private.u_org_role((select auth.uid()), org)
$$;
create function private.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.u_org_role((select auth.uid()), org) is not null
$$;
create function private.is_org_admin(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.u_is_org_admin((select auth.uid()), org)
$$;
create function private.is_org_owner(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.u_org_role((select auth.uid()), org) = 'owner', false)
$$;
create function private.can_view_workspace(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.u_can_view_workspace((select auth.uid()), ws)
$$;
create function private.can_manage_workspace(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspaces w where w.id = ws and private.u_is_org_admin((select auth.uid()), w.org_id))
$$;
create function private.can_view_space(sp uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.u_can_view_space((select auth.uid()), sp)
$$;
create function private.can_manage_space(sp uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.u_can_manage_space((select auth.uid()), sp)
$$;
create function private.can_view_project(pr uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.u_can_view_project((select auth.uid()), pr)
$$;
create function private.can_edit_project(pr uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.u_can_edit_project((select auth.uid()), pr)
$$;
create function private.can_manage_project(pr uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.u_can_manage_project((select auth.uid()), pr)
$$;
create function private.can_view_task(task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.u_can_view_task((select auth.uid()), task)
$$;
create function private.can_edit_task(task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.u_can_edit_task((select auth.uid()), task)
$$;
create function private.shares_org_with(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.u_shares_org_with((select auth.uid()), other)
$$;

-- wrappers (no uid argument) may be called by clients/policies; u_* may not
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
  loop
    execute format('revoke all on function %s from public', f.sig);
    if f.proname not like 'u\_%' then
      execute format('grant execute on function %s to anon, authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;
