-- Capability probes for the UI: lets the client show/hide controls using the SAME functions that
-- the RLS policies use, instead of re-implementing the rules in TypeScript. They only describe
-- what the caller may do; every write is still checked by RLS and triggers.

create function public.project_access(p_project uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'can_view', private.can_view_project(p_project),
    'can_edit', private.can_edit_project(p_project),
    'can_manage', private.can_manage_project(p_project))
$$;

create function public.space_access(p_space uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'can_view', private.can_view_space(p_space),
    'can_manage', private.can_manage_space(p_space),
    'can_create_project', private.can_create_project(p_space))
$$;

revoke all on function public.project_access(uuid), public.space_access(uuid) from public, anon;
grant execute on function public.project_access(uuid), public.space_access(uuid) to authenticated, service_role;
