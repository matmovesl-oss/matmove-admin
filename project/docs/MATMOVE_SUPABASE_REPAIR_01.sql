-- MatMove Supabase Repair 01
-- Purpose: restore the missing Travel settings/RPC and Events flyer bucket,
-- enable realtime for the relevant app tables, and replace known overly-broad
-- public policies with scoped customer/staff policies.
--
-- Preconditions confirmed by MatMove preflight (2026-11-01):
--   public.travel_bookings, public.platform_events, public.event_tickets exist;
--   public.matmove_staff_access, public.matmove_admin_can(text),
--   public.matmove_admin_any(text[]) exist;
--   public.travel_settings and the event-flyers bucket do not exist.
--
-- Run in Supabase SQL Editor on the SAME project used by both apps.
-- Review the result before proceeding. This does not change payment-provider
-- secrets or claim to finish Monime asynchronous reconciliation.

begin;

-- 1. Travel settings shared by Admin and Customer.
create table if not exists public.travel_settings (
  id text primary key,
  total_seats integer not null default 50 check (total_seats > 0),
  price_usd numeric(12,2) not null default 100 check (price_usd >= 0),
  price_sle numeric(12,2) not null default 2400 check (price_sle >= 0),
  updated_at timestamptz not null default now()
);

insert into public.travel_settings (id, total_seats, price_usd, price_sle, updated_at)
values ('bus_ghana', 50, 100, 2400, now())
on conflict (id) do nothing;

alter table public.travel_settings enable row level security;
revoke all on table public.travel_settings from public, anon, authenticated;
grant select, insert, update on table public.travel_settings to authenticated;

drop policy if exists matmove_travel_settings_staff_select on public.travel_settings;
create policy matmove_travel_settings_staff_select
on public.travel_settings for select to authenticated
using (public.matmove_admin_any(array[
  'travel.overview', 'travel.manifest', 'travel.boarding', 'travel.payments'
]::text[]));

drop policy if exists matmove_travel_settings_staff_insert on public.travel_settings;
create policy matmove_travel_settings_staff_insert
on public.travel_settings for insert to authenticated
with check (public.matmove_admin_can('travel.overview'));

drop policy if exists matmove_travel_settings_staff_update on public.travel_settings;
create policy matmove_travel_settings_staff_update
on public.travel_settings for update to authenticated
using (public.matmove_admin_can('travel.overview'))
with check (public.matmove_admin_can('travel.overview'));

-- Customers read only the aggregate availability function below, not the
-- settings table or another passenger's manifest.

