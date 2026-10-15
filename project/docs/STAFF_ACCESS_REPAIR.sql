
-- Repair/reinstall the existing staff permission system. Run the ENTIRE file
-- as postgres in the same shared Supabase project. Existing assignments and
-- deactivations are retained except the designated owner is reactivated.
-- Existing other owners become administrative admins without hiring rights.
-- This does not replace game bundle rules or disable RLS.

-- Run this ENTIRE file as postgres in the existing shared Supabase project.
-- Requires the existing six-segment game migration. Customer payment functions
-- and normal customer RLS policies remain; staff restrictions are additive.
begin;
create table if not exists public.matmove_staff_access (
 id uuid primary key references auth.users(id),email text not null,full_name text not null,
 department text not null default '',permissions jsonb not null default '[]',
 is_owner boolean not null default false,is_active boolean not null default true,
 requires_password_setup boolean not null default false,invite_state text not null default 'authorized',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.matmove_staff_audit (
 id bigint generated always as identity primary key,actor_id uuid not null,target_id uuid not null,
 action text not null,details jsonb not null,created_at timestamptz not null default now()
);
alter table public.matmove_staff_access enable row level security;
alter table public.matmove_staff_audit enable row level security;
revoke all on public.matmove_staff_access,public.matmove_staff_audit from public,anon,authenticated;
grant all on public.matmove_staff_access,public.matmove_staff_audit to service_role;
grant usage,select on sequence public.matmove_staff_audit_id_seq to service_role;
-- Import only existing admins table members, never a role claimed in profiles.
insert into public.matmove_staff_access(id,email,full_name,permissions,is_owner,is_active,department)
select a.id,u.email,coalesce(nullif(to_jsonb(a)->>'full_name',''),u.email),
 case when coalesce(to_jsonb(a)->'permissions','[]')='[]'::jsonb then
  case to_jsonb(a)->>'role'
   when 'admin_dispatch' then '["dispatch"]'::jsonb
   when 'admin_compliance' then '["kyc","customers"]'::jsonb
   when 'admin_finance' then '["financials","transactions","payouts"]'::jsonb
   else '[]'::jsonb end
 else coalesce(to_jsonb(a)->'permissions','[]') end,
 coalesce((to_jsonb(a)->>'is_owner')::boolean,false) or coalesce(to_jsonb(a)->>'role'='super_admin',false),
 coalesce((to_jsonb(a)->>'is_active')::boolean,true),coalesce(to_jsonb(a)->>'department','')
from public.admins a join auth.users u on u.id=a.id on conflict(id) do nothing;
-- The owner email was supplied by the business owner for this repair.
-- Resolve it against confirmed Supabase Auth identities. Never use profile.role.
do $owner$
declare v_owner uuid; v_count integer; v_all jsonb := '["dashboard","dispatch","pricing","kyc","financials","transactions","payouts","customers","staff","logs","games.overview","games.players","games.entries","games.winnings","games.settings","games.recovery"]'::jsonb;
begin
 select count(*) into v_count from auth.users where lower(email)='matmove.sl@gmail.com' and email_confirmed_at is not null;
 if v_count<>1 then raise exception 'OWNER_NOT_VERIFIED: Expected exactly one confirmed Supabase Auth user for matmove.sl@gmail.com. Check Authentication > Users in this project. No access changes were saved.'; end if;
 select id into v_owner from auth.users where lower(email)='matmove.sl@gmail.com' and email_confirmed_at is not null;
 -- Existing owners keep full operational access, while staff management becomes exclusive to the designated owner.
 update public.matmove_staff_access set is_owner=false,permissions=v_all,department='Administrative admin',updated_at=now() where is_owner and id<>v_owner;
 insert into public.matmove_staff_access(id,email,full_name,department,permissions,is_owner,is_active,requires_password_setup,invite_state)
 values(v_owner,'matmove.sl@gmail.com','MatMove Super Admin','Super admin',v_all,true,true,false,'authorized')
 on conflict(id) do update set email=excluded.email,department='Super admin',permissions=v_all,is_owner=true,is_active=true,requires_password_setup=false,updated_at=now();
 insert into public.matmove_staff_audit(actor_id,target_id,action,details) values(v_owner,v_owner,'RESTORE_DESIGNATED_OWNER',jsonb_build_object('email','matmove.sl@gmail.com','otherOwners','full operational access without staff management'));
end;
$owner$;
update public.matmove_staff_access set permissions=(permissions-'games')||'["games.overview","games.players","games.entries","games.winnings","games.settings","games.recovery"]'::jsonb where permissions ? 'games';
create or replace function public.matmove_admin_can(p_section text)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $staff$
 select exists(select 1 from public.matmove_staff_access a where a.id=auth.uid() and a.is_active and
 (a.is_owner or a.permissions ? p_section or (p_section='games' and exists(select 1 from jsonb_array_elements_text(a.permissions) p where p like 'games.%'))));
$staff$;
create or replace function public.matmove_admin_any(p_sections text[])
returns boolean language sql stable security definer set search_path=pg_catalog,public as $staff$
 select exists(select 1 from unnest(p_sections) s where public.matmove_admin_can(s));
$staff$;
create or replace function public.matmove_is_staff()
returns boolean language sql stable security definer set search_path=pg_catalog,public as $staff$
 select exists(select 1 from public.matmove_staff_access where id=auth.uid());
$staff$;
create or replace function public.matmove_admin_me()
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $staff$
 select to_jsonb(a) from public.matmove_staff_access a where id=auth.uid();
$staff$;
create or replace function public.matmove_admin_access(p_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $staff$
 select to_jsonb(a) from public.matmove_staff_access a where id=p_id;
$staff$;
create or replace function public.matmove_staff_find_user(p_email text)
returns uuid language sql stable security definer set search_path=pg_catalog,public as $staff$
 select id from auth.users where lower(email)=lower(p_email) limit 1;
$staff$;
create or replace function public.matmove_staff_save(p_actor uuid,p_id uuid,p_email text,p_name text,p_permissions jsonb,p_department text,p_active boolean,p_setup boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public as $staff$
begin
 perform pg_advisory_xact_lock(87192811);
 if not exists(select 1 from public.matmove_staff_access where id=p_actor and is_active and is_owner) then raise exception 'FORBIDDEN: Only the active owner can authorize staff.';end if;
 if p_id=p_actor or exists(select 1 from public.matmove_staff_access where id=p_id and is_owner) then raise exception 'FORBIDDEN: Owner access is protected.';end if;
 if p_active is null or p_setup is null or length(trim(p_name))<2 or p_email is null or not exists(select 1 from auth.users where id=p_id and lower(email)=lower(p_email)) then raise exception 'INVALID: Invalid staff identity.';end if;
 if jsonb_typeof(p_permissions) is distinct from 'array' or jsonb_array_length(p_permissions)<1 or jsonb_array_length(p_permissions)>16 or exists(select 1 from jsonb_array_elements(p_permissions) p where jsonb_typeof(p)<>'string' or not (p#>>'{}'=any(ARRAY['dashboard','dispatch','pricing','kyc','financials','transactions','payouts','customers','staff','logs','games.overview','games.players','games.entries','games.winnings','games.settings','games.recovery']::text[]))) then raise exception 'INVALID: Invalid assignments.';end if;
 insert into public.matmove_staff_access(id,email,full_name,permissions,department,is_active,requires_password_setup,invite_state)
 values(p_id,lower(p_email),trim(p_name),p_permissions,p_department,p_active,p_setup,case when p_setup then 'invited' else 'authorized' end)
 on conflict(id) do update set full_name=excluded.full_name,permissions=excluded.permissions,department=excluded.department,is_active=excluded.is_active,updated_at=now();
 insert into public.matmove_staff_audit(actor_id,target_id,action,details) values(p_actor,p_id,'ASSIGN_STAFF',jsonb_build_object('permissions',p_permissions,'active',p_active,'department',p_department));
end;
$staff$;
create or replace function public.matmove_staff_finish_setup()
returns void language plpgsql security definer set search_path=pg_catalog,public as $staff$
begin
 update public.matmove_staff_access set requires_password_setup=false,invite_state='accepted',updated_at=now() where id=auth.uid() and is_active;
 if not found then raise exception 'FORBIDDEN: Active staff assignment required.';end if;
end;
$staff$;
create or replace function public.matmove_spin_admin_allowed()
returns boolean language sql stable security definer set search_path=pg_catalog,public as $staff$
 select public.matmove_admin_can('games');
$staff$;
do $policies$
begin
 if to_regclass('public.profiles') is not null then
  execute 'alter table public.profiles enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.profiles';
  execute 'create policy matmove_staff_select on public.profiles as restrictive for select to authenticated using (not public.matmove_is_staff() or (id=auth.uid()) or public.matmove_admin_any(ARRAY[''dashboard'',''dispatch'',''kyc'',''customers'',''financials'',''payouts'']::text[]))';
 end if;
 if to_regclass('public.profiles') is not null then
  execute 'alter table public.profiles enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.profiles';
  execute 'create policy matmove_staff_insert on public.profiles as restrictive for insert to authenticated with check (not public.matmove_is_staff() or (id=auth.uid()) or public.matmove_admin_any(ARRAY[''kyc'',''customers'']::text[]))';
 end if;
 if to_regclass('public.profiles') is not null then
  execute 'alter table public.profiles enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.profiles';
  execute 'create policy matmove_staff_update on public.profiles as restrictive for update to authenticated using (not public.matmove_is_staff() or (id=auth.uid()) or public.matmove_admin_any(ARRAY[''kyc'',''customers'']::text[])) with check (not public.matmove_is_staff() or (id=auth.uid()) or public.matmove_admin_any(ARRAY[''kyc'',''customers'']::text[]))';
 end if;
 if to_regclass('public.profiles') is not null then
  execute 'alter table public.profiles enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.profiles';
  execute 'create policy matmove_staff_delete on public.profiles as restrictive for delete to authenticated using (not public.matmove_is_staff() or (id=auth.uid()) or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.profiles') is not null then execute 'drop policy if exists matmove_staff_allow_select on public.profiles';execute 'create policy matmove_staff_allow_select on public.profiles for select to authenticated using (public.matmove_admin_any(ARRAY[''dashboard'',''dispatch'',''kyc'',''customers'',''financials'',''payouts'']::text[]))';end if;
 if to_regclass('public.profiles') is not null then execute 'drop policy if exists matmove_staff_allow_insert on public.profiles';execute 'create policy matmove_staff_allow_insert on public.profiles for insert to authenticated with check (public.matmove_admin_any(ARRAY[''kyc'',''customers'']::text[]))';end if;
 if to_regclass('public.profiles') is not null then execute 'drop policy if exists matmove_staff_allow_update on public.profiles';execute 'create policy matmove_staff_allow_update on public.profiles for update to authenticated using (public.matmove_admin_any(ARRAY[''kyc'',''customers'']::text[])) with check (public.matmove_admin_any(ARRAY[''kyc'',''customers'']::text[]))';end if;
 if to_regclass('public.bookings') is not null then
  execute 'alter table public.bookings enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.bookings';
  execute 'create policy matmove_staff_select on public.bookings as restrictive for select to authenticated using (not public.matmove_is_staff() or (rider_id=auth.uid() or driver_id=auth.uid()) or public.matmove_admin_any(ARRAY[''dashboard'',''dispatch'']::text[]))';
 end if;
 if to_regclass('public.bookings') is not null then
  execute 'alter table public.bookings enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.bookings';
  execute 'create policy matmove_staff_insert on public.bookings as restrictive for insert to authenticated with check (not public.matmove_is_staff() or (rider_id=auth.uid() or driver_id=auth.uid()) or public.matmove_admin_any(ARRAY[''dispatch'']::text[]))';
 end if;
 if to_regclass('public.bookings') is not null then
  execute 'alter table public.bookings enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.bookings';
  execute 'create policy matmove_staff_update on public.bookings as restrictive for update to authenticated using (not public.matmove_is_staff() or (rider_id=auth.uid() or driver_id=auth.uid()) or public.matmove_admin_any(ARRAY[''dispatch'']::text[])) with check (not public.matmove_is_staff() or (rider_id=auth.uid() or driver_id=auth.uid()) or public.matmove_admin_any(ARRAY[''dispatch'']::text[]))';
 end if;
 if to_regclass('public.bookings') is not null then
  execute 'alter table public.bookings enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.bookings';
  execute 'create policy matmove_staff_delete on public.bookings as restrictive for delete to authenticated using (not public.matmove_is_staff() or (rider_id=auth.uid() or driver_id=auth.uid()) or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.bookings') is not null then execute 'drop policy if exists matmove_staff_allow_select on public.bookings';execute 'create policy matmove_staff_allow_select on public.bookings for select to authenticated using (public.matmove_admin_any(ARRAY[''dashboard'',''dispatch'']::text[]))';end if;
 if to_regclass('public.bookings') is not null then execute 'drop policy if exists matmove_staff_allow_insert on public.bookings';execute 'create policy matmove_staff_allow_insert on public.bookings for insert to authenticated with check (public.matmove_admin_any(ARRAY[''dispatch'']::text[]))';end if;
 if to_regclass('public.bookings') is not null then execute 'drop policy if exists matmove_staff_allow_update on public.bookings';execute 'create policy matmove_staff_allow_update on public.bookings for update to authenticated using (public.matmove_admin_any(ARRAY[''dispatch'']::text[])) with check (public.matmove_admin_any(ARRAY[''dispatch'']::text[]))';end if;
 if to_regclass('public.driver_profiles') is not null then
  execute 'alter table public.driver_profiles enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.driver_profiles';
  execute 'create policy matmove_staff_select on public.driver_profiles as restrictive for select to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''kyc'',''customers'',''dispatch'']::text[]))';
 end if;
 if to_regclass('public.driver_profiles') is not null then
  execute 'alter table public.driver_profiles enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.driver_profiles';
  execute 'create policy matmove_staff_insert on public.driver_profiles as restrictive for insert to authenticated with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''kyc'']::text[]))';
 end if;
 if to_regclass('public.driver_profiles') is not null then
  execute 'alter table public.driver_profiles enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.driver_profiles';
  execute 'create policy matmove_staff_update on public.driver_profiles as restrictive for update to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''kyc'']::text[])) with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''kyc'']::text[]))';
 end if;
 if to_regclass('public.driver_profiles') is not null then
  execute 'alter table public.driver_profiles enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.driver_profiles';
  execute 'create policy matmove_staff_delete on public.driver_profiles as restrictive for delete to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.driver_profiles') is not null then execute 'drop policy if exists matmove_staff_allow_select on public.driver_profiles';execute 'create policy matmove_staff_allow_select on public.driver_profiles for select to authenticated using (public.matmove_admin_any(ARRAY[''kyc'',''customers'',''dispatch'']::text[]))';end if;
 if to_regclass('public.driver_profiles') is not null then execute 'drop policy if exists matmove_staff_allow_insert on public.driver_profiles';execute 'create policy matmove_staff_allow_insert on public.driver_profiles for insert to authenticated with check (public.matmove_admin_any(ARRAY[''kyc'']::text[]))';end if;
 if to_regclass('public.driver_profiles') is not null then execute 'drop policy if exists matmove_staff_allow_update on public.driver_profiles';execute 'create policy matmove_staff_allow_update on public.driver_profiles for update to authenticated using (public.matmove_admin_any(ARRAY[''kyc'']::text[])) with check (public.matmove_admin_any(ARRAY[''kyc'']::text[]))';end if;
 if to_regclass('public.wallets') is not null then
  execute 'alter table public.wallets enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.wallets';
  execute 'create policy matmove_staff_select on public.wallets as restrictive for select to authenticated using (not public.matmove_is_staff() or (user_id=auth.uid()) or public.matmove_admin_any(ARRAY[''financials'']::text[]))';
 end if;
 if to_regclass('public.wallets') is not null then
  execute 'alter table public.wallets enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.wallets';
  execute 'create policy matmove_staff_insert on public.wallets as restrictive for insert to authenticated with check (not public.matmove_is_staff() or (user_id=auth.uid()) or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.wallets') is not null then
  execute 'alter table public.wallets enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.wallets';
  execute 'create policy matmove_staff_update on public.wallets as restrictive for update to authenticated using (not public.matmove_is_staff() or (user_id=auth.uid()) or public.matmove_admin_any(ARRAY[]::text[])) with check (not public.matmove_is_staff() or (user_id=auth.uid()) or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.wallets') is not null then
  execute 'alter table public.wallets enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.wallets';
  execute 'create policy matmove_staff_delete on public.wallets as restrictive for delete to authenticated using (not public.matmove_is_staff() or (user_id=auth.uid()) or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.wallets') is not null then execute 'drop policy if exists matmove_staff_allow_select on public.wallets';execute 'create policy matmove_staff_allow_select on public.wallets for select to authenticated using (public.matmove_admin_any(ARRAY[''financials'']::text[]))';end if;
 if to_regclass('public.wallet_transactions') is not null then
  execute 'alter table public.wallet_transactions enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.wallet_transactions';
  execute 'create policy matmove_staff_select on public.wallet_transactions as restrictive for select to authenticated using (not public.matmove_is_staff() or (user_id=auth.uid()) or public.matmove_admin_any(ARRAY[''financials'',''transactions'']::text[]))';
 end if;
 if to_regclass('public.wallet_transactions') is not null then
  execute 'alter table public.wallet_transactions enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.wallet_transactions';
  execute 'create policy matmove_staff_insert on public.wallet_transactions as restrictive for insert to authenticated with check (not public.matmove_is_staff() or (user_id=auth.uid()) or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.wallet_transactions') is not null then
  execute 'alter table public.wallet_transactions enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.wallet_transactions';
  execute 'create policy matmove_staff_update on public.wallet_transactions as restrictive for update to authenticated using (not public.matmove_is_staff() or (user_id=auth.uid()) or public.matmove_admin_any(ARRAY[]::text[])) with check (not public.matmove_is_staff() or (user_id=auth.uid()) or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.wallet_transactions') is not null then
  execute 'alter table public.wallet_transactions enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.wallet_transactions';
  execute 'create policy matmove_staff_delete on public.wallet_transactions as restrictive for delete to authenticated using (not public.matmove_is_staff() or (user_id=auth.uid()) or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.wallet_transactions') is not null then execute 'drop policy if exists matmove_staff_allow_select on public.wallet_transactions';execute 'create policy matmove_staff_allow_select on public.wallet_transactions for select to authenticated using (public.matmove_admin_any(ARRAY[''financials'',''transactions'']::text[]))';end if;
 if to_regclass('public.withdrawal_requests') is not null then
  execute 'alter table public.withdrawal_requests enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.withdrawal_requests';
  execute 'create policy matmove_staff_select on public.withdrawal_requests as restrictive for select to authenticated using (not public.matmove_is_staff() or (user_id=auth.uid()) or public.matmove_admin_any(ARRAY[''payouts'']::text[]))';
 end if;
 if to_regclass('public.withdrawal_requests') is not null then
  execute 'alter table public.withdrawal_requests enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.withdrawal_requests';
  execute 'create policy matmove_staff_insert on public.withdrawal_requests as restrictive for insert to authenticated with check (not public.matmove_is_staff() or (user_id=auth.uid()) or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.withdrawal_requests') is not null then
  execute 'alter table public.withdrawal_requests enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.withdrawal_requests';
  execute 'create policy matmove_staff_update on public.withdrawal_requests as restrictive for update to authenticated using (not public.matmove_is_staff() or (user_id=auth.uid()) or public.matmove_admin_any(ARRAY[]::text[])) with check (not public.matmove_is_staff() or (user_id=auth.uid()) or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.withdrawal_requests') is not null then
  execute 'alter table public.withdrawal_requests enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.withdrawal_requests';
  execute 'create policy matmove_staff_delete on public.withdrawal_requests as restrictive for delete to authenticated using (not public.matmove_is_staff() or (user_id=auth.uid()) or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.withdrawal_requests') is not null then execute 'drop policy if exists matmove_staff_allow_select on public.withdrawal_requests';execute 'create policy matmove_staff_allow_select on public.withdrawal_requests for select to authenticated using (public.matmove_admin_any(ARRAY[''payouts'']::text[]))';end if;
 if to_regclass('public.payment_transactions') is not null then
  execute 'alter table public.payment_transactions enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.payment_transactions';
  execute 'create policy matmove_staff_select on public.payment_transactions as restrictive for select to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''transactions'']::text[]))';
 end if;
 if to_regclass('public.payment_transactions') is not null then
  execute 'alter table public.payment_transactions enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.payment_transactions';
  execute 'create policy matmove_staff_insert on public.payment_transactions as restrictive for insert to authenticated with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.payment_transactions') is not null then
  execute 'alter table public.payment_transactions enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.payment_transactions';
  execute 'create policy matmove_staff_update on public.payment_transactions as restrictive for update to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[])) with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.payment_transactions') is not null then
  execute 'alter table public.payment_transactions enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.payment_transactions';
  execute 'create policy matmove_staff_delete on public.payment_transactions as restrictive for delete to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.payment_transactions') is not null then execute 'drop policy if exists matmove_staff_allow_select on public.payment_transactions';execute 'create policy matmove_staff_allow_select on public.payment_transactions for select to authenticated using (public.matmove_admin_any(ARRAY[''transactions'']::text[]))';end if;
 if to_regclass('public.kyc_submissions') is not null then
  execute 'alter table public.kyc_submissions enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.kyc_submissions';
  execute 'create policy matmove_staff_select on public.kyc_submissions as restrictive for select to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''kyc'']::text[]))';
 end if;
 if to_regclass('public.kyc_submissions') is not null then
  execute 'alter table public.kyc_submissions enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.kyc_submissions';
  execute 'create policy matmove_staff_insert on public.kyc_submissions as restrictive for insert to authenticated with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''kyc'']::text[]))';
 end if;
 if to_regclass('public.kyc_submissions') is not null then
  execute 'alter table public.kyc_submissions enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.kyc_submissions';
  execute 'create policy matmove_staff_update on public.kyc_submissions as restrictive for update to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''kyc'']::text[])) with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''kyc'']::text[]))';
 end if;
 if to_regclass('public.kyc_submissions') is not null then
  execute 'alter table public.kyc_submissions enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.kyc_submissions';
  execute 'create policy matmove_staff_delete on public.kyc_submissions as restrictive for delete to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.kyc_submissions') is not null then execute 'drop policy if exists matmove_staff_allow_select on public.kyc_submissions';execute 'create policy matmove_staff_allow_select on public.kyc_submissions for select to authenticated using (public.matmove_admin_any(ARRAY[''kyc'']::text[]))';end if;
 if to_regclass('public.kyc_submissions') is not null then execute 'drop policy if exists matmove_staff_allow_insert on public.kyc_submissions';execute 'create policy matmove_staff_allow_insert on public.kyc_submissions for insert to authenticated with check (public.matmove_admin_any(ARRAY[''kyc'']::text[]))';end if;
 if to_regclass('public.kyc_submissions') is not null then execute 'drop policy if exists matmove_staff_allow_update on public.kyc_submissions';execute 'create policy matmove_staff_allow_update on public.kyc_submissions for update to authenticated using (public.matmove_admin_any(ARRAY[''kyc'']::text[])) with check (public.matmove_admin_any(ARRAY[''kyc'']::text[]))';end if;
 if to_regclass('public.kyc_documents') is not null then
  execute 'alter table public.kyc_documents enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.kyc_documents';
  execute 'create policy matmove_staff_select on public.kyc_documents as restrictive for select to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''kyc'']::text[]))';
 end if;
 if to_regclass('public.kyc_documents') is not null then
  execute 'alter table public.kyc_documents enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.kyc_documents';
  execute 'create policy matmove_staff_insert on public.kyc_documents as restrictive for insert to authenticated with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.kyc_documents') is not null then
  execute 'alter table public.kyc_documents enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.kyc_documents';
  execute 'create policy matmove_staff_update on public.kyc_documents as restrictive for update to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[])) with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.kyc_documents') is not null then
  execute 'alter table public.kyc_documents enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.kyc_documents';
  execute 'create policy matmove_staff_delete on public.kyc_documents as restrictive for delete to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.kyc_documents') is not null then execute 'drop policy if exists matmove_staff_allow_select on public.kyc_documents';execute 'create policy matmove_staff_allow_select on public.kyc_documents for select to authenticated using (public.matmove_admin_any(ARRAY[''kyc'']::text[]))';end if;
 if to_regclass('public.pricing_settings') is not null then
  execute 'alter table public.pricing_settings enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.pricing_settings';
  execute 'create policy matmove_staff_select on public.pricing_settings as restrictive for select to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''pricing'']::text[]))';
 end if;
 if to_regclass('public.pricing_settings') is not null then
  execute 'alter table public.pricing_settings enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.pricing_settings';
  execute 'create policy matmove_staff_insert on public.pricing_settings as restrictive for insert to authenticated with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''pricing'']::text[]))';
 end if;
 if to_regclass('public.pricing_settings') is not null then
  execute 'alter table public.pricing_settings enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.pricing_settings';
  execute 'create policy matmove_staff_update on public.pricing_settings as restrictive for update to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''pricing'']::text[])) with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''pricing'']::text[]))';
 end if;
 if to_regclass('public.pricing_settings') is not null then
  execute 'alter table public.pricing_settings enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.pricing_settings';
  execute 'create policy matmove_staff_delete on public.pricing_settings as restrictive for delete to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.pricing_settings') is not null then execute 'drop policy if exists matmove_staff_allow_select on public.pricing_settings';execute 'create policy matmove_staff_allow_select on public.pricing_settings for select to authenticated using (public.matmove_admin_any(ARRAY[''pricing'']::text[]))';end if;
 if to_regclass('public.pricing_settings') is not null then execute 'drop policy if exists matmove_staff_allow_insert on public.pricing_settings';execute 'create policy matmove_staff_allow_insert on public.pricing_settings for insert to authenticated with check (public.matmove_admin_any(ARRAY[''pricing'']::text[]))';end if;
 if to_regclass('public.pricing_settings') is not null then execute 'drop policy if exists matmove_staff_allow_update on public.pricing_settings';execute 'create policy matmove_staff_allow_update on public.pricing_settings for update to authenticated using (public.matmove_admin_any(ARRAY[''pricing'']::text[])) with check (public.matmove_admin_any(ARRAY[''pricing'']::text[]))';end if;
 if to_regclass('public.audit_logs') is not null then
  execute 'alter table public.audit_logs enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.audit_logs';
  execute 'create policy matmove_staff_select on public.audit_logs as restrictive for select to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''logs'']::text[]))';
 end if;
 if to_regclass('public.audit_logs') is not null then
  execute 'alter table public.audit_logs enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.audit_logs';
  execute 'create policy matmove_staff_insert on public.audit_logs as restrictive for insert to authenticated with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''dashboard'',''dispatch'',''pricing'',''kyc'',''financials'',''transactions'',''payouts'',''customers'']::text[]))';
 end if;
 if to_regclass('public.audit_logs') is not null then
  execute 'alter table public.audit_logs enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.audit_logs';
  execute 'create policy matmove_staff_update on public.audit_logs as restrictive for update to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''dashboard'',''dispatch'',''pricing'',''kyc'',''financials'',''transactions'',''payouts'',''customers'']::text[])) with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''dashboard'',''dispatch'',''pricing'',''kyc'',''financials'',''transactions'',''payouts'',''customers'']::text[]))';
 end if;
 if to_regclass('public.audit_logs') is not null then
  execute 'alter table public.audit_logs enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.audit_logs';
  execute 'create policy matmove_staff_delete on public.audit_logs as restrictive for delete to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.audit_logs') is not null then execute 'drop policy if exists matmove_staff_allow_select on public.audit_logs';execute 'create policy matmove_staff_allow_select on public.audit_logs for select to authenticated using (public.matmove_admin_any(ARRAY[''logs'']::text[]))';end if;
 if to_regclass('public.audit_logs') is not null then execute 'drop policy if exists matmove_staff_allow_insert on public.audit_logs';execute 'create policy matmove_staff_allow_insert on public.audit_logs for insert to authenticated with check (public.matmove_admin_any(ARRAY[''dashboard'',''dispatch'',''pricing'',''kyc'',''financials'',''transactions'',''payouts'',''customers'']::text[]))';end if;
 if to_regclass('public.audit_logs') is not null then execute 'drop policy if exists matmove_staff_allow_update on public.audit_logs';execute 'create policy matmove_staff_allow_update on public.audit_logs for update to authenticated using (public.matmove_admin_any(ARRAY[''dashboard'',''dispatch'',''pricing'',''kyc'',''financials'',''transactions'',''payouts'',''customers'']::text[])) with check (public.matmove_admin_any(ARRAY[''dashboard'',''dispatch'',''pricing'',''kyc'',''financials'',''transactions'',''payouts'',''customers'']::text[]))';end if;
 if to_regclass('public.fraud_logs') is not null then
  execute 'alter table public.fraud_logs enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.fraud_logs';
  execute 'create policy matmove_staff_select on public.fraud_logs as restrictive for select to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''logs'']::text[]))';
 end if;
 if to_regclass('public.fraud_logs') is not null then
  execute 'alter table public.fraud_logs enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.fraud_logs';
  execute 'create policy matmove_staff_insert on public.fraud_logs as restrictive for insert to authenticated with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.fraud_logs') is not null then
  execute 'alter table public.fraud_logs enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.fraud_logs';
  execute 'create policy matmove_staff_update on public.fraud_logs as restrictive for update to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[])) with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.fraud_logs') is not null then
  execute 'alter table public.fraud_logs enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.fraud_logs';
  execute 'create policy matmove_staff_delete on public.fraud_logs as restrictive for delete to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.fraud_logs') is not null then execute 'drop policy if exists matmove_staff_allow_select on public.fraud_logs';execute 'create policy matmove_staff_allow_select on public.fraud_logs for select to authenticated using (public.matmove_admin_any(ARRAY[''logs'']::text[]))';end if;
 if to_regclass('public.matmove_spin_rounds') is not null then
  execute 'alter table public.matmove_spin_rounds enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.matmove_spin_rounds';
  execute 'create policy matmove_staff_select on public.matmove_spin_rounds as restrictive for select to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_rounds') is not null then
  execute 'alter table public.matmove_spin_rounds enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.matmove_spin_rounds';
  execute 'create policy matmove_staff_insert on public.matmove_spin_rounds as restrictive for insert to authenticated with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_rounds') is not null then
  execute 'alter table public.matmove_spin_rounds enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.matmove_spin_rounds';
  execute 'create policy matmove_staff_update on public.matmove_spin_rounds as restrictive for update to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[])) with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_rounds') is not null then
  execute 'alter table public.matmove_spin_rounds enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.matmove_spin_rounds';
  execute 'create policy matmove_staff_delete on public.matmove_spin_rounds as restrictive for delete to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_legs') is not null then
  execute 'alter table public.matmove_spin_legs enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.matmove_spin_legs';
  execute 'create policy matmove_staff_select on public.matmove_spin_legs as restrictive for select to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_legs') is not null then
  execute 'alter table public.matmove_spin_legs enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.matmove_spin_legs';
  execute 'create policy matmove_staff_insert on public.matmove_spin_legs as restrictive for insert to authenticated with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_legs') is not null then
  execute 'alter table public.matmove_spin_legs enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.matmove_spin_legs';
  execute 'create policy matmove_staff_update on public.matmove_spin_legs as restrictive for update to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[])) with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_legs') is not null then
  execute 'alter table public.matmove_spin_legs enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.matmove_spin_legs';
  execute 'create policy matmove_staff_delete on public.matmove_spin_legs as restrictive for delete to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_configs') is not null then
  execute 'alter table public.matmove_spin_configs enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.matmove_spin_configs';
  execute 'create policy matmove_staff_select on public.matmove_spin_configs as restrictive for select to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_configs') is not null then
  execute 'alter table public.matmove_spin_configs enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.matmove_spin_configs';
  execute 'create policy matmove_staff_insert on public.matmove_spin_configs as restrictive for insert to authenticated with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_configs') is not null then
  execute 'alter table public.matmove_spin_configs enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.matmove_spin_configs';
  execute 'create policy matmove_staff_update on public.matmove_spin_configs as restrictive for update to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[])) with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_configs') is not null then
  execute 'alter table public.matmove_spin_configs enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.matmove_spin_configs';
  execute 'create policy matmove_staff_delete on public.matmove_spin_configs as restrictive for delete to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_access') is not null then
  execute 'alter table public.matmove_spin_access enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.matmove_spin_access';
  execute 'create policy matmove_staff_select on public.matmove_spin_access as restrictive for select to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_access') is not null then
  execute 'alter table public.matmove_spin_access enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.matmove_spin_access';
  execute 'create policy matmove_staff_insert on public.matmove_spin_access as restrictive for insert to authenticated with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_access') is not null then
  execute 'alter table public.matmove_spin_access enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.matmove_spin_access';
  execute 'create policy matmove_staff_update on public.matmove_spin_access as restrictive for update to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[])) with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_access') is not null then
  execute 'alter table public.matmove_spin_access enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.matmove_spin_access';
  execute 'create policy matmove_staff_delete on public.matmove_spin_access as restrictive for delete to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_outcomes') is not null then
  execute 'alter table public.matmove_spin_outcomes enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.matmove_spin_outcomes';
  execute 'create policy matmove_staff_select on public.matmove_spin_outcomes as restrictive for select to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_outcomes') is not null then
  execute 'alter table public.matmove_spin_outcomes enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.matmove_spin_outcomes';
  execute 'create policy matmove_staff_insert on public.matmove_spin_outcomes as restrictive for insert to authenticated with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_outcomes') is not null then
  execute 'alter table public.matmove_spin_outcomes enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.matmove_spin_outcomes';
  execute 'create policy matmove_staff_update on public.matmove_spin_outcomes as restrictive for update to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[])) with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_outcomes') is not null then
  execute 'alter table public.matmove_spin_outcomes enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.matmove_spin_outcomes';
  execute 'create policy matmove_staff_delete on public.matmove_spin_outcomes as restrictive for delete to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_admin_log') is not null then
  execute 'alter table public.matmove_spin_admin_log enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.matmove_spin_admin_log';
  execute 'create policy matmove_staff_select on public.matmove_spin_admin_log as restrictive for select to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_admin_log') is not null then
  execute 'alter table public.matmove_spin_admin_log enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.matmove_spin_admin_log';
  execute 'create policy matmove_staff_insert on public.matmove_spin_admin_log as restrictive for insert to authenticated with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_admin_log') is not null then
  execute 'alter table public.matmove_spin_admin_log enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.matmove_spin_admin_log';
  execute 'create policy matmove_staff_update on public.matmove_spin_admin_log as restrictive for update to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[])) with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.matmove_spin_admin_log') is not null then
  execute 'alter table public.matmove_spin_admin_log enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.matmove_spin_admin_log';
  execute 'create policy matmove_staff_delete on public.matmove_spin_admin_log as restrictive for delete to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.admins') is not null then
  execute 'alter table public.admins enable row level security';
  execute 'drop policy if exists matmove_staff_select on public.admins';
  execute 'create policy matmove_staff_select on public.admins as restrictive for select to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[''staff'']::text[]))';
 end if;
 if to_regclass('public.admins') is not null then
  execute 'alter table public.admins enable row level security';
  execute 'drop policy if exists matmove_staff_insert on public.admins';
  execute 'create policy matmove_staff_insert on public.admins as restrictive for insert to authenticated with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.admins') is not null then
  execute 'alter table public.admins enable row level security';
  execute 'drop policy if exists matmove_staff_update on public.admins';
  execute 'create policy matmove_staff_update on public.admins as restrictive for update to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[])) with check (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.admins') is not null then
  execute 'alter table public.admins enable row level security';
  execute 'drop policy if exists matmove_staff_delete on public.admins';
  execute 'create policy matmove_staff_delete on public.admins as restrictive for delete to authenticated using (not public.matmove_is_staff() or public.matmove_admin_any(ARRAY[]::text[]))';
 end if;
 if to_regclass('public.admins') is not null then execute 'drop policy if exists matmove_staff_allow_select on public.admins';execute 'create policy matmove_staff_allow_select on public.admins for select to authenticated using (public.matmove_admin_any(ARRAY[''staff'']::text[]))';end if;
