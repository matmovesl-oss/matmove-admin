

-- Run this complete ADMIN migration in the ONE shared Supabase project.
-- Requires the staff-access and ride-fare-negotiation migrations already supplied.
-- Assignment remains pending. Existing payment/refund functions are unchanged.
begin;
do $requirements$
begin
 if to_regprocedure('public.matmove_admin_can(text)') is null or to_regclass('public.matmove_ride_fare_offers') is null then
  raise exception 'Apply the staff access and ride fare negotiation setup first.';
 end if;
end;
$requirements$;
alter table public.bookings add column if not exists matmove_dispatch_version bigint not null default 1;
create table if not exists public.matmove_dispatch_audit(
 request_id uuid primary key,actor_id uuid not null references auth.users(id),booking_id uuid not null references public.bookings(id),
 action text not null check(action in ('assign','unassign','cancel')),driver_id uuid,expected_version bigint not null,
 new_version bigint not null,note text not null,before_record jsonb not null,after_record jsonb not null,created_at timestamptz not null default now()
);
alter table public.matmove_dispatch_audit enable row level security;
revoke all on public.matmove_dispatch_audit from public,anon,authenticated;

create or replace function public.matmove_dispatch_actor()
returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $fn$
begin
 if auth.uid() is null or not public.matmove_admin_can('dispatch') or not exists(
  select 1 from public.matmove_staff_access where id=auth.uid() and is_active=true and removed_at is null
 ) then raise exception 'FORBIDDEN: Active Dispatch assignment required.';end if;
 return auth.uid();
end;
$fn$;
create or replace function public.matmove_guard_dispatch_booking()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $fn$
begin
 if new.status is distinct from old.status and current_user in ('authenticated','anon') then
  raise exception 'FORBIDDEN: Use the verified trip API or authorized Dispatch function to change trip status.';
 end if;
 -- Browser-supplied versions are never authoritative.
 if (to_jsonb(new)-'matmove_dispatch_version') is distinct from (to_jsonb(old)-'matmove_dispatch_version') then
  new.matmove_dispatch_version:=old.matmove_dispatch_version+1;
 else new.matmove_dispatch_version:=old.matmove_dispatch_version;end if;
 return new;
end;
$fn$;
drop trigger if exists matmove_guard_dispatch_booking on public.bookings;
create trigger matmove_guard_dispatch_booking before update on public.bookings for each row execute function public.matmove_guard_dispatch_booking();

create or replace function public.matmove_dispatch_booking_visible(p_rider uuid,p_driver uuid,p_status text)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $fn$
declare profile jsonb;
begin
 if public.matmove_admin_can('dispatch') then return true;end if;
 select to_jsonb(p) into profile from public.profiles p where p.id=auth.uid();
 if profile->>'role'='driver' then
  return coalesce(p_rider=auth.uid() or p_driver=auth.uid() or
   (p_driver is null and p_status='pending' and profile->>'kyc_status'='approved'
    and not coalesce((profile->>'is_wallet_frozen')::boolean,false)
    and not exists(select 1 from public.wallets where user_id=auth.uid() and is_frozen=true)),false);
 end if;
 if exists(select 1 from public.matmove_staff_access where id=auth.uid()) then
  return coalesce(p_rider=auth.uid() or p_driver=auth.uid(),false);
 end if;
 return true; -- Existing rider/merchant ownership policies still apply.
end;
$fn$;
alter table public.bookings enable row level security;
drop policy if exists matmove_dispatch_visibility on public.bookings;
create policy matmove_dispatch_visibility on public.bookings as restrictive for select to authenticated
 using(public.matmove_dispatch_booking_visible(rider_id,driver_id,status));

