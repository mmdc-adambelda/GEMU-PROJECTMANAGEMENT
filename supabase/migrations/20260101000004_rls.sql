-- Row Level Security. RLS is ENABLED on every table; nothing here relies on the UI.
-- Table privileges are explicit (least privilege) and sensitive columns are protected by
-- column-level grants, e.g. clients can never write org_id, task keys, reporter_id, ...

-- ---------------------------------------------------------------- extra helpers
create function private.u_can_create_project(uid uuid, sp uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.spaces s
    where s.id = sp and (
      private.u_can_manage_space(uid, sp)
      or (private.u_org_role(uid, s.org_id) = 'member'
          and private.u_has_space_access(uid, sp)
          and not exists (select 1 from public.space_members m
                          where m.space_id = sp and m.user_id = uid and m.role = 'viewer'))
    )
  )
$$;
create function private.can_create_project(sp uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.u_can_create_project((select auth.uid()), sp)
$$;
create function private.can_manage_task(task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.u_can_manage_project((select auth.uid()), private.u_task_project(task)), false)
$$;
create function private.label_in_task_org(label uuid, task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.labels l join public.tasks t on t.org_id = l.org_id
                 where l.id = label and t.id = task)
$$;
create function private.can_create_space(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = ws and (
      private.u_is_org_admin((select auth.uid()), w.org_id)
      or (private.u_org_role((select auth.uid()), w.org_id) = 'member'
          and private.u_has_workspace_access((select auth.uid()), ws))))
$$;
create function private.space_in_org(sp uuid, org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.spaces where id = sp and org_id = org)
$$;
create function private.task_path_ok(path text, task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tasks t
                 where t.id = task and path like t.org_id::text || '/' || t.id::text || '/%')
$$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname in
      ('u_can_create_project','can_create_project','can_manage_task','label_in_task_org','can_create_space','space_in_org','task_path_ok')
  loop
    execute format('revoke all on function %s from public', f.sig);
    if f.proname not like 'u\_%' then
      execute format('grant execute on function %s to anon, authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- enable RLS everywhere
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------- privileges
grant select on all tables in schema public to authenticated;
grant update (full_name, avatar_url, job_title, timezone, preferences) on public.profiles to authenticated;
grant update (name, logo_url, settings) on public.organizations to authenticated;
grant delete on public.organizations to authenticated;
grant update (role, status), delete on public.organization_members to authenticated;
grant update (revoked_at), delete on public.organization_invitations to authenticated;
grant insert (org_id, name, description, icon, is_private),
      update (name, description, icon, is_private, archived_at), delete on public.workspaces to authenticated;
grant insert, delete on public.workspace_members to authenticated;
grant insert (workspace_id, name, description, icon, color, owner_id, is_private),
      update (name, description, icon, color, owner_id, is_private, archived_at), delete on public.spaces to authenticated;
grant insert, update (space_id, user_id, role), delete on public.space_members to authenticated;
grant insert (space_id, name, color, category, position, is_default, wip_limit),
      update (name, color, category, position, is_default, wip_limit), delete on public.workflow_statuses to authenticated;
grant insert, update (required_fields), delete on public.workflow_transitions to authenticated;
grant insert (space_id, name, key, description, lead_id, start_date, due_date, priority, status, tags, icon, color, template),
      update (name, description, lead_id, start_date, due_date, priority, status, tags, icon, color, archived_at),
      delete on public.projects to authenticated;
grant insert, update (project_id, user_id, role), delete on public.project_members to authenticated;
grant insert, update (name, color), delete on public.labels to authenticated;
grant insert (project_id, title, description, status_id, priority, type, assignee_id, parent_id,
              start_date, due_date, estimate_minutes, resolution, position),
      update (project_id, title, description, status_id, priority, type, assignee_id, parent_id,
              start_date, due_date, estimate_minutes, resolution, position, archived_at),
      delete on public.tasks to authenticated;
grant insert, delete on public.task_labels to authenticated;
grant insert, delete on public.task_watchers to authenticated;
grant insert (task_id, blocked_by_task_id), delete on public.task_dependencies to authenticated;
grant insert (task_id, author_id, parent_id, body), update (body), delete on public.task_comments to authenticated;
grant insert (task_id, uploaded_by, storage_path, file_name, mime_type, size_bytes), delete on public.task_attachments to authenticated;
grant insert (task_id, user_id, minutes, description, logged_on),
      update (minutes, description, logged_on), delete on public.time_entries to authenticated;
grant insert (org_id, space_id, name, field_type, options, is_required, position),
      update (name, options, is_required, position), delete on public.custom_field_definitions to authenticated;
grant insert, update (task_id, field_id, value), delete on public.task_custom_field_values to authenticated;
grant update (read_at), delete on public.notifications to authenticated;
grant insert, update (user_id, org_id, config), delete on public.dashboard_configurations to authenticated;
grant insert (org_id, project_id, owner_id, name, is_shared, config),
      update (name, is_shared, config), delete on public.saved_views to authenticated;
grant insert (org_id, space_id, project_id, name, is_enabled, trigger_type, conditions, actions),
      update (name, is_enabled, conditions, actions), delete on public.automation_rules to authenticated;

-- ---------------------------------------------------------------- policies
-- profiles (rows are created by the auth trigger only)
create policy profiles_select on public.profiles for select to authenticated
  using (private.shares_org_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- organizations (created through public.create_organization())
create policy organizations_select on public.organizations for select to authenticated
  using (private.is_org_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (private.is_org_admin(id)) with check (private.is_org_admin(id));
create policy organizations_delete on public.organizations for delete to authenticated
  using (private.is_org_owner(id));

-- members (inserts only via accept_invitation / create_organization)
create policy org_members_select on public.organization_members for select to authenticated
  using (user_id = (select auth.uid()) or private.org_role(org_id) in ('owner', 'admin', 'member'));
create policy org_members_update on public.organization_members for update to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy org_members_delete on public.organization_members for delete to authenticated
  using (private.is_org_admin(org_id) or user_id = (select auth.uid()));

create policy org_invitations_select on public.organization_invitations for select to authenticated
  using (private.is_org_admin(org_id));
create policy org_invitations_update on public.organization_invitations for update to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy org_invitations_delete on public.organization_invitations for delete to authenticated
  using (private.is_org_admin(org_id));

-- workspaces
create policy workspaces_select on public.workspaces for select to authenticated
  using (private.can_view_workspace(id) or private.is_org_admin(org_id));
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (private.is_org_admin(org_id));
create policy workspaces_update on public.workspaces for update to authenticated
  using (private.can_manage_workspace(id)) with check (private.can_manage_workspace(id));
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (private.can_manage_workspace(id));

create policy workspace_members_select on public.workspace_members for select to authenticated
  using (private.can_view_workspace(workspace_id));
create policy workspace_members_insert on public.workspace_members for insert to authenticated
  with check (private.can_manage_workspace(workspace_id));
create policy workspace_members_delete on public.workspace_members for delete to authenticated
  using (private.can_manage_workspace(workspace_id));

-- spaces
create policy spaces_select on public.spaces for select to authenticated
  using (private.can_view_space(id) or private.is_org_admin(org_id)
         or (owner_id = (select auth.uid()) and private.is_org_member(org_id)));
create policy spaces_insert on public.spaces for insert to authenticated
  with check (private.can_create_space(workspace_id));
create policy spaces_update on public.spaces for update to authenticated
  using (private.can_manage_space(id)) with check (private.can_manage_space(id));
create policy spaces_delete on public.spaces for delete to authenticated
  using (private.is_org_admin(org_id));

create policy space_members_select on public.space_members for select to authenticated
  using (private.can_view_space(space_id));
create policy space_members_insert on public.space_members for insert to authenticated
  with check (private.can_manage_space(space_id));
create policy space_members_update on public.space_members for update to authenticated
  using (private.can_manage_space(space_id)) with check (private.can_manage_space(space_id));
create policy space_members_delete on public.space_members for delete to authenticated
  using (private.can_manage_space(space_id));

-- workflows
create policy workflow_statuses_select on public.workflow_statuses for select to authenticated
  using (private.can_view_space(space_id));
create policy workflow_statuses_insert on public.workflow_statuses for insert to authenticated
  with check (private.can_manage_space(space_id));
create policy workflow_statuses_update on public.workflow_statuses for update to authenticated
  using (private.can_manage_space(space_id)) with check (private.can_manage_space(space_id));
create policy workflow_statuses_delete on public.workflow_statuses for delete to authenticated
  using (private.can_manage_space(space_id));

create policy workflow_transitions_select on public.workflow_transitions for select to authenticated
  using (private.can_view_space(space_id));
create policy workflow_transitions_insert on public.workflow_transitions for insert to authenticated
  with check (private.can_manage_space(space_id));
create policy workflow_transitions_update on public.workflow_transitions for update to authenticated
  using (private.can_manage_space(space_id)) with check (private.can_manage_space(space_id));
create policy workflow_transitions_delete on public.workflow_transitions for delete to authenticated
  using (private.can_manage_space(space_id));

-- projects
create policy projects_select on public.projects for select to authenticated
  using (private.can_view_project(id) or private.is_org_admin(org_id)
         or (lead_id = (select auth.uid()) and private.is_org_member(org_id)));
create policy projects_insert on public.projects for insert to authenticated
  with check (private.can_create_project(space_id));
create policy projects_update on public.projects for update to authenticated
  using (private.can_manage_project(id)) with check (private.can_manage_project(id));
create policy projects_delete on public.projects for delete to authenticated
  using (private.can_manage_project(id));

create policy project_members_select on public.project_members for select to authenticated
  using (private.can_view_project(project_id));
create policy project_members_insert on public.project_members for insert to authenticated
  with check (private.can_manage_project(project_id));
create policy project_members_update on public.project_members for update to authenticated
  using (private.can_manage_project(project_id)) with check (private.can_manage_project(project_id));
create policy project_members_delete on public.project_members for delete to authenticated
  using (private.can_manage_project(project_id));

-- labels
create policy labels_select on public.labels for select to authenticated
  using (private.is_org_member(org_id));
create policy labels_insert on public.labels for insert to authenticated
  with check (private.org_role(org_id) in ('owner', 'admin', 'member'));
create policy labels_update on public.labels for update to authenticated
  using (private.org_role(org_id) in ('owner', 'admin', 'member'))
  with check (private.org_role(org_id) in ('owner', 'admin', 'member'));
create policy labels_delete on public.labels for delete to authenticated
  using (private.is_org_admin(org_id));

-- tasks
create policy tasks_select on public.tasks for select to authenticated
  using (private.can_view_project(project_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (private.can_edit_project(project_id) and reporter_id = (select auth.uid()));
create policy tasks_update on public.tasks for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (private.can_manage_project(project_id)
         or (reporter_id = (select auth.uid()) and private.can_edit_project(project_id)));

create policy task_labels_select on public.task_labels for select to authenticated
  using (private.can_view_task(task_id));
create policy task_labels_insert on public.task_labels for insert to authenticated
  with check (private.can_edit_task(task_id) and private.label_in_task_org(label_id, task_id));
create policy task_labels_delete on public.task_labels for delete to authenticated
  using (private.can_edit_task(task_id));

create policy task_watchers_select on public.task_watchers for select to authenticated
  using (private.can_view_task(task_id));
create policy task_watchers_insert on public.task_watchers for insert to authenticated
  with check ((user_id = (select auth.uid()) and private.can_view_task(task_id)) or private.can_edit_task(task_id));
create policy task_watchers_delete on public.task_watchers for delete to authenticated
  using (user_id = (select auth.uid()) or private.can_edit_task(task_id));

create policy task_dependencies_select on public.task_dependencies for select to authenticated
  using (private.can_view_task(task_id) and private.can_view_task(blocked_by_task_id));
create policy task_dependencies_insert on public.task_dependencies for insert to authenticated
  with check (private.can_edit_task(task_id) and private.can_view_task(blocked_by_task_id));
create policy task_dependencies_delete on public.task_dependencies for delete to authenticated
  using (private.can_edit_task(task_id));

create policy task_comments_select on public.task_comments for select to authenticated
  using (private.can_view_task(task_id));
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and private.can_view_task(task_id));
create policy task_comments_update on public.task_comments for update to authenticated
  using (author_id = (select auth.uid()) and private.can_view_task(task_id))
  with check (author_id = (select auth.uid()));
create policy task_comments_delete on public.task_comments for delete to authenticated
  using (author_id = (select auth.uid()) or private.can_manage_task(task_id));

create policy task_attachments_select on public.task_attachments for select to authenticated
  using (private.can_view_task(task_id));
create policy task_attachments_insert on public.task_attachments for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and private.can_edit_task(task_id)
              and private.task_path_ok(storage_path, task_id));
create policy task_attachments_delete on public.task_attachments for delete to authenticated
  using ((uploaded_by = (select auth.uid()) and private.can_edit_task(task_id)) or private.can_manage_task(task_id));

create policy time_entries_select on public.time_entries for select to authenticated
  using (private.can_view_task(task_id));
create policy time_entries_insert on public.time_entries for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_edit_task(task_id));
create policy time_entries_update on public.time_entries for update to authenticated
  using (user_id = (select auth.uid()) and private.can_edit_task(task_id))
  with check (user_id = (select auth.uid()));
create policy time_entries_delete on public.time_entries for delete to authenticated
  using (user_id = (select auth.uid()));

-- custom fields
create policy cf_definitions_select on public.custom_field_definitions for select to authenticated
  using (private.is_org_member(org_id) and (space_id is null or private.can_view_space(space_id)));
create policy cf_definitions_insert on public.custom_field_definitions for insert to authenticated
  with check (
    (space_id is null and private.is_org_admin(org_id))
    or (space_id is not null and private.space_in_org(space_id, org_id) and private.can_manage_space(space_id)));
create policy cf_definitions_update on public.custom_field_definitions for update to authenticated
  using ((space_id is null and private.is_org_admin(org_id)) or (space_id is not null and private.can_manage_space(space_id)))
  with check ((space_id is null and private.is_org_admin(org_id)) or (space_id is not null and private.can_manage_space(space_id)));
create policy cf_definitions_delete on public.custom_field_definitions for delete to authenticated
  using ((space_id is null and private.is_org_admin(org_id)) or (space_id is not null and private.can_manage_space(space_id)));

create policy cf_values_select on public.task_custom_field_values for select to authenticated
  using (private.can_view_task(task_id));
create policy cf_values_insert on public.task_custom_field_values for insert to authenticated
  with check (private.can_edit_task(task_id));
create policy cf_values_update on public.task_custom_field_values for update to authenticated
  using (private.can_edit_task(task_id)) with check (private.can_edit_task(task_id));
create policy cf_values_delete on public.task_custom_field_values for delete to authenticated
  using (private.can_edit_task(task_id));

-- activity (written only by security-definer triggers)
create policy activity_select on public.activity_log for select to authenticated
  using (
    case
      when task_id is not null then private.can_view_task(task_id)
      when project_id is not null then private.can_view_project(project_id)
      else private.org_role(org_id) in ('owner', 'admin', 'member')
    end);

-- notifications: only the recipient, and only while they can still see the task
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and (task_id is null or private.can_view_task(task_id)));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- dashboards & saved views
create policy dashboards_select on public.dashboard_configurations for select to authenticated
  using (user_id = (select auth.uid()));
create policy dashboards_insert on public.dashboard_configurations for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_org_member(org_id));
create policy dashboards_update on public.dashboard_configurations for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy dashboards_delete on public.dashboard_configurations for delete to authenticated
  using (user_id = (select auth.uid()));

create policy saved_views_select on public.saved_views for select to authenticated
  using (owner_id = (select auth.uid())
         or (is_shared and private.is_org_member(org_id) and (project_id is null or private.can_view_project(project_id))));
create policy saved_views_insert on public.saved_views for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.is_org_member(org_id)
              and (project_id is null or private.can_view_project(project_id)));
create policy saved_views_update on public.saved_views for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy saved_views_delete on public.saved_views for delete to authenticated
  using (owner_id = (select auth.uid()));

-- automations
create policy automation_rules_select on public.automation_rules for select to authenticated
  using (private.is_org_member(org_id) and private.can_view_space(space_id));
create policy automation_rules_insert on public.automation_rules for insert to authenticated
  with check (private.space_in_org(space_id, org_id) and private.can_manage_space(space_id));
create policy automation_rules_update on public.automation_rules for update to authenticated
  using (private.can_manage_space(space_id)) with check (private.can_manage_space(space_id));
create policy automation_rules_delete on public.automation_rules for delete to authenticated
  using (private.can_manage_space(space_id));

create policy automation_executions_select on public.automation_executions for select to authenticated
  using (exists (select 1 from public.automation_rules r where r.id = rule_id and private.can_manage_space(r.space_id)));
