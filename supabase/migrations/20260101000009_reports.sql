-- Reporting functions. All are SECURITY INVOKER: they read tasks/profiles/etc. as the caller, so
-- every number only reflects data the caller is allowed to see.
--
-- Metric definitions (also shown in the UI):
--   open task        = not archived and its status category is not `done`
--   overdue          = open and due_date < today
--   completed        = status category `done`; completion time = tasks.completed_at
--   cycle time       = completed_at - created_at, averaged over tasks completed in the window
--   burndown         = tasks created on or before the day and not yet completed at the end of that day

create function public.workload_report(p_org uuid)
returns table (
  user_id uuid, full_name text, email text, avatar_url text,
  open_tasks bigint, overdue_tasks bigint, completed_30d bigint,
  open_estimate_minutes bigint, logged_30d_minutes bigint
)
language sql stable security invoker set search_path = '' as $$
  select
    m.user_id, p.full_name, p.email, p.avatar_url,
    count(t.id) filter (where t.archived_at is null and s.category <> 'done'),
    count(t.id) filter (where t.archived_at is null and s.category <> 'done' and t.due_date < current_date),
    count(t.id) filter (where t.completed_at >= now() - interval '30 days'),
    coalesce(sum(t.estimate_minutes) filter (where t.archived_at is null and s.category <> 'done'), 0)::bigint,
    (select coalesce(sum(te.minutes), 0) from public.time_entries te
       join public.tasks tt on tt.id = te.task_id
      where te.user_id = m.user_id and tt.org_id = p_org and te.logged_on >= current_date - 30)::bigint
  from public.organization_members m
  join public.profiles p on p.id = m.user_id
  left join public.tasks t on t.assignee_id = m.user_id and t.org_id = p_org
  left join public.workflow_statuses s on s.id = t.status_id
  where m.org_id = p_org and m.status = 'active'
  group by m.user_id, p.full_name, p.email, p.avatar_url
  order by 5 desc, p.full_name
$$;

create function public.throughput_report(p_org uuid, p_days int default 30)
returns table (day date, created bigint, completed bigint)
language sql stable security invoker set search_path = '' as $$
  select d::date,
    (select count(*) from public.tasks t where t.org_id = p_org and t.created_at::date = d::date),
    (select count(*) from public.tasks t where t.org_id = p_org and t.completed_at::date = d::date)
  from generate_series(current_date - (least(greatest(p_days, 1), 365) - 1), current_date, interval '1 day') d
  order by 1
$$;

create function public.cycle_time_report(p_org uuid, p_days int default 90)
returns table (project_id uuid, project_key text, project_name text, completed bigint, open_tasks bigint, avg_cycle_hours numeric)
language sql stable security invoker set search_path = '' as $$
  select pr.id, pr.key, pr.name,
    count(t.id) filter (where t.completed_at >= now() - make_interval(days => least(greatest(p_days, 1), 365))),
    count(t.id) filter (where t.archived_at is null and s.category <> 'done'),
    round(avg(extract(epoch from (t.completed_at - t.created_at)) / 3600.0)
          filter (where t.completed_at >= now() - make_interval(days => least(greatest(p_days, 1), 365))), 1)
  from public.projects pr
  left join public.tasks t on t.project_id = pr.id
  left join public.workflow_statuses s on s.id = t.status_id
  where pr.org_id = p_org and pr.archived_at is null
  group by pr.id, pr.key, pr.name
  order by pr.name
$$;

create function public.project_burndown(p_project uuid, p_days int default 30)
returns table (day date, remaining bigint, scope bigint)
language sql stable security invoker set search_path = '' as $$
  select d::date,
    count(t.id) filter (where t.created_at::date <= d::date and (t.completed_at is null or t.completed_at::date > d::date)),
    count(t.id) filter (where t.created_at::date <= d::date)
  from generate_series(current_date - (least(greatest(p_days, 1), 365) - 1), current_date, interval '1 day') d
  left join public.tasks t on t.project_id = p_project and t.archived_at is null
  group by d
  order by 1
$$;

revoke all on function public.workload_report(uuid), public.throughput_report(uuid, int),
  public.cycle_time_report(uuid, int), public.project_burndown(uuid, int) from public, anon;
grant execute on function public.workload_report(uuid), public.throughput_report(uuid, int),
  public.cycle_time_report(uuid, int), public.project_burndown(uuid, int) to authenticated, service_role;