end;
$policies$;
do $wrap$
declare f record;base_name text;args text;result_type text;call_args text;body text;guard text;
begin
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='matmove_spin_admin_snapshot' loop
  base_name:='matmove_spin_admin_snapshot_staff_base';guard:='public.matmove_admin_can(''games.settings'')';
  args:=pg_get_function_arguments(f.oid);result_type:=pg_get_function_result(f.oid);
  if f.proargmodes is not null then raise exception 'Unsupported OUT arguments in %. Ask for a schema-specific wrapper.',f.proname;end if;
  select coalesce(string_agg(quote_ident(x),','),'') into call_args from unnest(f.proargnames) x;
  if not exists(select 1 from pg_proc q where q.pronamespace=f.pronamespace and q.proname=base_name and q.proargtypes=f.proargtypes) then
   execute format('alter function public.%I(%s) rename to %I',f.proname,pg_get_function_identity_arguments(f.oid),base_name);
  end if;
  body:='begin if not ('||guard||') then raise exception ''FORBIDDEN: Access denied for this assignment.'';end if;';
  if result_type='void' then body:=body||format('perform public.%I(%s);return;',base_name,call_args);
  elsif f.proretset then body:=body||format('return query select * from public.%I(%s);',base_name,call_args);
  else body:=body||format('return public.%I(%s);',base_name,call_args);end if;
  body:=body||'end;';
  execute format('create or replace function public.%I(%s) returns %s language plpgsql security definer set search_path=pg_catalog,public as %L',f.proname,args,result_type,body);
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',base_name,pg_get_function_identity_arguments(f.oid));
  execute format('grant execute on function public.%I(%s) to authenticated,service_role',f.proname,pg_get_function_identity_arguments(f.oid));
 end loop;
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='matmove_spin_admin_report' loop
  base_name:='matmove_spin_admin_report_staff_base';guard:='public.matmove_admin_can(case p_view when ''rounds'' then ''games.overview'' when ''players'' then ''games.players'' when ''entries'' then ''games.entries'' when ''winnings'' then ''games.winnings'' else ''invalid'' end)';
  args:=pg_get_function_arguments(f.oid);result_type:=pg_get_function_result(f.oid);
  if f.proargmodes is not null then raise exception 'Unsupported OUT arguments in %. Ask for a schema-specific wrapper.',f.proname;end if;
  select coalesce(string_agg(quote_ident(x),','),'') into call_args from unnest(f.proargnames) x;
  if not exists(select 1 from pg_proc q where q.pronamespace=f.pronamespace and q.proname=base_name and q.proargtypes=f.proargtypes) then
   execute format('alter function public.%I(%s) rename to %I',f.proname,pg_get_function_identity_arguments(f.oid),base_name);
  end if;
  body:='begin if not ('||guard||') then raise exception ''FORBIDDEN: Access denied for this assignment.'';end if;';
  if result_type='void' then body:=body||format('perform public.%I(%s);return;',base_name,call_args);
  elsif f.proretset then body:=body||format('return query select * from public.%I(%s);',base_name,call_args);
  else body:=body||format('return public.%I(%s);',base_name,call_args);end if;
  body:=body||'end;';
  execute format('create or replace function public.%I(%s) returns %s language plpgsql security definer set search_path=pg_catalog,public as %L',f.proname,args,result_type,body);
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',base_name,pg_get_function_identity_arguments(f.oid));
  execute format('grant execute on function public.%I(%s) to authenticated,service_role',f.proname,pg_get_function_identity_arguments(f.oid));
 end loop;
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='matmove_spin_admin_outcomes' loop
  base_name:='matmove_spin_admin_outcomes_staff_base';guard:='public.matmove_admin_can(''games.overview'')';
  args:=pg_get_function_arguments(f.oid);result_type:=pg_get_function_result(f.oid);
  if f.proargmodes is not null then raise exception 'Unsupported OUT arguments in %. Ask for a schema-specific wrapper.',f.proname;end if;
  select coalesce(string_agg(quote_ident(x),','),'') into call_args from unnest(f.proargnames) x;
  if not exists(select 1 from pg_proc q where q.pronamespace=f.pronamespace and q.proname=base_name and q.proargtypes=f.proargtypes) then
   execute format('alter function public.%I(%s) rename to %I',f.proname,pg_get_function_identity_arguments(f.oid),base_name);
  end if;
  body:='begin if not ('||guard||') then raise exception ''FORBIDDEN: Access denied for this assignment.'';end if;';
  if result_type='void' then body:=body||format('perform public.%I(%s);return;',base_name,call_args);
  elsif f.proretset then body:=body||format('return query select * from public.%I(%s);',base_name,call_args);
  else body:=body||format('return public.%I(%s);',base_name,call_args);end if;
  body:=body||'end;';
  execute format('create or replace function public.%I(%s) returns %s language plpgsql security definer set search_path=pg_catalog,public as %L',f.proname,args,result_type,body);
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',base_name,pg_get_function_identity_arguments(f.oid));
  execute format('grant execute on function public.%I(%s) to authenticated,service_role',f.proname,pg_get_function_identity_arguments(f.oid));
 end loop;
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='matmove_spin_admin_save_six' loop
  base_name:='matmove_spin_admin_save_six_staff_base';guard:='public.matmove_admin_can(''games.settings'')';
  args:=pg_get_function_arguments(f.oid);result_type:=pg_get_function_result(f.oid);
  if f.proargmodes is not null then raise exception 'Unsupported OUT arguments in %. Ask for a schema-specific wrapper.',f.proname;end if;
  select coalesce(string_agg(quote_ident(x),','),'') into call_args from unnest(f.proargnames) x;
  if not exists(select 1 from pg_proc q where q.pronamespace=f.pronamespace and q.proname=base_name and q.proargtypes=f.proargtypes) then
   execute format('alter function public.%I(%s) rename to %I',f.proname,pg_get_function_identity_arguments(f.oid),base_name);
  end if;
  body:='begin if not ('||guard||') then raise exception ''FORBIDDEN: Access denied for this assignment.'';end if;';
  if result_type='void' then body:=body||format('perform public.%I(%s);return;',base_name,call_args);
  elsif f.proretset then body:=body||format('return query select * from public.%I(%s);',base_name,call_args);
  else body:=body||format('return public.%I(%s);',base_name,call_args);end if;
  body:=body||'end;';
  execute format('create or replace function public.%I(%s) returns %s language plpgsql security definer set search_path=pg_catalog,public as %L',f.proname,args,result_type,body);
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',base_name,pg_get_function_identity_arguments(f.oid));
  execute format('grant execute on function public.%I(%s) to authenticated,service_role',f.proname,pg_get_function_identity_arguments(f.oid));
 end loop;
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='matmove_spin_admin_receipt' loop
  base_name:='matmove_spin_admin_receipt_staff_base';guard:='public.matmove_admin_can(''games.recovery'')';
  args:=pg_get_function_arguments(f.oid);result_type:=pg_get_function_result(f.oid);
  if f.proargmodes is not null then raise exception 'Unsupported OUT arguments in %. Ask for a schema-specific wrapper.',f.proname;end if;
  select coalesce(string_agg(quote_ident(x),','),'') into call_args from unnest(f.proargnames) x;
  if not exists(select 1 from pg_proc q where q.pronamespace=f.pronamespace and q.proname=base_name and q.proargtypes=f.proargtypes) then
   execute format('alter function public.%I(%s) rename to %I',f.proname,pg_get_function_identity_arguments(f.oid),base_name);
  end if;
  body:='begin if not ('||guard||') then raise exception ''FORBIDDEN: Access denied for this assignment.'';end if;';
  if result_type='void' then body:=body||format('perform public.%I(%s);return;',base_name,call_args);
  elsif f.proretset then body:=body||format('return query select * from public.%I(%s);',base_name,call_args);
  else body:=body||format('return public.%I(%s);',base_name,call_args);end if;
  body:=body||'end;';
  execute format('create or replace function public.%I(%s) returns %s language plpgsql security definer set search_path=pg_catalog,public as %L',f.proname,args,result_type,body);
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',base_name,pg_get_function_identity_arguments(f.oid));
  execute format('grant execute on function public.%I(%s) to authenticated,service_role',f.proname,pg_get_function_identity_arguments(f.oid));
 end loop;
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='matmove_admin_set_wallet_frozen' loop
  base_name:='matmove_admin_set_wallet_frozen_staff_base';guard:='public.matmove_admin_can(''financials'')';
  args:=pg_get_function_arguments(f.oid);result_type:=pg_get_function_result(f.oid);
  if f.proargmodes is not null then raise exception 'Unsupported OUT arguments in %. Ask for a schema-specific wrapper.',f.proname;end if;
  select coalesce(string_agg(quote_ident(x),','),'') into call_args from unnest(f.proargnames) x;
  if not exists(select 1 from pg_proc q where q.pronamespace=f.pronamespace and q.proname=base_name and q.proargtypes=f.proargtypes) then
   execute format('alter function public.%I(%s) rename to %I',f.proname,pg_get_function_identity_arguments(f.oid),base_name);
  end if;
  body:='begin if not ('||guard||') then raise exception ''FORBIDDEN: Access denied for this assignment.'';end if;';
  if result_type='void' then body:=body||format('perform public.%I(%s);return;',base_name,call_args);
  elsif f.proretset then body:=body||format('return query select * from public.%I(%s);',base_name,call_args);
  else body:=body||format('return public.%I(%s);',base_name,call_args);end if;
  body:=body||'end;';
  execute format('create or replace function public.%I(%s) returns %s language plpgsql security definer set search_path=pg_catalog,public as %L',f.proname,args,result_type,body);
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',base_name,pg_get_function_identity_arguments(f.oid));
  execute format('grant execute on function public.%I(%s) to authenticated,service_role',f.proname,pg_get_function_identity_arguments(f.oid));
 end loop;
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='review_kyc_submission' loop
  base_name:='review_kyc_submission_staff_base';guard:='public.matmove_admin_can(''kyc'')';
  args:=pg_get_function_arguments(f.oid);result_type:=pg_get_function_result(f.oid);
  if f.proargmodes is not null then raise exception 'Unsupported OUT arguments in %. Ask for a schema-specific wrapper.',f.proname;end if;
  select coalesce(string_agg(quote_ident(x),','),'') into call_args from unnest(f.proargnames) x;
  if not exists(select 1 from pg_proc q where q.pronamespace=f.pronamespace and q.proname=base_name and q.proargtypes=f.proargtypes) then
   execute format('alter function public.%I(%s) rename to %I',f.proname,pg_get_function_identity_arguments(f.oid),base_name);
  end if;
  body:='begin if not ('||guard||') then raise exception ''FORBIDDEN: Access denied for this assignment.'';end if;';
  if result_type='void' then body:=body||format('perform public.%I(%s);return;',base_name,call_args);
  elsif f.proretset then body:=body||format('return query select * from public.%I(%s);',base_name,call_args);
  else body:=body||format('return public.%I(%s);',base_name,call_args);end if;
  body:=body||'end;';
  execute format('create or replace function public.%I(%s) returns %s language plpgsql security definer set search_path=pg_catalog,public as %L',f.proname,args,result_type,body);
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',base_name,pg_get_function_identity_arguments(f.oid));
  execute format('grant execute on function public.%I(%s) to authenticated,service_role',f.proname,pg_get_function_identity_arguments(f.oid));
 end loop;
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_authorize_withdrawal' loop
  base_name:='admin_authorize_withdrawal_staff_base';guard:='public.matmove_admin_can(''payouts'')';
  args:=pg_get_function_arguments(f.oid);result_type:=pg_get_function_result(f.oid);
  if f.proargmodes is not null then raise exception 'Unsupported OUT arguments in %. Ask for a schema-specific wrapper.',f.proname;end if;
  select coalesce(string_agg(quote_ident(x),','),'') into call_args from unnest(f.proargnames) x;
  if not exists(select 1 from pg_proc q where q.pronamespace=f.pronamespace and q.proname=base_name and q.proargtypes=f.proargtypes) then
   execute format('alter function public.%I(%s) rename to %I',f.proname,pg_get_function_identity_arguments(f.oid),base_name);
  end if;
  body:='begin if not ('||guard||') then raise exception ''FORBIDDEN: Access denied for this assignment.'';end if;';
  if result_type='void' then body:=body||format('perform public.%I(%s);return;',base_name,call_args);
  elsif f.proretset then body:=body||format('return query select * from public.%I(%s);',base_name,call_args);
  else body:=body||format('return public.%I(%s);',base_name,call_args);end if;
  body:=body||'end;';
  execute format('create or replace function public.%I(%s) returns %s language plpgsql security definer set search_path=pg_catalog,public as %L',f.proname,args,result_type,body);
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',base_name,pg_get_function_identity_arguments(f.oid));
  execute format('grant execute on function public.%I(%s) to authenticated,service_role',f.proname,pg_get_function_identity_arguments(f.oid));
 end loop;
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_reject_withdrawal' loop
  base_name:='admin_reject_withdrawal_staff_base';guard:='public.matmove_admin_can(''payouts'')';
  args:=pg_get_function_arguments(f.oid);result_type:=pg_get_function_result(f.oid);
  if f.proargmodes is not null then raise exception 'Unsupported OUT arguments in %. Ask for a schema-specific wrapper.',f.proname;end if;
  select coalesce(string_agg(quote_ident(x),','),'') into call_args from unnest(f.proargnames) x;
  if not exists(select 1 from pg_proc q where q.pronamespace=f.pronamespace and q.proname=base_name and q.proargtypes=f.proargtypes) then
   execute format('alter function public.%I(%s) rename to %I',f.proname,pg_get_function_identity_arguments(f.oid),base_name);
  end if;
  body:='begin if not ('||guard||') then raise exception ''FORBIDDEN: Access denied for this assignment.'';end if;';
  if result_type='void' then body:=body||format('perform public.%I(%s);return;',base_name,call_args);
  elsif f.proretset then body:=body||format('return query select * from public.%I(%s);',base_name,call_args);
  else body:=body||format('return public.%I(%s);',base_name,call_args);end if;
  body:=body||'end;';
  execute format('create or replace function public.%I(%s) returns %s language plpgsql security definer set search_path=pg_catalog,public as %L',f.proname,args,result_type,body);
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',base_name,pg_get_function_identity_arguments(f.oid));
  execute format('grant execute on function public.%I(%s) to authenticated,service_role',f.proname,pg_get_function_identity_arguments(f.oid));
 end loop;
