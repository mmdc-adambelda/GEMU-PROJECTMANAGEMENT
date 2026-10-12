-- FlowSpace core schema.
-- Hierarchy: organization -> workspace -> space -> project -> task (-> subtask)
-- Statuses/workflows live at SPACE scope and are fully data-driven.

-- ---------------------------------------------------------------- types
create type public.org_role as enum ('owner', 'admin', 'member', 'guest');
create type public.member_status as enum ('active', 'deactivated');
create type public.space_role as enum ('admin', 'member', 'viewer');
create type public.project_role as enum ('lead', 'member', 'viewer');
create type public.status_category as enum ('todo', 'in_progress', 'done');
create type public.task_priority as enum ('lowest', 'low', 'medium', 'high', 'highest');
create type public.task_type as enum ('task', 'bug', 'story', 'epic', 'improvement', 'request');
create type public.project_status as enum ('planned', 'active', 'on_hold', 'completed', 'cancelled');
create type public.custom_field_type as enum ('text', 'number', 'date', 'checkbox', 'select', 'multi_select', 'url');
create type public.notification_type as enum (
  'assigned', 'reassigned', 'mention', 'comment', 'due_soon', 'overdue', 'invitation', 'status_change'
);

-- ---------------------------------------------------------------- generic trigger
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  avatar_url text,
  job_title text,
  timezone text not null default 'UTC',
  -- UI preferences: theme, sidebar state, preferred project view, notification prefs
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- organizations
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  logo_url text,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null default 'member',
  status public.member_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id) where status = 'active';
create trigger organization_members_updated_at before update on public.organization_members
  for each row execute function public.set_updated_at();

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email)),
  role public.org_role not null default 'member' check (role <> 'owner'),
  -- sha256 hex of the secret token; the plaintext is only ever returned once at creation
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index organization_invitations_pending_idx
  on public.organization_invitations (org_id, email)
  where accepted_at is null and revoked_at is null;

-- ---------------------------------------------------------------- workspaces
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text,
  icon text not null default 'briefcase',
  is_private boolean not null default false,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_org_idx on public.workspaces (org_id);
create trigger workspaces_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- ---------------------------------------------------------------- spaces
create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text,
  icon text not null default 'layers',
  color text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  owner_id uuid references public.profiles (id) on delete set null,
  is_private boolean not null default false,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index spaces_workspace_idx on public.spaces (workspace_id);
create index spaces_org_idx on public.spaces (org_id);
create trigger spaces_updated_at before update on public.spaces
  for each row execute function public.set_updated_at();

create table public.space_members (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.space_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index space_members_user_idx on public.space_members (user_id);

-- ---------------------------------------------------------------- workflows (per space)
create table public.workflow_statuses (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  color text not null default '#94a3b8' check (color ~ '^#[0-9a-fA-F]{6}$'),
  category public.status_category not null default 'todo',
  position integer not null default 0,
  is_default boolean not null default false,
  -- soft limit shown on the Kanban column; not enforced by the database
  wip_limit integer check (wip_limit is null or wip_limit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, name)
);
create unique index workflow_statuses_one_default_idx on public.workflow_statuses (space_id) where is_default;
create index workflow_statuses_space_idx on public.workflow_statuses (space_id, position);
create trigger workflow_statuses_updated_at before update on public.workflow_statuses
  for each row execute function public.set_updated_at();

-- If a status has NO outgoing rows here, any transition from it is allowed.
create table public.workflow_transitions (
  space_id uuid not null references public.spaces (id) on delete cascade,
  from_status_id uuid not null references public.workflow_statuses (id) on delete cascade,
  to_status_id uuid not null references public.workflow_statuses (id) on delete cascade,
  -- subset of: assignee, due_date, estimate, resolution
  required_fields text[] not null default '{}'
    check (required_fields <@ array['assignee', 'due_date', 'estimate', 'resolution']),
  primary key (from_status_id, to_status_id),
  check (from_status_id <> to_status_id)
);
create index workflow_transitions_space_idx on public.workflow_transitions (space_id);

-- ---------------------------------------------------------------- projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  key text not null check (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  description text,
  lead_id uuid references public.profiles (id) on delete set null,
  start_date date,
  due_date date,
  priority public.task_priority not null default 'medium',
  status public.project_status not null default 'active',
  tags text[] not null default '{}',
  icon text not null default 'folder',
  color text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  template text not null default 'general',
  next_task_number integer not null default 1,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key),
  check (due_date is null or start_date is null or due_date >= start_date)
);
create index projects_space_idx on public.projects (space_id);
create index projects_org_idx on public.projects (org_id);
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.project_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

