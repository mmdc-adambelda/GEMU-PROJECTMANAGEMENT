-- Domain-integrity triggers: derived columns, workflow enforcement, membership guards,
-- activity log, notifications. Business rules live in the database so that no client
-- (UI, API, SQL console) can bypass them.

-- ---------------------------------------------------------------- auth -> profiles
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1))
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.sync_user_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.sync_user_email();

-- ---------------------------------------------------------------- immutable columns
create function private.forbid_change() returns trigger
language plpgsql set search_path = '' as $$
declare col text;
begin
  foreach col in array tg_argv loop
    if to_jsonb(new) -> col is distinct from to_jsonb(old) -> col then
      raise exception 'Column % of % cannot be changed', col, tg_table_name using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

create trigger workspaces_immutable before update on public.workspaces
  for each row execute function private.forbid_change('org_id');
create trigger spaces_immutable before update on public.spaces
  for each row execute function private.forbid_change('org_id', 'workspace_id');
create trigger projects_immutable before update on public.projects
  for each row execute function private.forbid_change('org_id', 'space_id', 'key');
create trigger workflow_statuses_immutable before update on public.workflow_statuses
  for each row execute function private.forbid_change('space_id');
create trigger organization_members_immutable before update on public.organization_members
  for each row execute function private.forbid_change('org_id', 'user_id');
create trigger task_comments_immutable before update on public.task_comments
  for each row execute function private.forbid_change('task_id', 'author_id', 'parent_id');
create trigger saved_views_immutable before update on public.saved_views
  for each row execute function private.forbid_change('org_id', 'owner_id');
create trigger custom_field_definitions_immutable before update on public.custom_field_definitions
  for each row execute function private.forbid_change('org_id', 'space_id', 'field_type');

