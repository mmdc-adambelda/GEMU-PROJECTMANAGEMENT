-- Storage buckets and policies.
--   avatars      public read, write only inside your own <user_id>/ folder
--   org-logos    public read, write only by org admins inside <org_id>/
--   attachments  PRIVATE. Path = <org_id>/<task_id>/<uuid>-<filename>; access follows task access.
--                Clients get time-limited signed URLs; the bucket is never public.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',   'avatars',   true,  2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('org-logos', 'org-logos', true,  2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  ('attachments', 'attachments', false, 26214400, array[
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain', 'text/csv', 'text/markdown', 'application/zip', 'application/json',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- first path segment as uuid, or null when the path is malformed (never throws)
create function private.path_uuid(path text, idx int) returns uuid
language sql immutable set search_path = '' as $$
  select case when (string_to_array(path, '/'))[idx] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then (string_to_array(path, '/'))[idx]::uuid end
$$;
grant execute on function private.path_uuid(text, int) to anon, authenticated, service_role;

create function private.can_read_attachment(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.u_can_view_task(auth.uid(), private.path_uuid(path, 2))
                  and private.task_path_ok(path, private.path_uuid(path, 2)), false)
$$;
create function private.can_write_attachment(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.u_can_edit_task(auth.uid(), private.path_uuid(path, 2))
                  and private.task_path_ok(path, private.path_uuid(path, 2)), false)
$$;
create function private.can_manage_org_logo(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.u_is_org_admin(auth.uid(), private.path_uuid(path, 1)), false)
$$;
revoke all on function private.can_read_attachment(text), private.can_write_attachment(text),
  private.can_manage_org_logo(text) from public;
grant execute on function private.can_read_attachment(text), private.can_write_attachment(text),
  private.can_manage_org_logo(text) to authenticated, service_role;

create policy "avatars write own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and private.path_uuid(name, 1) = (select auth.uid()));
create policy "avatars update own folder" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and private.path_uuid(name, 1) = (select auth.uid()));
create policy "avatars delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and private.path_uuid(name, 1) = (select auth.uid()));

create policy "org logos admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'org-logos' and private.can_manage_org_logo(name));
create policy "org logos admin update" on storage.objects for update to authenticated
  using (bucket_id = 'org-logos' and private.can_manage_org_logo(name));
create policy "org logos admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'org-logos' and private.can_manage_org_logo(name));

create policy "attachments read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and private.can_read_attachment(name));
create policy "attachments upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and private.can_write_attachment(name));
create policy "attachments delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and private.can_write_attachment(name)
         and (owner_id = (select auth.uid())::text
              or private.can_manage_task(private.path_uuid(name, 2))));
