-- Public RPCs. Convention:
--   SECURITY DEFINER  only where a client legitimately needs to cross an RLS boundary
--                     (create org, invitations, status migration) - each performs its own checks.
--   SECURITY INVOKER  everything else, so row level security filters the results.

-- ---------------------------------------------------------------- organizations & invitations
create function public.create_organization(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  org uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if (select count(*) from public.organization_members where user_id = uid and role = 'owner') >= 10 then
    raise exception 'Organization limit reached' using errcode = '53400';
  end if;
  insert into public.organizations (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), uid)
  returning id into org;
  insert into public.organization_members (org_id, user_id, role) values (org, uid, 'owner');
  perform private.log_activity(org, null, null, 'organization.created', jsonb_build_object('name', btrim(p_name)));
  return org;
end $$;

create function public.create_invitation(p_org uuid, p_email text, p_role public.org_role)
returns table (invitation_id uuid, token text)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  caller public.org_role := private.u_org_role(auth.uid(), p_org);
  mail text := lower(btrim(p_email));
  tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  inv uuid;
  target uuid;
begin
  if caller is null or caller not in ('owner', 'admin') then
    raise exception 'Only organization admins can invite members' using errcode = '42501';
  end if;
  if p_role = 'owner' then raise exception 'Invite as admin, then promote to owner' using errcode = '42501'; end if;
  if p_role = 'admin' and caller <> 'owner' then
    raise exception 'Only owners can invite admins' using errcode = '42501';
  end if;
  if mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email address' using errcode = '22023'; end if;
  -- abuse guard: invitations are the only way to bring outside e-mail addresses into the system
  if (select count(*) from public.organization_invitations
       where org_id = p_org and created_at > now() - interval '1 hour') >= 50 then
    raise exception 'Too many invitations sent recently. Try again in an hour.' using errcode = '53400';
  end if;
  if exists (
    select 1 from public.organization_members m join public.profiles p on p.id = m.user_id
    where m.org_id = p_org and lower(p.email) = mail and m.status = 'active'
  ) then raise exception 'This person is already a member' using errcode = '23505'; end if;

  -- drop stale pending invites for the same address (expired), keep history of accepted/revoked ones
  delete from public.organization_invitations
   where org_id = p_org and email = mail and accepted_at is null and revoked_at is null and expires_at < now();

  insert into public.organization_invitations (org_id, email, role, token_hash, invited_by)
  values (p_org, mail, p_role, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), uid)
  returning id into inv;

  select id into target from public.profiles where lower(email) = mail;
  if target is not null then
    insert into public.notifications (user_id, org_id, type, actor_id, title)
    values (target, p_org, 'invitation', uid,
            'You were invited to join ' || (select name from public.organizations where id = p_org));
  end if;
  perform private.log_activity(p_org, null, null, 'member.invited', jsonb_build_object('email', mail, 'role', p_role));
  return query select inv, tok;
end $$;

create function public.get_invitation_preview(p_token text)
returns table (org_name text, role public.org_role, email text, state text)
language sql stable security definer set search_path = '' as $$
  select o.name, i.role, i.email,
         case when i.revoked_at is not null then 'revoked'
              when i.accepted_at is not null then 'accepted'
              when i.expires_at < now() then 'expired'
              else 'pending' end
  from public.organization_invitations i join public.organizations o on o.id = i.org_id
  where auth.uid() is not null
    and i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;

create function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  inv public.organization_invitations;
  mail text;
  verified timestamptz;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select lower(email), email_confirmed_at into mail, verified from auth.users where id = uid;
  select * into inv from public.organization_invitations
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found or inv.revoked_at is not null or inv.accepted_at is not null or inv.expires_at < now() then
    raise exception 'This invitation is invalid, expired or already used' using errcode = '22023';
  end if;
  if verified is null then raise exception 'Verify your email address first' using errcode = '42501'; end if;
  if mail is distinct from inv.email then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;
  if exists (select 1 from public.organization_members where org_id = inv.org_id and user_id = uid) then
    raise exception 'You already belong to this organization' using errcode = '23505';
  end if;
  insert into public.organization_members (org_id, user_id, role) values (inv.org_id, uid, inv.role);
  update public.organization_invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  perform private.log_activity(inv.org_id, null, null, 'member.joined', jsonb_build_object('role', inv.role));
  return inv.org_id;
