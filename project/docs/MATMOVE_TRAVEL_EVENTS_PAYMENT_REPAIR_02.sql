-- MatMove Travel + Events + Secure Checkout Repair 02
-- Built from the 2026-11-01 Supabase preflight report and the supplied Admin/Customer source.
-- Run ONCE in the Supabase SQL Editor for the single project used by both Vercel apps.
-- This migration fixes the missing travel_settings table/RPC and event-flyers bucket,
-- enables Realtime, scopes broad policies reported by the preflight, and moves booking/ticket
-- fulfilment behind the Customer server API using the service role.
-- SLE is the checkout currency for Travel and Events in this release. Admin retains both
-- price_sle and price_usd settings; the USD display is informational until a USD collection
-- account and USD checkout path are explicitly configured.

begin;

-- -----------------------------------------------------------------------------
-- 1. Shared Travel settings. Admin can manage the row; customers use the aggregate RPC.
-- -----------------------------------------------------------------------------
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
-- Capacity, the two public fare values and the next departure date are safe to read.
-- This also lets customer sessions receive setting-row Realtime notifications without
-- exposing any passenger row from travel_bookings.
drop policy if exists matmove_travel_settings_customer_read on public.travel_settings;
create policy matmove_travel_settings_customer_read
on public.travel_settings for select to authenticated
using (true);

drop policy if exists matmove_travel_settings_staff_insert on public.travel_settings;
create policy matmove_travel_settings_staff_insert
on public.travel_settings for insert to authenticated
with check (public.matmove_admin_can('travel.overview'));

drop policy if exists matmove_travel_settings_staff_update on public.travel_settings;
create policy matmove_travel_settings_staff_update
on public.travel_settings for update to authenticated
using (public.matmove_admin_can('travel.overview'))
with check (public.matmove_admin_can('travel.overview'));