-- 2. Secure aggregate travel availability RPC (exact no-argument signature
-- called by the Customer PortalHome component).
create or replace function public.matmove_get_travel_availability()
returns table (
  total_seats integer,
  price_usd numeric,
  price_sle numeric,
  held_seats bigint,
  available_seats bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    settings.total_seats,
    settings.price_usd,
    settings.price_sle,
    coalesce(holds.held_seats, 0)::bigint,
    greatest(settings.total_seats::bigint - coalesce(holds.held_seats, 0)::bigint, 0)::bigint
  from public.travel_settings as settings
  cross join lateral (
    select coalesce(sum(greatest(coalesce(bookings.passengers_count, 1), 1)), 0)::bigint as held_seats
    from public.travel_bookings as bookings
    where coalesce(bookings.is_paid, false)
       or bookings.status in ('pending_approval', 'approved', 'boarded')
  ) as holds
  where settings.id = 'bus_ghana';
$$;
revoke all on function public.matmove_get_travel_availability() from public, anon;
grant execute on function public.matmove_get_travel_availability() to authenticated;

-- 3. Enforce the configured fare and the total seat capacity inside Postgres.
create or replace function public.matmove_guard_travel_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  configured_capacity integer;
  configured_price_sle numeric(12,2);
  already_held bigint := 0;
  requested_seats integer;
  is_holding boolean;
begin
  if tg_op = 'UPDATE' then
    -- Keep the fare originally stored for this booking immutable.
    new.fare_amount := old.fare_amount;
    if new.passengers_count is not distinct from old.passengers_count
       and new.status is not distinct from old.status
       and new.is_paid is not distinct from old.is_paid then
      return new;
    end if;
  end if;

  is_holding := coalesce(new.is_paid, false)
    or new.status in ('pending_approval', 'approved', 'boarded');
  if not is_holding then
    return new;
  end if;

  requested_seats := greatest(coalesce(new.passengers_count, 1), 1);
  if requested_seats > 3 then
    raise exception 'A single MatMove travel booking is limited to 3 passengers.' using errcode = 'P0001';
  end if;

  select total_seats, price_sle
    into configured_capacity, configured_price_sle
  from public.travel_settings
  where id = 'bus_ghana'
  for update;

  if not found then
    raise exception 'MatMove bus capacity and fare have not been configured.' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    select coalesce(sum(greatest(coalesce(passengers_count, 1), 1)), 0)::bigint
      into already_held
    from public.travel_bookings
    where coalesce(is_paid, false)
       or status in ('pending_approval', 'approved', 'boarded');
    new.fare_amount := configured_price_sle * requested_seats;
  else
    select coalesce(sum(greatest(coalesce(passengers_count, 1), 1)), 0)::bigint
      into already_held
    from public.travel_bookings
    where id <> new.id
      and (coalesce(is_paid, false) or status in ('pending_approval', 'approved', 'boarded'));
  end if;

  if already_held + requested_seats > configured_capacity then
    raise exception 'Not enough seats remain on this departure. Refresh availability and try again.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
revoke all on function public.matmove_guard_travel_booking() from public, anon, authenticated;
drop trigger if exists matmove_guard_travel_booking on public.travel_bookings;
create trigger matmove_guard_travel_booking
before insert or update on public.travel_bookings
for each row execute function public.matmove_guard_travel_booking();

create or replace function public.matmove_guard_travel_capacity_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  already_held bigint := 0;
begin
  if new.total_seats < old.total_seats then
    select coalesce(sum(greatest(coalesce(passengers_count, 1), 1)), 0)::bigint
      into already_held
    from public.travel_bookings
    where coalesce(is_paid, false)
       or status in ('pending_approval', 'approved', 'boarded');

    if new.total_seats < already_held then
      raise exception 'Capacity cannot be reduced below the current number of reserved or pending seats.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.matmove_guard_travel_capacity_change() from public, anon, authenticated;
drop trigger if exists matmove_guard_travel_capacity_change on public.travel_settings;
create trigger matmove_guard_travel_capacity_change
before update of total_seats on public.travel_settings
for each row execute function public.matmove_guard_travel_capacity_change();

-- 4. Replace the known PUBLIC-wide travel policies. Customers remain limited
-- to their own booking rows; authenticated staff need a matching Travel role.
alter table public.travel_bookings enable row level security;
revoke all on table public.travel_bookings from public, anon, authenticated;
grant select, insert, update on table public.travel_bookings to authenticated;

drop policy if exists "Admins have full travel access" on public.travel_bookings;
drop policy if exists "Users can manage own travel bookings" on public.travel_bookings;
drop policy if exists matmove_travel_bookings_customer_own on public.travel_bookings;
drop policy if exists matmove_travel_bookings_staff_select on public.travel_bookings;
drop policy if exists matmove_travel_bookings_staff_update on public.travel_bookings;

create policy matmove_travel_bookings_customer_own
on public.travel_bookings for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy matmove_travel_bookings_staff_select
on public.travel_bookings for select to authenticated
using (public.matmove_admin_any(array[
  'travel.overview', 'travel.manifest', 'travel.boarding', 'travel.payments'
]::text[]));

create policy matmove_travel_bookings_staff_update
on public.travel_bookings for update to authenticated
using (public.matmove_admin_any(array[
  'travel.overview', 'travel.manifest', 'travel.boarding', 'travel.payments'
]::text[]))
with check (public.matmove_admin_any(array[
  'travel.overview', 'travel.manifest', 'travel.boarding', 'travel.payments'
]::text[]));

-- 5. Event table access. Public can read active event listings; only staff with
-- Events Overview can publish events. Customers can see/insert their own tickets;
-- staff with Sales/Check-in assignments can audit tickets and activate gate entries.
alter table public.platform_events enable row level security;
revoke all on table public.platform_events from public, anon, authenticated;
grant select on table public.platform_events to anon, authenticated;
grant insert, update, delete on table public.platform_events to authenticated;

drop policy if exists "Admins manage events" on public.platform_events;
drop policy if exists "Public read active events" on public.platform_events;
drop policy if exists matmove_platform_events_public_active_read on public.platform_events;
drop policy if exists matmove_platform_events_staff_read on public.platform_events;
drop policy if exists matmove_platform_events_staff_insert on public.platform_events;

create policy matmove_platform_events_public_active_read
on public.platform_events for select to anon, authenticated
using (is_active is true);

create policy matmove_platform_events_staff_read
on public.platform_events for select to authenticated
using (public.matmove_admin_can('events.overview'));

create policy matmove_platform_events_staff_insert
on public.platform_events for insert to authenticated
with check (public.matmove_admin_can('events.overview'));

alter table public.event_tickets enable row level security;
revoke all on table public.event_tickets from public, anon, authenticated;
grant select, insert, update on table public.event_tickets to authenticated;

drop policy if exists "Admins manage tickets" on public.event_tickets;
drop policy if exists "Users insert tickets" on public.event_tickets;
drop policy if exists "Users view own tickets" on public.event_tickets;
drop policy if exists matmove_event_tickets_customer_insert on public.event_tickets;
drop policy if exists matmove_event_tickets_customer_read on public.event_tickets;
drop policy if exists matmove_event_tickets_staff_read on public.event_tickets;
drop policy if exists matmove_event_tickets_staff_update on public.event_tickets;

create policy matmove_event_tickets_customer_insert
on public.event_tickets for insert to authenticated
with check (auth.uid() = user_id);

create policy matmove_event_tickets_customer_read
on public.event_tickets for select to authenticated
using (auth.uid() = user_id);

create policy matmove_event_tickets_staff_read
on public.event_tickets for select to authenticated
using (public.matmove_admin_any(array['events.overview', 'events.sales', 'events.checkin']::text[]));

create policy matmove_event_tickets_staff_update
on public.event_tickets for update to authenticated
using (public.matmove_admin_can('events.checkin'))
with check (public.matmove_admin_can('events.checkin'));

-- 6. Public event flyer bucket. The bucket is readable by public URL, but writes
-- are restricted to an authenticated staff account with events.overview.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-flyers', 'event-flyers', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists matmove_event_flyers_staff_insert on storage.objects;
create policy matmove_event_flyers_staff_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-flyers'
  and public.matmove_admin_can('events.overview')
);

