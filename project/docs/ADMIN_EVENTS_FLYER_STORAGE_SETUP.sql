-- MatMove Batch 02: secure event flyer storage setup
-- Review this file before running it in Supabase SQL Editor.
-- This script creates/configures the PUBLIC event-flyers bucket and grants
-- uploads/deletes only to authenticated staff with the Events permission.
-- It does not alter platform_events rows, existing customer policies, or payment data.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-flyers',
  'event-flyers',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Ensure the existing MatMove staff permission helper is available before
-- installing staff-only object policies. Do not replace it or grant service role.
do $$
begin
  if to_regprocedure('public.matmove_admin_can(text)') is null then
    raise exception 'SETUP_REQUIRED: Apply the MatMove staff-access permission migration before enabling event flyer uploads.';
  end if;
end;
$$;

-- Public visitors can fetch objects from this public bucket by URL.
-- Only authenticated staff with the full Events or Events Overview permission
-- can upload/delete objects. There is intentionally no public INSERT/DELETE policy.
drop policy if exists matmove_event_flyers_staff_insert on storage.objects;
create policy matmove_event_flyers_staff_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-flyers'
  and (
    public.matmove_admin_can('events')
    or public.matmove_admin_can('events.overview')
  )
);

drop policy if exists matmove_event_flyers_staff_delete on storage.objects;
create policy matmove_event_flyers_staff_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-flyers'
  and (
    public.matmove_admin_can('events')
    or public.matmove_admin_can('events.overview')
  )
);

commit;

-- Verification: the bucket must be public, limited to 5 MB and image formats.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'event-flyers';

-- Verify these two MatMove policies exist. Also inspect any other storage.objects
-- policies; permissive policies are OR-combined, so do not leave any broad
-- authenticated/anonymous write policy on storage.objects.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
order by policyname;

-- Expected app behavior after this setup:
-- 1. Admin selects a JPG, PNG or WebP flyer (max 5 MB).
-- 2. Admin app uploads it to event-flyers, then saves its public URL in
--    platform_events.flyer_url.
-- 3. Customer Events Hub already reads flyer_url and displays that image.
-- 4. If event insert fails after upload, the admin app attempts to remove the
--    newly uploaded object using the staff-only DELETE policy.