-- ---------------------------------------------------------------- labels & tasks
create table public.labels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);
create unique index labels_org_name_idx on public.labels (org_id, lower(name));

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  number integer not null,
  key text not null,
  title text not null check (char_length(title) between 1 and 300),
  -- Markdown source (rendered without raw HTML on the client)
  description text not null default '' check (char_length(description) <= 50000),
  -- NO ACTION (checked at end of statement): a status in use cannot be deleted directly,
  -- but deleting its whole space still cascades. Use public.delete_status() to migrate tasks.
  status_id uuid not null references public.workflow_statuses (id),
  priority public.task_priority not null default 'medium',
  type public.task_type not null default 'task',
  assignee_id uuid references public.profiles (id) on delete set null,
  reporter_id uuid references public.profiles (id) on delete set null,
  parent_id uuid references public.tasks (id) on delete cascade,
  start_date date,
  due_date date,
  estimate_minutes integer check (estimate_minutes is null or estimate_minutes >= 0),
  resolution text,
  completed_at timestamptz,
  archived_at timestamptz,
  position double precision not null default 0,
  search tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(key, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, number),
  check (due_date is null or start_date is null or due_date >= start_date)
);
create index tasks_project_status_idx on public.tasks (project_id, status_id, position);
create index tasks_org_idx on public.tasks (org_id);
create index tasks_assignee_idx on public.tasks (assignee_id) where assignee_id is not null;
create index tasks_reporter_idx on public.tasks (reporter_id);
create index tasks_parent_idx on public.tasks (parent_id) where parent_id is not null;
create index tasks_due_idx on public.tasks (due_date) where due_date is not null;
create index tasks_key_idx on public.tasks (org_id, key);
create index tasks_search_idx on public.tasks using gin (search);
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

create table public.task_labels (
  task_id uuid not null references public.tasks (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  primary key (task_id, label_id)
);
create index task_labels_label_idx on public.task_labels (label_id);

create table public.task_watchers (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index task_watchers_user_idx on public.task_watchers (user_id);

create table public.task_dependencies (
  task_id uuid not null references public.tasks (id) on delete cascade,
  blocked_by_task_id uuid not null references public.tasks (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, blocked_by_task_id),
  check (task_id <> blocked_by_task_id)
);
create index task_dependencies_blocker_idx on public.task_dependencies (blocked_by_task_id);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.task_comments (id) on delete cascade,
  -- mentions are written as [@Name](user:<uuid>)
  body text not null check (char_length(body) between 1 and 20000),
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  -- object path inside the private `attachments` bucket: <org_id>/<task_id>/<uuid>-<name>
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 26214400),
  created_at timestamptz not null default now()
);
create index task_attachments_task_idx on public.task_attachments (task_id);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  minutes integer not null check (minutes > 0 and minutes <= 1440),
  description text,
  logged_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index time_entries_task_idx on public.time_entries (task_id);
create index time_entries_user_idx on public.time_entries (user_id, logged_on);

-- ---------------------------------------------------------------- custom fields
create table public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- null = available org-wide
  space_id uuid references public.spaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  field_type public.custom_field_type not null,
  -- for select / multi_select: array of option strings
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index custom_field_definitions_org_idx on public.custom_field_definitions (org_id, space_id);

create table public.task_custom_field_values (
  task_id uuid not null references public.tasks (id) on delete cascade,
  field_id uuid not null references public.custom_field_definitions (id) on delete cascade,
  value jsonb not null,
  primary key (task_id, field_id)
);

-- ---------------------------------------------------------------- activity & notifications
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  -- never contains secrets; only field names and old/new display values
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_task_idx on public.activity_log (task_id, created_at desc);
create index activity_log_project_idx on public.activity_log (project_id, created_at desc);
create index activity_log_org_idx on public.activity_log (org_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete cascade,
  type public.notification_type not null,
  task_id uuid references public.tasks (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  title text not null,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create unique index notifications_dedupe_idx on public.notifications (user_id, dedupe_key) where dedupe_key is not null;

-- ---------------------------------------------------------------- dashboards, views, automations
create table public.dashboard_configurations (
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  is_shared boolean not null default false,
  -- filters, sort, grouping, visible columns
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index saved_views_owner_idx on public.saved_views (owner_id);
create trigger saved_views_updated_at before update on public.saved_views
  for each row execute function public.set_updated_at();

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  is_enabled boolean not null default true,
  trigger_type text not null check (trigger_type in ('task_created', 'status_changed', 'subtasks_completed', 'task_overdue')),
  -- {"to_status_id": uuid, "priority": "...", "type": "..."}; all keys optional
  conditions jsonb not null default '{}'::jsonb,
  -- [{"type": "assign_user"|"set_priority"|"notify_user"|"notify_project_lead"|"set_status", ...}]
  actions jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index automation_rules_space_idx on public.automation_rules (space_id, trigger_type) where is_enabled;
create trigger automation_rules_updated_at before update on public.automation_rules
  for each row execute function public.set_updated_at();

create table public.automation_executions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.automation_rules (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  outcome text not null check (outcome in ('success', 'skipped', 'error')),
  message text,
  executed_at timestamptz not null default now()
);
create index automation_executions_rule_idx on public.automation_executions (rule_id, executed_at desc);
