-- Automation engine: a fixed, declarative set of triggers and actions. There is no
-- user-supplied code; rules are validated JSON interpreted by the functions below.
--
-- Triggers : task_created | status_changed | subtasks_completed | task_overdue (scheduled)
-- Conditions (all optional): to_status_id, priority, type
-- Actions  : assign_user{user_id} (only when unassigned) | set_priority{priority} | set_status{status_id}
--            | notify_user{user_id} | notify_project_lead

create function private.validate_automation_actions(actions jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare a jsonb;
begin
  if jsonb_typeof(actions) <> 'array' or jsonb_array_length(actions) = 0 or jsonb_array_length(actions) > 10 then
    return false;
  end if;
  for a in select * from jsonb_array_elements(actions) loop
    if jsonb_typeof(a) <> 'object' or (a ->> 'type') is null
       or (a ->> 'type') not in ('assign_user', 'set_priority', 'set_status', 'notify_user', 'notify_project_lead') then
      return false;
    end if;
    if (a ->> 'type') in ('assign_user', 'notify_user') and (a ->> 'user_id') !~ '^[0-9a-fA-F-]{36}$' then return false; end if;
    if (a ->> 'type') = 'set_status' and (a ->> 'status_id') !~ '^[0-9a-fA-F-]{36}$' then return false; end if;
    if (a ->> 'type') = 'set_priority' and (a ->> 'priority') not in ('lowest', 'low', 'medium', 'high', 'highest') then return false; end if;
  end loop;
  return true;
end $$;

create function private.automation_rules_biu() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select org_id into new.org_id from public.spaces where id = new.space_id;
  if tg_op = 'INSERT' and auth.uid() is not null then new.created_by := auth.uid(); end if;
  if not private.validate_automation_actions(new.actions) then
    raise exception 'Invalid automation actions' using errcode = '22023';
  end if;
  if jsonb_typeof(new.conditions) <> 'object' then
    raise exception 'Invalid automation conditions' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger automation_rules_validate before insert or update on public.automation_rules
  for each row execute function private.automation_rules_biu();

create function private.run_automations(event text, t public.tasks) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  a jsonb;
  space uuid;
  lead uuid;
begin
  if pg_trigger_depth() > 4 then return; end if;
  select space_id, lead_id into space, lead from public.projects where id = t.project_id;
  for r in
    select * from public.automation_rules
    where space_id = space and is_enabled and trigger_type = event
      and (project_id is null or project_id = t.project_id)
  loop
    if not ((r.conditions ->> 'to_status_id' is null or t.status_id::text = r.conditions ->> 'to_status_id')
        and (r.conditions ->> 'priority' is null or t.priority::text = r.conditions ->> 'priority')
        and (r.conditions ->> 'type' is null or t.type::text = r.conditions ->> 'type')) then
      continue;
    end if;
    begin
      for a in select * from jsonb_array_elements(r.actions) loop
        case a ->> 'type'
          when 'assign_user' then
            update public.tasks set assignee_id = (a ->> 'user_id')::uuid where id = t.id and assignee_id is null;
          when 'set_priority' then
            update public.tasks set priority = (a ->> 'priority')::public.task_priority where id = t.id;
          when 'set_status' then
            update public.tasks set status_id = (a ->> 'status_id')::uuid where id = t.id;
          when 'notify_user' then
            perform private.notify((a ->> 'user_id')::uuid, t.org_id, 'status_change', t.id, t.project_id,
                                   'Automation "' || r.name || '": ' || t.key);
          when 'notify_project_lead' then
            perform private.notify(lead, t.org_id, 'status_change', t.id, t.project_id,
                                   'Automation "' || r.name || '": ' || t.key);
        end case;
      end loop;
      insert into public.automation_executions (rule_id, task_id, outcome) values (r.id, t.id, 'success');
    exception when others then
      insert into public.automation_executions (rule_id, task_id, outcome, message) values (r.id, t.id, 'error', left(sqlerrm, 500));
    end;
  end loop;
end $$;

create function private.tasks_automation_ai() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.run_automations('task_created', new);
  return null;
end $$;
create trigger tasks_automation_insert after insert on public.tasks
  for each row execute function private.tasks_automation_ai();

create function private.tasks_automation_au() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  parent public.tasks;
begin
  if new.status_id is distinct from old.status_id then
    perform private.run_automations('status_changed', new);
    if new.parent_id is not null
       and (select category from public.workflow_statuses where id = new.status_id) = 'done'
       and not exists (
         select 1 from public.tasks c join public.workflow_statuses s on s.id = c.status_id
         where c.parent_id = new.parent_id and c.archived_at is null and s.category <> 'done') then
      select * into parent from public.tasks where id = new.parent_id;
      perform private.run_automations('subtasks_completed', parent);
    end if;
  end if;
  return null;
end $$;
create trigger tasks_automation_update after update on public.tasks
  for each row execute function private.tasks_automation_au();

-- ---------------------------------------------------------------- scheduled work
-- Called by pg_cron (see below) - never by browser timers. Idempotent: notifications are
-- de-duplicated per task/day and overdue automations run once per rule and task.
create function private.run_scheduled_jobs() returns void
language plpgsql security definer set search_path = '' as $$
declare t record; ot public.tasks;
begin
  for t in
    select tk.id, tk.org_id, tk.project_id, tk.key, tk.title, tk.assignee_id, tk.due_date
    from public.tasks tk join public.workflow_statuses s on s.id = tk.status_id
    where tk.archived_at is null and s.category <> 'done' and tk.assignee_id is not null
      and tk.due_date <= current_date + 1
  loop
    if t.due_date < current_date then
      perform private.notify(t.assignee_id, t.org_id, 'overdue', t.id, t.project_id,
        t.key || ' is overdue (was due ' || t.due_date || ')', 'overdue:' || t.id || ':' || current_date);
    else
      perform private.notify(t.assignee_id, t.org_id, 'due_soon', t.id, t.project_id,
        t.key || ' is due ' || case when t.due_date = current_date then 'today' else 'tomorrow' end,
        'due_soon:' || t.id || ':' || t.due_date);
    end if;
  end loop;

  for ot in
    select tk.* from public.tasks tk join public.workflow_statuses s on s.id = tk.status_id
    where tk.archived_at is null and s.category <> 'done' and tk.due_date < current_date
  loop
    perform private.run_automations_once('task_overdue', ot);
  end loop;
end $$;

create function private.run_automations_once(event text, t public.tasks) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  -- run each overdue rule only once per task
  for r in
    select ar.id from public.automation_rules ar
    join public.projects p on p.id = t.project_id and p.space_id = ar.space_id
    where ar.is_enabled and ar.trigger_type = event
      and not exists (select 1 from public.automation_executions e where e.rule_id = ar.id and e.task_id = t.id)
  loop
    perform private.run_automations(event, t);
    exit;
  end loop;
end $$;

revoke all on function private.run_scheduled_jobs() from public;
revoke all on function private.run_automations(text, public.tasks) from public;
revoke all on function private.run_automations_once(text, public.tasks) from public;

-- Schedule every 15 minutes when pg_cron is available (Supabase: enable in Dashboard > Database > Extensions).
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable (%); schedule private.run_scheduled_jobs() externally', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('flowspace-scheduled-jobs', '*/15 * * * *', 'select private.run_scheduled_jobs()');
  end if;
end $$;

-- ---------------------------------------------------------------- realtime (respects RLS)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications, public.tasks, public.task_comments;
  end if;
end $$;