create or replace function public.matmove_dispatch_driver_busy(p_driver uuid,p_booking uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $fn$
 select exists(select 1 from public.bookings where id is distinct from p_booking and driver_id=p_driver and status in ('pending','pending_admin','accepted','in_progress'))
 or exists(select 1 from public.ride_payments where booking_id is distinct from p_booking and driver_id=p_driver and coalesce(state::text,'') not in ('released','refunded','failed'));
$fn$;
revoke all on function public.matmove_dispatch_driver_busy(uuid,uuid) from public,anon,authenticated;

-- One private eligibility calculation is shared by the directory and assignment.
-- Legacy customers with no role rows use their saved profile role, matching
-- Customer account resolution. Contradictory or administrative roles stay denied.
create or replace function public.matmove_dispatch_driver_status(p_driver uuid,p_booking uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $fn$
declare p public.profiles%rowtype;code text:='ready';reason text:='Ready for manual assignment';
begin
 select * into p from public.profiles where id=p_driver;
 if not found then code:='missing_profile';reason:='Driver profile is missing';
 elsif p.role::text is distinct from 'driver' then code:='wrong_role';reason:='Customer profile is not a driver';
 elsif exists(select 1 from public.matmove_staff_access where id=p_driver and is_active=true and removed_at is null)
 or exists(select 1 from public.user_roles where profile_id=p_driver and (role is null or role::text not in ('rider','driver','merchant')))
 or (exists(select 1 from public.user_roles where profile_id=p_driver) and not exists(select 1 from public.user_roles where profile_id=p_driver and role::text='driver'))
 then code:='role_conflict';reason:='Driver membership conflicts with this profile or active staff access';
 elsif p.kyc_status::text is distinct from 'approved' then code:='approval_required';reason:='Driver KYC needs current Admin approval';
 elsif coalesce((to_jsonb(p)->>'is_wallet_frozen')::boolean,false)
 or exists(select 1 from public.wallets where user_id=p_driver and is_frozen=true)
 then code:='wallet_frozen';reason:='Wallet is frozen; contact the authorized reviewer';
 elsif not exists(select 1 from public.wallets where user_id=p_driver and currency='SLE')
 then code:='wallet_missing';reason:='Driver needs an SLE wallet before assignment';
 elsif public.matmove_dispatch_driver_busy(p_driver,p_booking)
 then code:='busy';reason:='Driver already has an active assignment or unresolved payment';
 end if;
 return jsonb_build_object('id',p_driver,'label',coalesce(nullif(to_jsonb(p)->>'full_name',''),nullif(to_jsonb(p)->>'email',''),p_driver::text),
 'eligible',code='ready','reasonCode',code,'reason',reason);
end;
$fn$;
revoke all on function public.matmove_dispatch_driver_status(uuid,uuid) from public,anon,authenticated;

create or replace function public.matmove_admin_dispatch_feed()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $fn$
declare actor uuid;requests jsonb;drivers jsonb;
begin
 actor:=public.matmove_dispatch_actor();
 select coalesce(jsonb_agg(x.row order by x.created_at desc,x.id),'[]'::jsonb) into requests from(
  select b.id,b.created_at,jsonb_build_object('id',b.id,'version',b.matmove_dispatch_version::text,
   'status',b.status,'fare',b.fare_amount::text,'serviceType',b.service_type,'vehicleType',to_jsonb(b)->>'vehicle_type',
   'pickup',b.pickup_location,'destination',b.destination_location,'scheduledTime',to_jsonb(b)->>'scheduled_time','createdAt',b.created_at,
   'riderId',b.rider_id,'driverId',b.driver_id,
   'riderLabel',coalesce(nullif(to_jsonb(r)->>'full_name',''),nullif(to_jsonb(r)->>'email',''),nullif(to_jsonb(r)->>'phone_number',''),nullif(to_jsonb(r)->>'phone',''),b.rider_id::text),
   'driverLabel',coalesce(nullif(to_jsonb(d)->>'full_name',''),nullif(to_jsonb(d)->>'email',''),nullif(to_jsonb(d)->>'phone_number',''),nullif(to_jsonb(d)->>'phone',''),b.driver_id::text),
   'paymentStarted',exists(select 1 from public.ride_payments where booking_id=b.id),
   'pendingOffers',(select count(*)::text from public.matmove_ride_fare_offers where booking_id=b.id and status='pending' and expires_at>now() and fare_version=b.matmove_fare_version),
   'agreedDriverId',(select driver_id from public.matmove_ride_fare_offers where booking_id=b.id and status='accepted')
  ) row
  from public.bookings b left join public.profiles r on r.id=b.rider_id left join public.profiles d on d.id=b.driver_id
  order by b.created_at desc,b.id limit 100
 ) x;
 -- Keep unavailable drivers visible with the exact reason instead of an empty selector.
 -- Online is currently a Customer screen preference, not a server presence record;
 -- manual assignment deliberately does not depend on it.
 select coalesce(jsonb_agg(x.details order by (x.details->>'eligible')::boolean desc,x.details->>'label',x.id),'[]'::jsonb)
 into drivers from (
  select p.id,public.matmove_dispatch_driver_status(p.id,null) details
  from public.profiles p where p.role::text='driver'
   or exists(select 1 from public.user_roles where profile_id=p.id and role::text='driver')
 ) x;
 return jsonb_build_object('actor',actor,'bookings',requests,'drivers',drivers,'generatedAt',clock_timestamp(),'limit',100);
end;
$fn$;

create or replace function public.matmove_admin_dispatch_change(p_booking_id uuid,p_expected bigint,p_action text,p_driver uuid,p_request_id uuid,p_note text,p_expected_actor uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $fn$
declare actor uuid;b public.bookings%rowtype;prior jsonb;receipt public.matmove_dispatch_audit%rowtype;chosen uuid;driver_status jsonb;
begin
 actor:=public.matmove_dispatch_actor();
 if actor is distinct from p_expected_actor then raise exception 'FORBIDDEN: Your signed-in account changed.';end if;
 if p_booking_id is null or p_request_id is null or p_expected is null or p_action is null or p_action not in ('assign','unassign','cancel')
 or p_note is null or length(btrim(p_note)) not between 3 and 300 or (p_action='assign' and p_driver is null) or (p_action<>'assign' and p_driver is not null)
 then raise exception 'INVALID: Select a valid action and enter a dispatch note (3–300 characters).';end if;
 select * into b from public.bookings where id=p_booking_id for update;
 if not found then raise exception 'NOT_FOUND: Booking not found.';end if;
 perform public.matmove_dispatch_actor();
 select * into receipt from public.matmove_dispatch_audit where request_id=p_request_id;
 if found then
  if receipt.actor_id<>actor or receipt.booking_id<>b.id or receipt.action<>p_action or receipt.driver_id is distinct from p_driver or receipt.expected_version<>p_expected or receipt.note<>btrim(p_note)
  then raise exception 'CONFLICT: This request key was already used for another dispatch action.';end if;
  return jsonb_build_object('actor',actor,'applied',true,'requestId',receipt.request_id,'bookingId',b.id,'action',receipt.action,'version',receipt.new_version::text);
 end if;
 if b.matmove_dispatch_version is distinct from p_expected then raise exception 'CONFLICT: Booking changed. Refresh Dispatch before continuing.';end if;
 if b.status is null or b.status not in ('pending','pending_admin') then raise exception 'CONFLICT: Only pending requests can be changed here.';end if;
 if exists(select 1 from public.ride_payments where booking_id=b.id) then raise exception 'PAYMENT_STARTED: Payment processing has started. Use the customer cancellation/refund flow; Dispatch cannot cancel or reassign this request.';end if;
 prior:=jsonb_build_object('driverId',b.driver_id,'status',b.status,'fare',b.fare_amount::text);
 select driver_id into chosen from public.matmove_ride_fare_offers where booking_id=b.id and status='accepted';
 if p_action='assign' then
  if b.rider_id is null or b.fare_amount is null or b.fare_amount<=0 or b.fare_amount*100<>round(b.fare_amount*100) then raise exception 'INVALID: A valid customer and fare are required before assignment.';end if;
  if p_driver=b.rider_id then raise exception 'INVALID: A customer cannot drive their own request.';end if;
  if b.driver_id is not null and b.driver_id is distinct from p_driver then raise exception 'CONFLICT: Unassign the existing driver first.';end if;
  if chosen is not null and chosen is distinct from p_driver then raise exception 'CONFLICT: The customer agreed a fare with another driver.';end if;
  if exists(select 1 from public.matmove_ride_fare_offers where booking_id=b.id and status='pending' and expires_at>now() and fare_version=b.matmove_fare_version) then
   raise exception 'CONFLICT: Resolve the pending fare offers before manual assignment.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('matmove-dispatch-driver:'||p_driver::text,0));
  driver_status:=public.matmove_dispatch_driver_status(p_driver,b.id);
  if driver_status->>'eligible' is distinct from 'true' then
   if driver_status->>'reasonCode'='busy' then raise exception 'CONFLICT: This driver already has an assigned active request or unresolved payment.';end if;
   raise exception 'FORBIDDEN: The driver needs current approval, consistent driver membership and an unfrozen SLE wallet. %',driver_status->>'reason';
  end if;
  update public.bookings set driver_id=p_driver,updated_at=clock_timestamp() where id=b.id returning * into b;
 elsif p_action='unassign' then
  if chosen is not null then raise exception 'CONFLICT: The agreed driver is locked. The customer can cancel and create a new request.';end if;
  update public.bookings set driver_id=null,updated_at=clock_timestamp() where id=b.id returning * into b;
 else
  update public.bookings set status='cancelled',updated_at=clock_timestamp() where id=b.id returning * into b;
 end if;
 insert into public.matmove_dispatch_audit(request_id,actor_id,booking_id,action,driver_id,expected_version,new_version,note,before_record,after_record)
 values(p_request_id,actor,b.id,p_action,p_driver,p_expected,b.matmove_dispatch_version,btrim(p_note),prior,
 jsonb_build_object('driverId',b.driver_id,'status',b.status,'fare',b.fare_amount::text));
 return jsonb_build_object('actor',actor,'applied',true,'requestId',p_request_id,'bookingId',b.id,'action',p_action,'version',b.matmove_dispatch_version::text);
end;
$fn$;

create or replace function public.matmove_guard_dispatch_payment()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $fn$
declare booking_status text;
begin
 select status into booking_status from public.bookings where id=new.booking_id for update;
 if not found or booking_status is null or booking_status in ('cancelled','completed') then
  raise exception 'INVALID_STATE: This request is closed. A new payment cannot be started.';
 end if;
 if new.driver_id is null then raise exception 'INVALID_STATE: A driver is required before payment.';end if;
 perform pg_advisory_xact_lock(hashtextextended('matmove-dispatch-driver:'||new.driver_id::text,0));
 if public.matmove_dispatch_driver_busy(new.driver_id,new.booking_id) then raise exception 'CONFLICT: This driver already has an assigned active request or pending payment.';end if;
 return new;
end;
$fn$;
drop trigger if exists matmove_guard_dispatch_payment on public.ride_payments;
create trigger matmove_guard_dispatch_payment before insert on public.ride_payments for each row execute function public.matmove_guard_dispatch_payment();
revoke all on function public.matmove_guard_dispatch_payment() from public,anon,authenticated;

-- Same fare snapshot contract; selection may come from customer agreement or Dispatch.
create or replace function public.matmove_read_ride_fares(p_user_id uuid,p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $fn$
declare b public.bookings%rowtype; v_role text; v_owner boolean; v_offers jsonb;
begin
  -- Reading does not require wallet approval; mutation RPCs enforce it separately.
  v_role:=public.matmove_preferences_role(p_user_id);
  select * into b from public.bookings where id=p_booking_id;
  if not found then raise exception 'NOT_FOUND: Request not found.'; end if;
  v_owner:=b.rider_id is not distinct from p_user_id;
  if not v_owner and (v_role='driver' and (b.driver_id=p_user_id or (b.status in ('pending','pending_admin') and b.driver_id is null and exists(select 1 from public.profiles where id=p_user_id and kyc_status::text='approved')))) is not true then raise exception 'FORBIDDEN: Request access denied.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'driverId',o.driver_id,'driverName',coalesce(nullif(p.full_name,''),'Driver'),
    'amountMinor',o.amount_minor,'fareVersion',o.fare_version,'agreedVersion',o.agreed_version,
    'status',case when o.status='pending' and (o.expires_at<=now() or o.fare_version<>b.matmove_fare_version) then 'expired' else o.status end,
    'expiresAt',o.expires_at,'createdAt',o.created_at
  ) order by o.created_at desc,o.id),'[]'::jsonb) into v_offers
  from public.matmove_ride_fare_offers o join public.profiles p on p.id=o.driver_id
  where o.booking_id=b.id and (v_owner or o.driver_id=p_user_id)
    and (o.status in ('pending','accepted') or o.created_at>now()-interval '1 day');
  return jsonb_build_object('bookingId',b.id,'viewerId',p_user_id,'fareMinor',round(b.fare_amount*100),'fareVersion',b.matmove_fare_version,'bookingStatus',b.status,
    'paymentStarted',exists(select 1 from public.ride_payments where booking_id=b.id),
    'selectedDriverId',coalesce((select driver_id from public.matmove_ride_fare_offers where booking_id=b.id and status='accepted'),b.driver_id),
    'serverTime',now(),'offers',v_offers);
end;
$fn$;


revoke all on function public.matmove_dispatch_actor(),public.matmove_guard_dispatch_booking() from public,anon,authenticated;
revoke all on function public.matmove_dispatch_booking_visible(uuid,uuid,text) from public,anon;
grant execute on function public.matmove_dispatch_booking_visible(uuid,uuid,text) to authenticated;
revoke all on function public.matmove_admin_dispatch_feed(),public.matmove_admin_dispatch_change(uuid,bigint,text,uuid,uuid,text,uuid) from public,anon;
grant execute on function public.matmove_admin_dispatch_feed(),public.matmove_admin_dispatch_change(uuid,bigint,text,uuid,uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