-- ---------------------------------------------------------------- helpers: activity & notifications
create function private.log_activity(org uuid, project uuid, task uuid, action_ text, details_ jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.activity_log (org_id, project_id, task_id, actor_id, action, details)
  values (org, project, task, auth.uid(), action_, details_)
$$;
revoke all on function private.log_activity(uuid, uuid, uuid, text, jsonb) from public;

create function private.notify(
  recipient uuid, org uuid, type_ public.notification_type, task uuid, project uuid, title_ text, dedupe text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if recipient is null or (actor is not null and recipient = actor) then return; end if;
  -- recipients who lost access never receive task details
  if task is not null and not private.u_can_view_task(recipient, task) then return; end if;
  if org is not null and private.u_org_role(recipient, org) is null then return; end if;
  if exists (
    select 1 from public.profiles p
    where p.id = recipient and p.preferences -> 'notifications' ->> (type_::text) = 'false'
  ) then return; end if;
  insert into public.notifications (user_id, org_id, type, task_id, project_id, actor_id, title, dedupe_key)
  values (recipient, org, type_, task, project, actor, left(title_, 300), dedupe)
  on conflict do nothing;
end $$;
revoke all on function private.notify(uuid, uuid, public.notification_type, uuid, uuid, text, text) from public;

-- ---------------------------------------------------------------- membership guards
-- Anyone added to a workspace / space / project must already be an active org member.
create function private.guard_member_target() returns trigger
language plpgsql security definer set search_path = '' as $$
declare org uuid;
begin
  if tg_table_name = 'workspace_members' then
    select org_id into org from public.workspaces where id = new.workspace_id;
  elsif tg_table_name = 'space_members' then
    select org_id into org from public.spaces where id = new.space_id;
  else
    select org_id into org from public.projects where id = new.project_id;
  end if;
  if private.u_org_role(new.user_id, org) is null then
    raise exception 'User is not an active member of this organization' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger workspace_members_guard before insert on public.workspace_members
  for each row execute function private.guard_member_target();
create trigger space_members_guard before insert on public.space_members
  for each row execute function private.guard_member_target();
create trigger project_members_guard before insert on public.project_members
  for each row execute function private.guard_member_target();

-- Organization roles: nobody promotes themselves, only owners manage owners, never orphan an org.
create function private.guard_org_member_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  caller public.org_role;
  target_org uuid := coalesce(old.org_id, new.org_id);
  other_owners int;
begin
  -- service role / internal maintenance
  if uid is null then return coalesce(new, old); end if;
  -- the organization itself is being deleted (cascade)
  if not exists (select 1 from public.organizations where id = target_org) then return coalesce(new, old); end if;

  caller := private.u_org_role(uid, target_org);
  select count(*) into other_owners from public.organization_members
    where org_id = target_org and role = 'owner' and status = 'active' and user_id <> old.user_id;

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role or new.status is distinct from old.status then
      if old.user_id = uid then
        raise exception 'You cannot change your own role or status' using errcode = '42501';
      end if;
      if caller is null or caller not in ('owner', 'admin') then
        raise exception 'Only organization admins can change members' using errcode = '42501';
      end if;
      if caller <> 'owner' and (old.role = 'owner' or new.role = 'owner') then
        raise exception 'Only owners can manage owners' using errcode = '42501';
      end if;
      if old.role = 'owner' and old.status = 'active'
         and (new.role <> 'owner' or new.status <> 'active') and other_owners = 0 then
        raise exception 'An organization needs at least one active owner' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  -- DELETE: leave yourself, or admins remove others
  if old.user_id <> uid then
    if caller is null or caller not in ('owner', 'admin') then
      raise exception 'Only organization admins can remove members' using errcode = '42501';
    end if;
    if caller <> 'owner' and old.role = 'owner' then
      raise exception 'Only owners can remove owners' using errcode = '42501';
    end if;
  end if;
  if old.role = 'owner' and old.status = 'active' and other_owners = 0 then
    raise exception 'An organization needs at least one active owner' using errcode = '23514';
  end if;
  return old;
end $$;
create trigger organization_members_guard before update or delete on public.organization_members
  for each row execute function private.guard_org_member_change();

-- ---------------------------------------------------------------- hierarchy denormalization
create function private.workspaces_bi() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then new.created_by := auth.uid(); end if;
  return new;
end $$;
create trigger workspaces_before_insert before insert on public.workspaces
  for each row execute function private.workspaces_bi();

create function private.spaces_bi() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select org_id into new.org_id from public.workspaces where id = new.workspace_id;
  if new.org_id is null then raise exception 'Workspace not found'; end if;
  if auth.uid() is not null then
    new.created_by := auth.uid();
    new.owner_id := coalesce(new.owner_id, auth.uid());
  end if;
  if new.owner_id is not null and private.u_org_role(new.owner_id, new.org_id) is null then
    raise exception 'Space owner must be an active organization member';
  end if;
  return new;
end $$;
create trigger spaces_before_insert before insert on public.spaces
  for each row execute function private.spaces_bi();

-- Default workflow, created from data (admins can change every part of it afterwards).
create function private.spaces_ai() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workflow_statuses (space_id, name, color, category, position, is_default) values
    (new.id, 'Backlog',     '#94a3b8', 'todo',        0, false),
    (new.id, 'To Do',       '#64748b', 'todo',        1, true),
    (new.id, 'In Progress', '#3b82f6', 'in_progress', 2, false),
    (new.id, 'In Review',   '#8b5cf6', 'in_progress', 3, false),
    (new.id, 'Blocked',     '#ef4444', 'in_progress', 4, false),
    (new.id, 'Done',        '#22c55e', 'done',        5, false),
    (new.id, 'Cancelled',   '#6b7280', 'done',        6, false);
  perform private.log_activity(new.org_id, null, null, 'space.created', jsonb_build_object('name', new.name));
  return new;
end $$;
create trigger spaces_after_insert after insert on public.spaces
  for each row execute function private.spaces_ai();

create function private.projects_bi() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select org_id into new.org_id from public.spaces where id = new.space_id;
  if new.org_id is null then raise exception 'Space not found'; end if;
  if auth.uid() is not null then
    new.created_by := auth.uid();
    new.lead_id := coalesce(new.lead_id, auth.uid());
  end if;
  new.next_task_number := 1;
  if new.lead_id is not null and private.u_org_role(new.lead_id, new.org_id) is null then
    raise exception 'Project lead must be an active organization member';
  end if;
  return new;
end $$;
create trigger projects_before_insert before insert on public.projects
  for each row execute function private.projects_bi();

create function private.projects_bu() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.lead_id is distinct from old.lead_id and new.lead_id is not null then
    if private.u_org_role(new.lead_id, new.org_id) is null then
      raise exception 'Project lead must be an active organization member';
    end if;
    insert into public.project_members (project_id, user_id, role)
    values (new.id, new.lead_id, 'lead')
    on conflict (project_id, user_id) do update set role = 'lead';
  end if;
  return new;
end $$;
create trigger projects_before_update before update on public.projects
  for each row execute function private.projects_bu();

-- Starter labels per template, project lead membership, activity.
create function private.projects_ai() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.lead_id is not null then
    insert into public.project_members (project_id, user_id, role)
    values (new.id, new.lead_id, 'lead') on conflict do nothing;
  end if;
  insert into public.labels (org_id, name, color)
  select new.org_id, l.name, l.color
  from (values
    ('software',  'frontend',  '#3b82f6'), ('software',  'backend',   '#10b981'), ('software',  'tech-debt', '#f59e0b'),
    ('it_ops',    'incident',  '#ef4444'), ('it_ops',    'change',    '#8b5cf6'), ('it_ops',    'maintenance', '#64748b'),
    ('marketing', 'campaign',  '#ec4899'), ('marketing', 'content',   '#f97316'), ('marketing', 'design',    '#14b8a6')
  ) as l(template, name, color)
  where l.template = new.template
  on conflict do nothing;
  perform private.log_activity(new.org_id, new.id, null, 'project.created',
    jsonb_build_object('key', new.key, 'name', new.name));
  return new;
end $$;
create trigger projects_after_insert after insert on public.projects
  for each row execute function private.projects_ai();

-- ---------------------------------------------------------------- workflow protection
create function private.workflow_statuses_bd() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- allow cascade from deleting the whole space
  if exists (select 1 from public.spaces where id = old.space_id) and old.is_default then
    raise exception 'The default status cannot be deleted; choose another default first' using errcode = '23514';
  end if;
  return old;
end $$;
create trigger workflow_statuses_before_delete before delete on public.workflow_statuses
  for each row execute function private.workflow_statuses_bd();

create function private.workflow_transitions_bi() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select space_id from public.workflow_statuses where id = new.from_status_id) is distinct from new.space_id
     or (select space_id from public.workflow_statuses where id = new.to_status_id) is distinct from new.space_id then
    raise exception 'Transition statuses must belong to the same space';
  end if;
  return new;
end $$;
create trigger workflow_transitions_before_insert before insert on public.workflow_transitions
  for each row execute function private.workflow_transitions_bi();

-- ---------------------------------------------------------------- tasks
create function private.tasks_validate_assignee(uid uuid, org uuid, project uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if uid is not null and (
    private.u_org_role(uid, org) is null or not private.u_can_view_project(uid, project)
  ) then
    raise exception 'Assignee does not have access to this project' using errcode = '23514';
  end if;
end $$;
revoke all on function private.tasks_validate_assignee(uuid, uuid, uuid) from public;

create function private.tasks_bi() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p record;
  st_space uuid;
begin
  update public.projects
     set next_task_number = next_task_number + 1
   where id = new.project_id
  returning org_id, space_id, key, next_task_number - 1 as next_task_number into p;
  if not found then raise exception 'Project not found'; end if;

  new.org_id := p.org_id;
  new.number := p.next_task_number;
  new.key := p.key || '-' || p.next_task_number;
  if auth.uid() is not null then new.reporter_id := auth.uid(); end if;
  if new.status_id is null then
    select id into new.status_id from public.workflow_statuses where space_id = p.space_id and is_default;
    if new.status_id is null then raise exception 'Space has no default status'; end if;
  end if;
  select space_id into st_space from public.workflow_statuses where id = new.status_id;
  if st_space is distinct from p.space_id then
    raise exception 'Status does not belong to this project''s workflow' using errcode = '23514';
  end if;
  if new.position = 0 then new.position := extract(epoch from clock_timestamp()); end if;
  if new.parent_id is not null and
     (select project_id from public.tasks where id = new.parent_id) is distinct from new.project_id then
    raise exception 'A subtask must be in the same project as its parent' using errcode = '23514';
  end if;
  perform private.tasks_validate_assignee(new.assignee_id, new.org_id, new.project_id);
  if (select category from public.workflow_statuses where id = new.status_id) = 'done' then
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end $$;
create trigger tasks_before_insert before insert on public.tasks
  for each row execute function private.tasks_bi();

create function private.tasks_bu() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  np record;
  old_space uuid;
  new_space uuid;
  moved boolean := new.project_id is distinct from old.project_id;
  cat public.status_category;
  tr record;
  has_rules boolean;
  req text;
begin
  new.org_id := old.org_id;
  new.reporter_id := old.reporter_id;
  new.created_at := old.created_at;

  if moved then
    if exists (select 1 from public.tasks where parent_id = old.id) then
      raise exception 'Move or detach the subtasks before moving this task to another project' using errcode = '23514';
    end if;
    if uid is not null and not private.u_can_edit_project(uid, new.project_id) then
      raise exception 'You cannot move tasks into that project' using errcode = '42501';
    end if;
    select space_id into old_space from public.projects where id = old.project_id;
    update public.projects set next_task_number = next_task_number + 1
     where id = new.project_id and org_id = old.org_id
    returning space_id, key, next_task_number - 1 as next_task_number into np;
    if not found then raise exception 'Target project not found in this organization'; end if;
    new.number := np.next_task_number;
    new.key := np.key || '-' || np.next_task_number;
    new.parent_id := null;
    if np.space_id is distinct from old_space then
      -- map to the status with the same name, else the target default
      select id into new.status_id from public.workflow_statuses
        where space_id = np.space_id and lower(name) = lower((select name from public.workflow_statuses where id = old.status_id));
      if new.status_id is null then
        select id into new.status_id from public.workflow_statuses where space_id = np.space_id and is_default;
      end if;
    end if;
    perform private.tasks_validate_assignee(new.assignee_id, new.org_id, new.project_id);
  else
    new.number := old.number;
    new.key := old.key;
  end if;

  if new.assignee_id is distinct from old.assignee_id and not moved then
    perform private.tasks_validate_assignee(new.assignee_id, new.org_id, new.project_id);
  end if;

  if new.parent_id is distinct from old.parent_id and new.parent_id is not null and not moved then
    if new.parent_id = new.id
       or (select project_id from public.tasks where id = new.parent_id) is distinct from new.project_id
       or exists (
         with recursive up as (
           select id, parent_id from public.tasks where id = new.parent_id
           union all
           select t.id, t.parent_id from public.tasks t join up on t.id = up.parent_id
         ) select 1 from up where id = new.id) then
      raise exception 'Invalid parent task' using errcode = '23514';
    end if;
  end if;

  if new.status_id is distinct from old.status_id or moved then
    select space_id, category into new_space, cat from public.workflow_statuses where id = new.status_id;
    select space_id into old_space from public.projects where id = new.project_id;
    if new_space is distinct from old_space then
      raise exception 'Status does not belong to this project''s workflow' using errcode = '23514';
    end if;

    if new.status_id is distinct from old.status_id and not moved
       and coalesce(current_setting('app.skip_workflow', true), 'off') <> 'on' then
      select exists (select 1 from public.workflow_transitions where from_status_id = old.status_id) into has_rules;
      if has_rules then
        select * into tr from public.workflow_transitions
          where from_status_id = old.status_id and to_status_id = new.status_id;
        if not found then
          raise exception 'Transition from "%" to "%" is not allowed by this workflow',
            (select name from public.workflow_statuses where id = old.status_id),
            (select name from public.workflow_statuses where id = new.status_id)
            using errcode = '23514';
        end if;
        foreach req in array tr.required_fields loop
          if (req = 'assignee' and new.assignee_id is null)
             or (req = 'due_date' and new.due_date is null)
             or (req = 'estimate' and new.estimate_minutes is null)
             or (req = 'resolution' and coalesce(new.resolution, '') = '') then
            raise exception 'Field "%" is required for this transition', req using errcode = '23514';
          end if;
        end loop;
      end if;
    end if;

    if cat = 'done' then
      new.completed_at := coalesce(old.completed_at, now());
    else
      new.completed_at := null;
    end if;
  end if;
  return new;
end $$;
create trigger tasks_before_update before update on public.tasks
  for each row execute function private.tasks_bu();

create function private.tasks_ai() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.task_watchers (task_id, user_id)
  select new.id, u from unnest(array[new.reporter_id, new.assignee_id]) as u where u is not null
  on conflict do nothing;
  perform private.log_activity(new.org_id, new.project_id, new.id, 'task.created',
    jsonb_build_object('key', new.key, 'title', new.title));
  if new.assignee_id is not null then
    perform private.notify(new.assignee_id, new.org_id, 'assigned', new.id, new.project_id,
      new.key || ': ' || new.title || ' was assigned to you');
  end if;
  return new;
end $$;
create trigger tasks_after_insert after insert on public.tasks
  for each row execute function private.tasks_ai();

create function private.tasks_au() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  w uuid;
  old_name text;
  new_name text;
  name_of_old text;
  name_of_new text;
begin
  if new.project_id is distinct from old.project_id then
    perform private.log_activity(new.org_id, new.project_id, new.id, 'task.moved',
      jsonb_build_object('from_key', old.key, 'to_key', new.key));
    perform private.log_activity(old.org_id, old.project_id, new.id, 'task.moved_out',
      jsonb_build_object('from_key', old.key, 'to_key', new.key));
  end if;
  if new.title is distinct from old.title then
    perform private.log_activity(new.org_id, new.project_id, new.id, 'task.title_changed',
      jsonb_build_object('from', old.title, 'to', new.title));
  end if;
  if new.status_id is distinct from old.status_id then
    select name into old_name from public.workflow_statuses where id = old.status_id;
    select name into new_name from public.workflow_statuses where id = new.status_id;
    perform private.log_activity(new.org_id, new.project_id, new.id, 'task.status_changed',
      jsonb_build_object('from', old_name, 'to', new_name));
    for w in select user_id from public.task_watchers where task_id = new.id loop
      perform private.notify(w, new.org_id, 'status_change', new.id, new.project_id,
        new.key || ' moved to ' || new_name);
    end loop;
  end if;
  if new.priority is distinct from old.priority then
    perform private.log_activity(new.org_id, new.project_id, new.id, 'task.priority_changed',
      jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;
  if new.type is distinct from old.type then
    perform private.log_activity(new.org_id, new.project_id, new.id, 'task.type_changed',
      jsonb_build_object('from', old.type, 'to', new.type));
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    select full_name into name_of_old from public.profiles where id = old.assignee_id;
    select full_name into name_of_new from public.profiles where id = new.assignee_id;
    perform private.log_activity(new.org_id, new.project_id, new.id, 'task.assignee_changed',
      jsonb_build_object('from', name_of_old, 'to', name_of_new));
    if new.assignee_id is not null then
      insert into public.task_watchers (task_id, user_id) values (new.id, new.assignee_id) on conflict do nothing;
      perform private.notify(new.assignee_id, new.org_id,
        case when old.assignee_id is null then 'assigned' else 'reassigned' end::public.notification_type,
        new.id, new.project_id, new.key || ': ' || new.title || ' was assigned to you');
    end if;
  end if;
  if new.due_date is distinct from old.due_date then
    perform private.log_activity(new.org_id, new.project_id, new.id, 'task.due_date_changed',
      jsonb_build_object('from', old.due_date, 'to', new.due_date));
  end if;
  if new.start_date is distinct from old.start_date then
    perform private.log_activity(new.org_id, new.project_id, new.id, 'task.start_date_changed',
      jsonb_build_object('from', old.start_date, 'to', new.start_date));
  end if;
  if new.estimate_minutes is distinct from old.estimate_minutes then
    perform private.log_activity(new.org_id, new.project_id, new.id, 'task.estimate_changed',
      jsonb_build_object('from', old.estimate_minutes, 'to', new.estimate_minutes));
  end if;
  if new.description is distinct from old.description then
    perform private.log_activity(new.org_id, new.project_id, new.id, 'task.description_changed', '{}');
  end if;
  if (new.archived_at is null) is distinct from (old.archived_at is null) then
    perform private.log_activity(new.org_id, new.project_id, new.id,
      case when new.archived_at is null then 'task.restored' else 'task.archived' end, '{}');
  end if;
  return new;
end $$;
create trigger tasks_after_update after update on public.tasks
  for each row execute function private.tasks_au();

-- ---------------------------------------------------------------- comments
create function private.task_comments_bu() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  return new;
end $$;
create trigger task_comments_before_update before update on public.task_comments
  for each row execute function private.task_comments_bu();

create function private.task_comments_ai() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t record;
  m text;
  mentioned uuid[] := '{}';
  w uuid;
begin
  select id, org_id, project_id, key, title into t from public.tasks where id = new.task_id;
  insert into public.task_watchers (task_id, user_id) values (new.task_id, new.author_id) on conflict do nothing;

  for m in select (regexp_matches(new.body, '\(user:([0-9a-fA-F-]{36})\)', 'g'))[1] loop
    mentioned := mentioned || m::uuid;
  end loop;
  -- mentioned users start watching the task
  insert into public.task_watchers (task_id, user_id)
  select new.task_id, u from unnest(mentioned) u
  where private.u_can_view_task(u, new.task_id)
  on conflict do nothing;

  for w in select distinct unnest(mentioned) loop
    perform private.notify(w, t.org_id, 'mention', t.id, t.project_id, 'You were mentioned on ' || t.key);
  end loop;
  for w in select user_id from public.task_watchers where task_id = new.task_id and not (user_id = any (mentioned)) loop
    perform private.notify(w, t.org_id, 'comment', t.id, t.project_id, 'New comment on ' || t.key);
  end loop;
  perform private.log_activity(t.org_id, t.project_id, t.id, 'task.commented', '{}');
  return new;
end $$;
create trigger task_comments_after_insert after insert on public.task_comments
  for each row execute function private.task_comments_ai();

-- ---------------------------------------------------------------- attachments / dependencies
create function private.task_attachments_ai() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  select org_id, project_id into t from public.tasks where id = new.task_id;
  perform private.log_activity(t.org_id, t.project_id, new.task_id, 'task.attachment_added',
    jsonb_build_object('file_name', new.file_name));
  return new;
end $$;
create trigger task_attachments_after_insert after insert on public.task_attachments
  for each row execute function private.task_attachments_ai();

create function private.task_dependencies_bi() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select org_id from public.tasks where id = new.task_id)
     is distinct from (select org_id from public.tasks where id = new.blocked_by_task_id) then
    raise exception 'Dependencies must stay within one organization' using errcode = '23514';
  end if;
  if exists (
    with recursive chain as (
      select blocked_by_task_id as id from public.task_dependencies where task_id = new.blocked_by_task_id
      union
      select d.blocked_by_task_id from public.task_dependencies d join chain c on d.task_id = c.id
    ) select 1 from chain where id = new.task_id) then
    raise exception 'This dependency would create a cycle' using errcode = '23514';
  end if;
  if auth.uid() is not null then new.created_by := auth.uid(); end if;
  return new;
end $$;
create trigger task_dependencies_before_insert before insert on public.task_dependencies
  for each row execute function private.task_dependencies_bi();

-- ---------------------------------------------------------------- custom fields
create function private.custom_field_values_biu() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  d public.custom_field_definitions;
  t record;
  v jsonb := new.value;
  item jsonb;
begin
  select t_.org_id, p.space_id into t
    from public.tasks t_ join public.projects p on p.id = t_.project_id where t_.id = new.task_id;
  select * into d from public.custom_field_definitions where id = new.field_id;
  if d.id is null or d.org_id <> t.org_id or (d.space_id is not null and d.space_id <> t.space_id) then
    raise exception 'Custom field does not apply to this task' using errcode = '23514';
  end if;
  if v = 'null'::jsonb then
    raise exception 'Delete the value instead of storing null' using errcode = '23514';
  end if;
  case d.field_type
    when 'text' then
      if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 2000 then
        raise exception 'Field "%" expects text up to 2000 characters', d.name using errcode = '23514'; end if;
    when 'number' then
      if jsonb_typeof(v) <> 'number' then
        raise exception 'Field "%" expects a number', d.name using errcode = '23514'; end if;
    when 'checkbox' then
      if jsonb_typeof(v) <> 'boolean' then
        raise exception 'Field "%" expects true or false', d.name using errcode = '23514'; end if;
    when 'date' then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'Field "%" expects a date (YYYY-MM-DD)', d.name using errcode = '23514'; end if;
      perform (v #>> '{}')::date;
    when 'url' then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~* '^https?://[^\s]+$' or char_length(v #>> '{}') > 2000 then
        raise exception 'Field "%" expects an http(s) URL', d.name using errcode = '23514'; end if;
    when 'select' then
      if jsonb_typeof(v) <> 'string' or not (d.options @> to_jsonb(array[v #>> '{}'])) then
        raise exception 'Field "%": value is not one of the allowed options', d.name using errcode = '23514'; end if;
    when 'multi_select' then
      if jsonb_typeof(v) <> 'array' then
        raise exception 'Field "%" expects a list of options', d.name using errcode = '23514'; end if;
      for item in select * from jsonb_array_elements(v) loop
        if jsonb_typeof(item) <> 'string' or not (d.options @> to_jsonb(array[item #>> '{}'])) then
          raise exception 'Field "%": value is not one of the allowed options', d.name using errcode = '23514'; end if;
      end loop;
  end case;
  return new;
end $$;
create trigger custom_field_values_validate before insert or update on public.task_custom_field_values
  for each row execute function private.custom_field_values_biu();

-- ---------------------------------------------------------------- key columns of link tables
-- PostgREST upserts (ON CONFLICT DO UPDATE) assign every payload column, so the key columns carry
-- UPDATE privilege; these triggers make sure they can never actually change.
create trigger space_members_immutable before update on public.space_members
  for each row execute function private.forbid_change('space_id', 'user_id');
create trigger project_members_immutable before update on public.project_members
  for each row execute function private.forbid_change('project_id', 'user_id');
create trigger task_custom_field_values_immutable before update on public.task_custom_field_values
  for each row execute function private.forbid_change('task_id', 'field_id');
create trigger dashboard_configurations_immutable before update on public.dashboard_configurations
  for each row execute function private.forbid_change('user_id', 'org_id');
create trigger dashboard_configurations_updated_at before update on public.dashboard_configurations
  for each row execute function public.set_updated_at();
