-- MatMove Events Lifecycle + Admin Refund Ledger Repair 03
-- Run once in the same Supabase project used by the Admin and Customer applications.
-- This migration preserves events, tickets and completed payments. Removing an event
-- only hides it from customer listings; it never deletes historical payment records.

begin;

alter table public.platform_events
  add column if not exists event_status text not null default 'scheduled',
  add column if not exists status_note text,
  add column if not exists removed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.platform_events'::regclass
      and conname = 'matmove_platform_events_event_status_check'
  ) then
    alter table public.platform_events
      add constraint matmove_platform_events_event_status_check
      check (event_status in ('scheduled', 'postponed', 'past', 'removed', 'inactive'));
  end if;
end $$;

-- Preserve previously inactive entries as inactive, and label elapsed active events as past.
update public.platform_events
set event_status = case
  when is_active is false then 'inactive'
  when event_date < now() then 'past'
  else 'scheduled'
end
where event_status is null or event_status = 'scheduled';

create index if not exists platform_events_customer_lifecycle_idx
  on public.platform_events (is_active, event_status, event_date);

-- Public customers can read only active event posts. Staff with events.overview
-- can publish/update event posts. Physical DELETE is deliberately not granted because
-- payment and ticket history must remain attached to the original event.
alter table public.platform_events enable row level security;
revoke all on table public.platform_events from public, anon, authenticated;
grant select on table public.platform_events to anon, authenticated;
grant insert, update on table public.platform_events to authenticated;

drop policy if exists "Admins manage events" on public.platform_events;
drop policy if exists "Public read active events" on public.platform_events;
drop policy if exists matmove_platform_events_public_active_read on public.platform_events;
drop policy if exists matmove_platform_events_staff_manage on public.platform_events;
drop policy if exists matmove_platform_events_staff_read on public.platform_events;
drop policy if exists matmove_platform_events_staff_insert on public.platform_events;
drop policy if exists matmove_platform_events_staff_update on public.platform_events;
create policy matmove_platform_events_public_active_read
on public.platform_events for select to anon, authenticated
using (is_active is true);
create policy matmove_platform_events_staff_read
on public.platform_events for select to authenticated
using (public.matmove_admin_can('events.overview'));
create policy matmove_platform_events_staff_insert
on public.platform_events for insert to authenticated
with check (public.matmove_admin_can('events.overview'));
create policy matmove_platform_events_staff_update
on public.platform_events for update to authenticated
using (public.matmove_admin_can('events.overview'))
with check (public.matmove_admin_can('events.overview'));
-- No DELETE grant or DELETE policy: event posts are archived, while ticket/payment history remains.


-- Event flyer storage: public can view published flyer images; only authorised
-- event staff can upload. This bucket is public-read, not public-write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-flyers', 'event-flyers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists matmove_event_flyers_public_read on storage.objects;
drop policy if exists matmove_event_flyers_staff_upload on storage.objects;
create policy matmove_event_flyers_public_read
on storage.objects for select to anon, authenticated
using (bucket_id = 'event-flyers');
create policy matmove_event_flyers_staff_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-flyers'
  and public.matmove_admin_can('events.overview')
);

-- The preflight found broad KYC read/upload policies. Remove these specific
-- unsafe policies while keeping the existing per-user folder policies intact.
drop policy if exists "Public Access KYC" on storage.objects;
drop policy if exists "Users upload KYC Documents" on storage.objects;

-- Enable live event-list refreshes when the Supabase Realtime publication exists.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'platform_events'
     ) then
    alter publication supabase_realtime add table public.platform_events;
  end if;
end $$;

-- Server-only refund ledger. Every refund has a stable request key and provider transfer ID.
create table if not exists public.matmove_admin_refunds (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  initiated_by uuid not null references auth.users(id) on delete restrict,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  recipient_account_id text not null,
  source_account_id text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'SLE' check (currency = 'SLE'),
  reason text not null,
  provider_transfer_id text unique,
  provider_status text not null default 'initiating',
  state text not null default 'initiating'
    check (state in ('initiating', 'pending', 'processing', 'completed', 'failed', 'review_required')),
  failure_detail text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.matmove_admin_refunds enable row level security;
revoke all on table public.matmove_admin_refunds from public, anon, authenticated;
grant all on table public.matmove_admin_refunds to service_role;

create index if not exists matmove_admin_refunds_recipient_created_idx
  on public.matmove_admin_refunds (recipient_user_id, created_at desc);
create index if not exists matmove_admin_refunds_state_created_idx
  on public.matmove_admin_refunds (state, created_at desc);

commit;

-- Verification queries
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'platform_events'
  and column_name in ('event_status', 'status_note', 'removed_at')
order by column_name;

select state, count(*) as refunds
from public.matmove_admin_refunds
group by state
order by state;

-- Diagnostic for the currently reported payment target-shape error.
-- Compare the live definition with the server's supported shapes before changing it.
select c.conname, pg_get_constraintdef(c.oid) as constraint_definition
from pg_constraint c
where c.conrelid = 'public.matmove_purchase_payments'::regclass
  and c.conname = 'matmove_purchase_target_shape';