-- Customer-facing RPC returns only aggregate seats and prices, never passenger details.
create or replace function public.matmove_get_travel_availability()
returns table (
  departure_date date,
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
  with schedule as (
    select case
      when extract(day from (now() at time zone 'Africa/Freetown')::date) < 15
        then date_trunc('month', (now() at time zone 'Africa/Freetown')::date)::date + 14
      else (date_trunc('month', (now() at time zone 'Africa/Freetown')::date) + interval '1 month')::date
    end as next_departure
  )
  select
    schedule.next_departure,
    s.total_seats,
    s.price_usd,
    s.price_sle,
    coalesce(h.held_seats, 0)::bigint,
    greatest(s.total_seats::bigint - coalesce(h.held_seats, 0)::bigint, 0)::bigint
  from public.travel_settings s
  cross join schedule
  cross join lateral (
    select coalesce(sum(greatest(coalesce(b.passengers_count, 1), 1)), 0)::bigint as held_seats
    from public.travel_bookings b
    where b.departure_date = schedule.next_departure
      and (coalesce(b.is_paid, false) or b.status in ('pending_approval', 'approved', 'boarded'))
  ) h
  where s.id = 'bus_ghana';
$$;
revoke all on function public.matmove_get_travel_availability() from public, anon;
grant execute on function public.matmove_get_travel_availability() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Booking fare/capacity controls and safe payment reference fields.
-- -----------------------------------------------------------------------------
alter table public.travel_bookings
  add column if not exists fare_currency text not null default 'SLE';

-- The customer form offers the next published departure (1st/15th schedule).
-- Use Freetown local date, and avoid assigning a booking to a departure earlier today.
alter table public.travel_bookings
  alter column departure_date set default (
    case
      when extract(day from (now() at time zone 'Africa/Freetown')::date) < 15
        then date_trunc('month', (now() at time zone 'Africa/Freetown')::date)::date + 14
      else (date_trunc('month', (now() at time zone 'Africa/Freetown')::date) + interval '1 month')::date
    end
  );
create index if not exists matmove_travel_bookings_departure_capacity_idx
  on public.travel_bookings (departure_date, status, is_paid);

-- Payment ledger is server-only. The browser cannot write payment status or ticket records.
create table if not exists public.matmove_purchase_payments (
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  purchase_type text not null check (purchase_type in ('travel', 'event')),
  booking_id uuid references public.travel_bookings(id) on delete restrict,
  event_id uuid references public.platform_events(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 3),
  user_phone text,
  amount_minor bigint not null check (amount_minor > 0),
  unit_amount_minor bigint not null check (unit_amount_minor > 0),
  currency text not null default 'SLE' check (currency = 'SLE'),
  source_account_id text not null,
  destination_account_id text not null,
  provider_transfer_id text,
  provider_status text not null default 'initiating',
  state text not null default 'initiating'
    check (state in ('initiating', 'pending', 'processing', 'completed', 'failed', 'review_required')),
  failure_detail text,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matmove_purchase_target_shape check (
    (purchase_type = 'travel' and booking_id is not null and event_id is null)
    or
    (purchase_type = 'event' and event_id is not null and booking_id is null)
  )
);

alter table public.travel_bookings
  add column if not exists payment_id uuid references public.matmove_purchase_payments(id) on delete restrict;
alter table public.event_tickets
  add column if not exists payment_id uuid references public.matmove_purchase_payments(id) on delete restrict;

create unique index if not exists matmove_travel_booking_payment_once
  on public.travel_bookings(payment_id) where payment_id is not null;
create unique index if not exists matmove_event_ticket_payment_once
  on public.event_tickets(payment_id) where payment_id is not null;
create unique index if not exists matmove_purchase_provider_transfer_once
  on public.matmove_purchase_payments(provider_transfer_id) where provider_transfer_id is not null;
create unique index if not exists matmove_purchase_one_active_travel
  on public.matmove_purchase_payments(booking_id)
  where purchase_type = 'travel' and booking_id is not null
    and state in ('initiating', 'pending', 'processing', 'review_required');
create unique index if not exists matmove_purchase_one_active_event_per_user
  on public.matmove_purchase_payments(user_id, event_id)
  where purchase_type = 'event' and event_id is not null
    and state in ('initiating', 'pending', 'processing', 'review_required');

alter table public.matmove_purchase_payments enable row level security;
revoke all on table public.matmove_purchase_payments from public, anon, authenticated;
grant all on table public.matmove_purchase_payments to service_role;

-- Database controls the fare snapshot and holds capacity across simultaneous requests.
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
  if tg_op = 'UPDATE'
     and (new.is_paid is distinct from old.is_paid or new.payment_id is distinct from old.payment_id)
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'FORBIDDEN: Only verified server-side payment reconciliation may change payment state.' using errcode = '42501';
  end if;

  if new.departure_date is null then
    new.departure_date := case
      when extract(day from (now() at time zone 'Africa/Freetown')::date) < 15
        then date_trunc('month', (now() at time zone 'Africa/Freetown')::date)::date + 14
      else (date_trunc('month', (now() at time zone 'Africa/Freetown')::date) + interval '1 month')::date
    end;
  end if;

  if tg_op = 'UPDATE' then
    new.fare_amount := old.fare_amount;
    new.fare_currency := old.fare_currency;
    if new.passengers_count is not distinct from old.passengers_count
       and new.status is not distinct from old.status
       and new.is_paid is not distinct from old.is_paid
       and new.departure_date is not distinct from old.departure_date then
      return new;
    end if;
  end if;

  is_holding := coalesce(new.is_paid, false)
    or new.status in ('pending_approval', 'approved', 'boarded');
  if not is_holding then return new; end if;

  requested_seats := greatest(coalesce(new.passengers_count, 1), 1);
  if requested_seats > 3 then
    raise exception 'A single MatMove travel booking is limited to 3 passengers.' using errcode = 'P0001';
  end if;
  new.passengers_count := requested_seats;

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
    where departure_date = new.departure_date
      and (coalesce(is_paid, false) or status in ('pending_approval', 'approved', 'boarded'));
    new.fare_amount := configured_price_sle * requested_seats;
    new.fare_currency := 'SLE';
  else
    select coalesce(sum(greatest(coalesce(passengers_count, 1), 1)), 0)::bigint
      into already_held
    from public.travel_bookings
    where id <> new.id
      and departure_date = new.departure_date
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
declare already_held bigint := 0;
  local_today date := (now() at time zone 'Africa/Freetown')::date;
begin
  if new.total_seats < old.total_seats then
    select coalesce(max(day_holds), 0)::bigint
      into already_held
    from (
      select sum(greatest(coalesce(passengers_count, 1), 1))::bigint as day_holds
      from public.travel_bookings
      where departure_date >= local_today
        and (coalesce(is_paid, false) or status in ('pending_approval', 'approved', 'boarded'))
      group by departure_date
    ) held_by_departure;
    if new.total_seats < already_held then
      raise exception 'Capacity cannot be reduced below reserved or pending seats on a future departure.' using errcode = 'P0001';
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

-- Booking changes touch the single settings row. Customers subscribe to that safe row,
-- so they learn about another customer's seat reservation without receiving passenger data.
create or replace function public.matmove_touch_travel_settings()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  update public.travel_settings set updated_at = now() where id = 'bus_ghana';
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.matmove_touch_travel_settings() from public, anon, authenticated;
drop trigger if exists matmove_touch_travel_settings_insert_delete on public.travel_bookings;
create trigger matmove_touch_travel_settings_insert_delete
after insert or delete on public.travel_bookings
for each row execute function public.matmove_touch_travel_settings();
drop trigger if exists matmove_touch_travel_settings_update on public.travel_bookings;
create trigger matmove_touch_travel_settings_update
after update of status, is_paid, passengers_count, departure_date on public.travel_bookings
for each row execute function public.matmove_touch_travel_settings();

-- Customer can create and read only their own booking. Only authorized staff can update
-- status/manifest fields. is_paid is set only by the service-only fulfilment function below.
alter table public.travel_bookings enable row level security;
revoke all on table public.travel_bookings from public, anon, authenticated;
grant select, insert on table public.travel_bookings to authenticated;
revoke update on table public.travel_bookings from authenticated;
grant update (status, boarded_at, boarded_by, admin_notes, departure_date)
  on table public.travel_bookings to authenticated;

drop policy if exists "Admins have full travel access" on public.travel_bookings;
drop policy if exists "Users can manage own travel bookings" on public.travel_bookings;
drop policy if exists matmove_travel_bookings_customer_own on public.travel_bookings;
drop policy if exists matmove_travel_bookings_customer_select on public.travel_bookings;
drop policy if exists matmove_travel_bookings_customer_insert on public.travel_bookings;
drop policy if exists matmove_travel_bookings_staff_select on public.travel_bookings;
drop policy if exists matmove_travel_bookings_staff_update on public.travel_bookings;

create policy matmove_travel_bookings_customer_select
on public.travel_bookings for select to authenticated
using (auth.uid() = user_id);
create policy matmove_travel_bookings_customer_insert
on public.travel_bookings for insert to authenticated
with check (auth.uid() = user_id and coalesce(is_paid, false) = false and payment_id is null);
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

-- -----------------------------------------------------------------------------
-- 3. Events: active listing is public; event changes and gate operations are staff-only.
-- -----------------------------------------------------------------------------
alter table public.platform_events enable row level security;
revoke all on table public.platform_events from public, anon, authenticated;
grant select on table public.platform_events to anon, authenticated;
grant insert, update, delete on table public.platform_events to authenticated;

drop policy if exists "Admins manage events" on public.platform_events;
drop policy if exists "Public read active events" on public.platform_events;
drop policy if exists matmove_platform_events_public_active_read on public.platform_events;
drop policy if exists matmove_platform_events_staff_manage on public.platform_events;
create policy matmove_platform_events_public_active_read
on public.platform_events for select to anon, authenticated
using (is_active is true);
create policy matmove_platform_events_staff_manage
on public.platform_events for all to authenticated
using (public.matmove_admin_can('events.overview'))
with check (public.matmove_admin_can('events.overview'));

-- Customers may read only their own tickets. The browser cannot insert a fake paid ticket.
-- The server fulfils tickets only after a Monime transfer is independently retrieved as completed.
alter table public.event_tickets enable row level security;
revoke all on table public.event_tickets from public, anon, authenticated;
grant select on table public.event_tickets to authenticated;
revoke update on table public.event_tickets from authenticated;
grant update (status, admitted_at) on table public.event_tickets to authenticated;

drop policy if exists "Admins manage tickets" on public.event_tickets;
drop policy if exists "Users insert tickets" on public.event_tickets;
drop policy if exists "Users view own tickets" on public.event_tickets;
drop policy if exists matmove_event_tickets_customer_insert on public.event_tickets;
drop policy if exists matmove_event_tickets_customer_read on public.event_tickets;
drop policy if exists matmove_event_tickets_staff_read on public.event_tickets;
drop policy if exists matmove_event_tickets_staff_update on public.event_tickets;
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

-- -----------------------------------------------------------------------------
-- 4. Server-only payment fulfilment. The Customer Vercel API reads the configured
-- MONIME_TRAVEL_ACCOUNT_ID / MONIME_EVENT_ACCOUNT_ID server-side, creates/retrieves
-- the transfer using the same idempotency key, and calls this function only after
-- Monime returns a matching transfer in the completed state.
-- -----------------------------------------------------------------------------
create or replace function public.matmove_fulfill_purchase_payment(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.matmove_purchase_payments%rowtype;
  b public.travel_bookings%rowtype;
  e public.platform_events%rowtype;
  v_ticket_id uuid;
begin
  select * into p
  from public.matmove_purchase_payments
  where id = p_payment_id
  for update;
  if not found then raise exception 'NOT_FOUND: MatMove payment request not found.'; end if;
  if p.provider_status <> 'completed' then
    raise exception 'PAYMENT_PENDING: Monime has not confirmed this transfer as completed.';
  end if;
  if p.state = 'completed' and p.fulfilled_at is not null then
    return jsonb_build_object('fulfilled', true, 'payment_id', p.id, 'purchase_type', p.purchase_type);
  end if;

  if p.purchase_type = 'travel' then
    select * into b from public.travel_bookings where id = p.booking_id and user_id = p.user_id for update;
    if not found then raise exception 'NOT_FOUND: Matching travel booking not found.'; end if;
    if b.payment_id = p.id and b.is_paid then
      null; -- already fulfilled; this function is safe to retry.
    else
      if b.is_paid then raise exception 'CONFLICT: This travel booking is already linked to another payment.'; end if;
      if b.status <> 'approved' then raise exception 'INVALID_STATE: Dispatch approval is required before fulfilment.'; end if;
      if b.fare_currency <> 'SLE' or round(b.fare_amount * 100)::bigint <> p.amount_minor then
        raise exception 'INVALID_FARE: Stored travel fare does not match the payment amount.';
      end if;
      update public.travel_bookings
      set is_paid = true, payment_id = p.id
      where id = p.booking_id and user_id = p.user_id;
    end if;
  elsif p.purchase_type = 'event' then
    select * into e from public.platform_events where id = p.event_id for share;
    if not found or e.is_active is not true then
      raise exception 'INVALID_STATE: Event is not active; payment requires support review.';
    end if;
    select id into v_ticket_id from public.event_tickets where payment_id = p.id;
    if v_ticket_id is null then
      insert into public.event_tickets (
        event_id, user_id, user_phone, ticket_code, tickets_count,
        amount_paid, status, payment_id
      ) values (
        p.event_id,
        p.user_id,
        p.user_phone,
        'TKT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
        p.quantity,
        p.amount_minor::numeric / 100,
        'confirmed',
        p.id
      ) returning id into v_ticket_id;
    end if;
  else
    raise exception 'INVALID_STATE: Unsupported MatMove purchase type.';
  end if;

  update public.matmove_purchase_payments
  set state = 'completed', fulfilled_at = coalesce(fulfilled_at, now()), failure_detail = null, updated_at = now()
  where id = p.id;
  return jsonb_build_object('fulfilled', true, 'payment_id', p.id, 'purchase_type', p.purchase_type, 'ticket_id', v_ticket_id);
end;
$$;
revoke all on function public.matmove_fulfill_purchase_payment(uuid) from public, anon, authenticated;
grant execute on function public.matmove_fulfill_purchase_payment(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 5. Public event flyers; only authenticated Events Overview staff can upload/delete.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-flyers', 'event-flyers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists matmove_event_flyers_public_read on storage.objects;
drop policy if exists matmove_event_flyers_staff_insert on storage.objects;
drop policy if exists matmove_event_flyers_staff_delete on storage.objects;
create policy matmove_event_flyers_public_read
on storage.objects for select to public
using (bucket_id = 'event-flyers');
create policy matmove_event_flyers_staff_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'event-flyers' and public.matmove_admin_can('events.overview'));
create policy matmove_event_flyers_staff_delete
on storage.objects for delete to authenticated
using (bucket_id = 'event-flyers' and public.matmove_admin_can('events.overview'));

-- Remove the two overly-broad KYC storage policies reported by the preflight.
-- The existing owner-folder upload/read policies remain in place.
drop policy if exists "Public Access KYC" on storage.objects;
drop policy if exists "Users upload KYC Documents" on storage.objects;

-- -----------------------------------------------------------------------------
-- 6. Realtime. Existing rows remain in place; this adds only available tables.
-- -----------------------------------------------------------------------------
do $$
declare target_table text;
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

-- -----------------------------------------------------------------------------
-- 7. Verify the new structures and policies after the migration commits.
-- -----------------------------------------------------------------------------
select * from public.travel_settings where id = 'bus_ghana';
select * from public.matmove_get_travel_availability();
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'event-flyers';
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (
    ('travel_bookings', 'payment_id'), ('travel_bookings', 'fare_currency'),
    ('event_tickets', 'payment_id'), ('matmove_purchase_payments', 'state')
  )
order by table_name, column_name;
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

-- Production follow-up:
-- 1. Customer Vercel must have MONIME_TRAVEL_ACCOUNT_ID and MONIME_EVENT_ACCOUNT_ID
--    configured as server-side (non-VITE_) environment variables.
-- 2. Deploy the Customer API code in this repair batch before accepting paid checkouts.
-- 3. Configure/verify the Monime webhook and internal-transfer event signature with Monime.
--    Until that webhook is confirmed, the customer can re-check a pending transfer from the same
--    purchase action; do not treat an HTTP 200 alone as payment completion.