end;
$wrap$;
create or replace function public.matmove_spin_admin_report(p_view text,p_page integer default 1,p_search text default '',p_status text default 'all',p_player uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $staff$
declare r jsonb;summary jsonb;
begin
 if not public.matmove_admin_can(case p_view when 'rounds' then 'games.overview' when 'players' then 'games.players' when 'entries' then 'games.entries' when 'winnings' then 'games.winnings' else 'invalid' end) then raise exception 'FORBIDDEN: Access denied for this assignment.';end if;
 r:=public.matmove_spin_admin_report_staff_base(p_view,p_page,p_search,p_status,p_player);summary:=r->'stats';
 if not public.matmove_admin_any(ARRAY['games.overview','games.players','games.winnings']) then summary:=summary-'winsPaidMinor'-'winsOwedMinor'-'prizesCredited';end if;
 if not public.matmove_admin_any(ARRAY['games.overview','games.players','games.entries']) then summary:=summary-'entryReceivedMinor'-'paidEntries'-'pendingEntries';end if;
 return jsonb_set(r,'{stats}',summary);
end;
$staff$;
-- Disable obsolete authenticated game-management entry points.
do $old$
declare f record;
begin
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('matmove_spin_admin_save','matmove_spin_admin_save_tiers','matmove_spin_admin_access') loop
 execute format('revoke execute on function public.%I(%s) from public,anon,authenticated',f.proname,pg_get_function_identity_arguments(f.oid));
 end loop;
end;
$old$;
-- Browser users cannot forge admin roles, freeze flags or wallet balances.
create or replace function public.matmove_staff_protect_profile()
returns trigger language plpgsql set search_path=pg_catalog,public as $staff$
begin
 if current_user='authenticated' and (
  (new.role is distinct from old.role and new.role not in ('rider','driver','merchant')) or
  (to_jsonb(new)->'is_wallet_frozen' is distinct from to_jsonb(old)->'is_wallet_frozen')
 ) then raise exception 'FORBIDDEN: Protected profile fields require an authorized server action.';end if;
 return new;
end;
$staff$;
drop trigger if exists matmove_staff_protect_profile on public.profiles;
create trigger matmove_staff_protect_profile before update on public.profiles for each row execute function public.matmove_staff_protect_profile();
create or replace function public.matmove_staff_protect_wallet()
returns trigger language plpgsql set search_path=pg_catalog,public as $staff$
begin
 if current_user='authenticated' and public.matmove_is_staff() then raise exception 'FORBIDDEN: Wallet changes require an authorized server function.';end if;
 return new;
end;
$staff$;
drop trigger if exists matmove_staff_protect_wallet on public.wallets;
create trigger matmove_staff_protect_wallet before update on public.wallets for each row execute function public.matmove_staff_protect_wallet();
revoke all on function public.matmove_admin_can(text) from public,anon;
grant execute on function public.matmove_admin_can(text) to authenticated,service_role;
revoke all on function public.matmove_admin_any(text[]) from public,anon;
grant execute on function public.matmove_admin_any(text[]) to authenticated,service_role;
revoke all on function public.matmove_is_staff() from public,anon;
grant execute on function public.matmove_is_staff() to authenticated,service_role;
revoke all on function public.matmove_admin_me() from public,anon;
grant execute on function public.matmove_admin_me() to authenticated,service_role;
revoke all on function public.matmove_staff_finish_setup() from public,anon;
grant execute on function public.matmove_staff_finish_setup() to authenticated,service_role;
revoke all on function public.matmove_admin_access(uuid) from public,anon,authenticated;
grant execute on function public.matmove_admin_access(uuid) to service_role;
revoke all on function public.matmove_staff_find_user(text) from public,anon,authenticated;
grant execute on function public.matmove_staff_find_user(text) to service_role;
revoke all on function public.matmove_staff_save(uuid,uuid,text,text,jsonb,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.matmove_staff_save(uuid,uuid,text,text,jsonb,text,boolean,boolean) to service_role;
create or replace function public.matmove_admin_set_wallet_frozen(p_wallet_id uuid,p_is_frozen boolean,p_reason text default 'Admin wallet freeze')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $staff$
declare owner_id uuid;
begin
 if not public.matmove_admin_can('financials') then raise exception 'FORBIDDEN: Access denied for wallet management.';end if;
 if p_is_frozen is null or length(trim(coalesce(p_reason,'')))<3 then raise exception 'INVALID: A freeze reason is required.';end if;
 select user_id into owner_id from public.wallets where id=p_wallet_id;
 if not found then raise exception 'NOT_FOUND: Wallet not found.';end if;
 perform 1 from public.profiles where id=owner_id for update;
 perform 1 from public.wallets where id=p_wallet_id and user_id=owner_id for update;
 if not found then raise exception 'CONFLICT: Wallet ownership changed. Refresh first.';end if;
 update public.wallets set is_frozen=p_is_frozen where id=p_wallet_id;
 update public.profiles set is_wallet_frozen=exists(select 1 from public.wallets where user_id=owner_id and coalesce(is_frozen,false)) where id=owner_id;
 insert into public.matmove_staff_audit(actor_id,target_id,action,details) values(auth.uid(),owner_id,'WALLET_FREEZE',jsonb_build_object('walletId',p_wallet_id,'frozen',p_is_frozen,'reason',p_reason));
 return jsonb_build_object('success',true,'wallet_id',p_wallet_id,'is_frozen',p_is_frozen,'user_id',owner_id);
end;
$staff$;
revoke all on function public.matmove_admin_set_wallet_frozen(uuid,boolean,text) from public,anon;
grant execute on function public.matmove_admin_set_wallet_frozen(uuid,boolean,text) to authenticated,service_role;
grant usage on schema public to authenticated,service_role;
-- This verification result must show is_owner=true and is_active=true.
select id,email,is_owner,is_active,department from public.matmove_staff_access where lower(email)='matmove.sl@gmail.com';
NOTIFY pgrst, 'reload schema';
commit;