drop policy if exists matmove_event_flyers_staff_delete on storage.objects;
create policy matmove_event_flyers_staff_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'event-flyers'
  and public.matmove_admin_can('events.overview')
);

-- Remove two specifically identified PUBLIC-wide KYC policies from the audit.
-- Owner-folder policies remain in place for authenticated users.
drop policy if exists "Public Access KYC" on storage.objects;
drop policy if exists "Users upload KYC Documents" on storage.objects;

-- 7. Enable realtime for relevant tables that exist in this project.
do $$
declare
  target_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach target_table in array array[
      'travel_settings', 'travel_bookings', 'platform_events', 'event_tickets',
      'wallets', 'products', 'bookings'
    ] loop
      if to_regclass('public.' || target_table) is not null
         and not exists (
           select 1 from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = target_table
         ) then
        execute format('alter publication supabase_realtime add table public.%I', target_table);
      end if;
    end loop;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;

-- 8. Verification output. Review all result sets after running.
select * from public.travel_settings where id = 'bus_ghana';
select * from public.matmove_get_travel_availability();
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'event-flyers';
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('travel_settings','travel_bookings','platform_events','event_tickets','wallets','products','bookings')
order by tablename;
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in ('travel_settings','travel_bookings','platform_events','event_tickets'))
   or (schemaname = 'storage' and tablename = 'objects' and policyname like 'matmove_event_flyers_%')
order by schemaname, tablename, policyname;

-- IMPORTANT FOLLOW-UP BEFORE PRODUCTION:
-- The current Customer browser code writes is_paid=true and inserts confirmed
-- event_tickets after receiving a completed transfer response. This migration
-- preserves those current write paths, but browser-side payment fulfillment
-- must be moved to a server-side, idempotent reconciliation path before the
-- apps are declared payment-production-safe. Do not expose service-role keys.
