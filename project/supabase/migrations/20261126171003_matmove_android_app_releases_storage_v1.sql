-- MatMove Android release bucket: public download, active owner-only writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'matmove-app-releases',
  'matmove-app-releases',
  true,
  52428800,
  array['application/vnd.android.package-archive']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists matmove_app_releases_public_read on storage.objects;
create policy matmove_app_releases_public_read
on storage.objects for select to public
using (bucket_id = 'matmove-app-releases');

drop policy if exists matmove_app_releases_owner_insert on storage.objects;
create policy matmove_app_releases_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'matmove-app-releases'
  and exists (
    select 1 from public.matmove_staff_access a
    where a.id = (select auth.uid())
      and a.is_active = true
      and a.removed_at is null
      and a.is_owner = true
  )
);

drop policy if exists matmove_app_releases_owner_update on storage.objects;
create policy matmove_app_releases_owner_update
on storage.objects for update to authenticated
using (
  bucket_id = 'matmove-app-releases'
  and exists (
    select 1 from public.matmove_staff_access a
    where a.id = (select auth.uid())
      and a.is_active = true
      and a.removed_at is null
      and a.is_owner = true
  )
)
with check (
  bucket_id = 'matmove-app-releases'
  and exists (
    select 1 from public.matmove_staff_access a
    where a.id = (select auth.uid())
      and a.is_active = true
      and a.removed_at is null
      and a.is_owner = true
  )
);

drop policy if exists matmove_app_releases_owner_delete on storage.objects;
create policy matmove_app_releases_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'matmove-app-releases'
  and exists (
    select 1 from public.matmove_staff_access a
    where a.id = (select auth.uid())
      and a.is_active = true
      and a.removed_at is null
      and a.is_owner = true
  )
);
