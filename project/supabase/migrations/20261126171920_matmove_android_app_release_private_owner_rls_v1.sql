-- Move the release owner check into the non-exposed private schema.
-- The Storage RLS policy can call it, but it is not a public PostgREST RPC.
create or replace function private.matmove_is_active_owner()
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select exists (
    select 1
    from public.matmove_staff_access a
    where a.id = (select auth.uid())
      and a.is_active = true
      and a.removed_at is null
      and a.is_owner = true
  );
$function$;

revoke all on function private.matmove_is_active_owner() from public;
revoke all on function private.matmove_is_active_owner() from anon;
grant usage on schema private to authenticated;
grant execute on function private.matmove_is_active_owner() to authenticated;

drop policy if exists matmove_app_releases_owner_insert on storage.objects;
create policy matmove_app_releases_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'matmove-app-releases'
  and (select private.matmove_is_active_owner())
);

drop policy if exists matmove_app_releases_owner_update on storage.objects;
create policy matmove_app_releases_owner_update
on storage.objects for update to authenticated
using (
  bucket_id = 'matmove-app-releases'
  and (select private.matmove_is_active_owner())
)
with check (
  bucket_id = 'matmove-app-releases'
  and (select private.matmove_is_active_owner())
);

drop policy if exists matmove_app_releases_owner_delete on storage.objects;
create policy matmove_app_releases_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'matmove-app-releases'
  and (select private.matmove_is_active_owner())
);

drop function if exists public.matmove_is_active_owner();