end $$;

-- ---------------------------------------------------------------- workflow management
create function public.delete_status(p_status uuid, p_reassign_to uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.workflow_statuses;
  n int;
begin
  select * into s from public.workflow_statuses where id = p_status;
  if not found then raise exception 'Status not found' using errcode = 'P0002'; end if;
  if not private.u_can_manage_space(auth.uid(), s.space_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if s.is_default then raise exception 'The default status cannot be deleted' using errcode = '23514'; end if;
  select count(*) into n from public.tasks where status_id = p_status;
  if n > 0 then
    if p_reassign_to is null then
      raise exception '% task(s) still use this status; choose a status to move them to', n using errcode = '23503';
    end if;
    if p_reassign_to = p_status
       or (select space_id from public.workflow_statuses where id = p_reassign_to) is distinct from s.space_id then
      raise exception 'Choose a different status from the same workflow' using errcode = '23514';
    end if;
    perform set_config('app.skip_workflow', 'on', true);
    update public.tasks set status_id = p_reassign_to where status_id = p_status;
    perform set_config('app.skip_workflow', 'off', true);
  end if;
  delete from public.workflow_statuses where id = p_status;
end $$;

-- ---------------------------------------------------------------- duplication (invoker: RLS applies)
create function public.duplicate_task(p_task uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  t public.tasks;
  new_id uuid;
begin
  select * into t from public.tasks where id = p_task;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;
  insert into public.tasks (project_id, title, description, status_id, priority, type, assignee_id,
                            start_date, due_date, estimate_minutes)
  values (t.project_id, left(t.title, 290) || ' (copy)', t.description, t.status_id, t.priority, t.type, t.assignee_id,
          t.start_date, t.due_date, t.estimate_minutes)
  returning id into new_id;
  insert into public.task_labels (task_id, label_id) select new_id, label_id from public.task_labels where task_id = p_task;
  insert into public.task_custom_field_values (task_id, field_id, value)
    select new_id, field_id, value from public.task_custom_field_values where task_id = p_task;
  return new_id;
end $$;

create function public.duplicate_project(p_project uuid, p_name text, p_key text, p_include_tasks boolean default false)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  p public.projects;
  new_id uuid;
  t record;
  new_task uuid;
  idmap jsonb := '{}';
begin
  select * into p from public.projects where id = p_project;
  if not found then raise exception 'Project not found' using errcode = 'P0002'; end if;
  insert into public.projects (space_id, name, key, description, lead_id, start_date, due_date, priority, status, tags, icon, color, template)
  values (p.space_id, p_name, upper(p_key), p.description, auth.uid(), p.start_date, p.due_date, p.priority, 'planned', p.tags, p.icon, p.color, p.template)
  returning id into new_id;
  if p_include_tasks then
    -- parents first so subtasks can reference their new parent
    for t in select * from public.tasks where project_id = p_project and archived_at is null order by (parent_id is not null), number loop
      insert into public.tasks (project_id, title, description, status_id, priority, type, parent_id,
                                start_date, due_date, estimate_minutes)
      values (new_id, t.title, t.description, t.status_id, t.priority, t.type,
              case when t.parent_id is null then null else (idmap ->> t.parent_id::text)::uuid end,
              t.start_date, t.due_date, t.estimate_minutes)
      returning id into new_task;
      idmap := idmap || jsonb_build_object(t.id::text, new_task);
      insert into public.task_labels (task_id, label_id) select new_task, label_id from public.task_labels where task_id = t.id;
    end loop;
  end if;
  return new_id;
end $$;

-- ---------------------------------------------------------------- views & reporting
-- Progress = completed tasks / all non-archived tasks (subtasks included). "Completed" means the
-- task sits in a status whose category is `done`, so a Cancelled status in the done category counts as closed.
create view public.project_stats with (security_invoker = true) as
select
  p.id as project_id,
  count(t.id) filter (where t.archived_at is null) as total_tasks,
  count(t.id) filter (where t.archived_at is null and s.category = 'done') as done_tasks,
  count(t.id) filter (where t.archived_at is null and s.category = 'in_progress') as in_progress_tasks,
  count(t.id) filter (where t.archived_at is null and s.category <> 'done' and t.due_date < current_date) as overdue_tasks,
  coalesce(round(100.0 * count(t.id) filter (where t.archived_at is null and s.category = 'done')
        / nullif(count(t.id) filter (where t.archived_at is null), 0)), 0)::int as progress_pct
from public.projects p
left join public.tasks t on t.project_id = p.id
left join public.workflow_statuses s on s.id = t.status_id
group by p.id;
grant select on public.project_stats to authenticated;

create function public.dashboard_stats(p_org uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  with open_tasks as (
    select t.*, s.category, s.name as status_name, s.color as status_color
    from public.tasks t join public.workflow_statuses s on s.id = t.status_id
    where t.org_id = p_org and t.archived_at is null
  )
  select jsonb_build_object(
    'active_projects', (select count(*) from public.projects where org_id = p_org and archived_at is null and status = 'active'),
    'my_open_tasks', (select count(*) from open_tasks where assignee_id = uid and category <> 'done'),
    'completed_this_week', (select count(*) from open_tasks where completed_at >= date_trunc('week', now())),
    'overdue_tasks', (select count(*) from open_tasks where category <> 'done' and due_date < current_date),
    'by_status', coalesce((select jsonb_agg(x order by x.position) from (
        select status_name as name, (array_agg(status_color))[1] as color, count(*) as count,
               min(category::text) as category,
               case min(category::text) when 'todo' then 0 when 'in_progress' then 1 else 2 end as position
        from open_tasks group by status_name) x), '[]'),
    'by_priority', coalesce((select jsonb_agg(jsonb_build_object('priority', priority, 'count', c))
        from (select priority, count(*) c from open_tasks where category <> 'done' group by priority) q), '[]'),
    'by_assignee', coalesce((select jsonb_agg(x) from (
        select coalesce(p.full_name, 'Unassigned') as name, o.assignee_id as user_id, count(*) as open,
               count(*) filter (where o.due_date < current_date) as overdue
        from open_tasks o left join public.profiles p on p.id = o.assignee_id
        where o.category <> 'done' group by p.full_name, o.assignee_id order by count(*) desc limit 12) x), '[]'),
    'created_vs_completed', coalesce((select jsonb_agg(jsonb_build_object('day', d::date,
          'created', (select count(*) from open_tasks where created_at::date = d::date),
          'completed', (select count(*) from open_tasks where completed_at::date = d::date)) order by d)
        from generate_series(current_date - 13, current_date, interval '1 day') d), '[]'),
    'upcoming', coalesce((select jsonb_agg(x) from (
        select id, key, title, due_date, priority from open_tasks
        where category <> 'done' and due_date between current_date and current_date + 7
        order by due_date, priority desc limit 8) x), '[]')
  ) into result;
  return result;
end $$;

-- Global search; RLS filters every branch because this runs as the caller.
create function public.search_org(p_org uuid, p_query text, p_limit int default 6) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  q text := btrim(p_query);
  pat text;
  lim int := least(greatest(p_limit, 1), 20);
begin
  if char_length(q) < 2 then return jsonb_build_object('tasks', '[]', 'projects', '[]', 'spaces', '[]', 'people', '[]'); end if;
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return jsonb_build_object(
    'tasks', coalesce((select jsonb_agg(x) from (
      select t.id, t.key, t.title, t.project_id from public.tasks t
      where t.org_id = p_org and t.archived_at is null
        and (t.key ilike pat or t.title ilike pat or t.search @@ websearch_to_tsquery('simple', q))
      order by (t.key ilike q) desc, t.updated_at desc limit lim) x), '[]'),
    'projects', coalesce((select jsonb_agg(x) from (
      select id, key, name from public.projects
      where org_id = p_org and archived_at is null and (name ilike pat or key ilike pat) limit lim) x), '[]'),
    'spaces', coalesce((select jsonb_agg(x) from (
      select id, name, workspace_id from public.spaces
      where org_id = p_org and archived_at is null and name ilike pat limit lim) x), '[]'),
    'people', coalesce((select jsonb_agg(x) from (
      select p.id, p.full_name, p.email, p.avatar_url from public.profiles p
      join public.organization_members m on m.user_id = p.id and m.org_id = p_org and m.status = 'active'
      where p.full_name ilike pat or p.email ilike pat limit lim) x), '[]')
  );
end $$;

-- ---------------------------------------------------------------- grants for RPCs
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;
