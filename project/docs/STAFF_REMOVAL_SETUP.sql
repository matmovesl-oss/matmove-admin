
-- Run this ENTIRE file as postgres in the existing shared Supabase project.
-- Requires STAFF_ACCESS_REPAIR.sql to have succeeded previously.
-- Keeps RLS enabled. Never deletes Auth identities, profiles, wallets or receipts.
begin;

do $check$
begin
 if to_regclass('public.matmove_staff_access') is null or
    to_regclass('public.matmove_staff_audit') is null or
    to_regprocedure('public.matmove_admin_can(text)') is null then
  raise exception 'SETUP_REQUIRED: Install the existing staff access repair before staff removal.';
 end if;
end;
$check$;

alter table public.matmove_staff_access add column if not exists removed_at timestamptz;
alter table public.matmove_staff_access add column if not exists removed_by uuid;
alter table public.matmove_staff_access enable row level security;
alter table public.matmove_staff_audit enable row level security;
revoke all on public.matmove_staff_access,public.matmove_staff_audit from public,anon,authenticated;
grant all on public.matmove_staff_access,public.matmove_staff_audit to service_role;

-- Keep the staff row as a revocation record: existing restrictive RLS policies
-- must continue to recognize the identity even after it leaves the directory.
create or replace function public.matmove_is_staff()
returns boolean language sql stable security definer set search_path=pg_catalog,public as $staff$
 select exists(select 1 from public.matmove_staff_access where id=auth.uid());
$staff$;

create or replace function public.matmove_admin_can(p_section text)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $staff$
 select exists(select 1 from public.matmove_staff_access a
 where a.id=auth.uid() and a.is_active and a.removed_at is null and
 (a.is_owner or a.permissions ? p_section or
 (p_section='games' and exists(select 1 from jsonb_array_elements_text(a.permissions) p where p like 'games.%'))));
$staff$;

-- Legacy RLS helper uses authoritative active staff assignments. Profile.role
-- and an old browser token cannot restore administrative privileges.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=pg_catalog,public as $staff$
 select exists(select 1 from public.matmove_staff_access a where a.id=auth.uid()
 and a.is_active and a.removed_at is null and (a.is_owner or exists(select 1 from public.admins legacy where legacy.id=a.id)));
$staff$;

-- Preserve any existing UUID overloads' argument names/defaults when repairing
-- legacy helpers. Do not modify unrelated role functions or Customer RPCs.
do $helpers$
declare f record; body_sql text;
begin
 for f in select p.oid,p.proname,pg_get_function_arguments(p.oid) args,p.pronargs
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('is_admin','is_super_admin')
  and p.prorettype='boolean'::regtype and p.prokind='f'
  and (p.pronargs=0 or (p.pronargs=1 and p.proargtypes[0]='uuid'::regtype))
 loop
  body_sql:='select exists(select 1 from public.matmove_staff_access a where a.id=' ||
   case when f.pronargs=0 then 'auth.uid()' else '$1' end ||
   ' and a.is_active and a.removed_at is null and ' ||
   case when f.proname='is_super_admin' then 'a.is_owner' else '(a.is_owner or exists(select 1 from public.admins legacy where legacy.id=a.id))' end || ')';
  execute format('create or replace function public.%I(%s) returns boolean language sql stable security definer set search_path=pg_catalog,public as %L',f.proname,f.args,body_sql);
  execute format('revoke all on function public.%I(%s) from public,anon',f.proname,pg_get_function_identity_arguments(f.oid));
  execute format('grant execute on function public.%I(%s) to authenticated,service_role',f.proname,pg_get_function_identity_arguments(f.oid));
 end loop;
end;
$helpers$;

create or replace function public.matmove_staff_removal_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $staff$
begin
 if tg_op='DELETE' then
  raise exception 'FORBIDDEN: Staff revocation records must be retained. Use the owner removal action.';
 end if;
 if tg_op='UPDATE' and old.removed_at is not null and
    (new.removed_at is null or new.is_active or new.is_owner or new.permissions<>'[]'::jsonb or new.requires_password_setup) then
  if current_user in ('authenticated','anon') or
     current_setting('matmove.staff_restore_id',true) is distinct from new.id::text then
   raise exception 'REMOVED: Use the explicit owner restore action for removed staff.';
  end if;
 end if;
 if new.removed_at is not null and
    (new.is_active or new.is_owner or new.permissions<>'[]'::jsonb or new.requires_password_setup or new.invite_state<>'removed') then
  raise exception 'INVALID: Removed staff cannot hold administrative assignments.';
 end if;
 return new;
end;
$staff$;
drop trigger if exists matmove_staff_removal_guard on public.matmove_staff_access;
create trigger matmove_staff_removal_guard before insert or update or delete on public.matmove_staff_access
for each row execute function public.matmove_staff_removal_guard();

-- Block recreating legacy Admin memberships for an identity already removed.
create or replace function public.matmove_staff_legacy_grant_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $staff$
declare target_id uuid; role_name text;
begin
 if tg_table_name='admins' then target_id:=new.id;
 else
  target_id:=new.profile_id;role_name:=lower(new.role::text);
  if role_name not in ('admin','super_admin','administrator','owner','admin_dispatch','admin_compliance','admin_finance') then return new;end if;
 end if;
 if exists(select 1 from public.matmove_staff_access where id=target_id and removed_at is not null) then
  raise exception 'REMOVED: Restore staff access explicitly before assigning legacy administrative roles.';
 end if;
 return new;
end;
$staff$;
drop trigger if exists matmove_staff_legacy_grant_guard on public.admins;
create trigger matmove_staff_legacy_grant_guard before insert or update on public.admins
for each row execute function public.matmove_staff_legacy_grant_guard();
do $roles$
begin
 if to_regclass('public.user_roles') is not null then
  execute 'drop trigger if exists matmove_staff_legacy_grant_guard on public.user_roles';
  execute 'create trigger matmove_staff_legacy_grant_guard before insert or update on public.user_roles for each row execute function public.matmove_staff_legacy_grant_guard()';
 end if;
end;
$roles$;

-- Refuse membership deletion if any downstream history refers to that exact
-- membership, including CASCADE/SET NULL foreign keys. Never erase audit rows.
create or replace function public.matmove_staff_check_membership_history(p_table regclass,p_id uuid,p_owner_column text,p_roles boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public as $staff$
declare f record; joined text; linked boolean; role_filter text;
begin
 role_filter:=case when p_roles then ' and lower(parent.role::text) in (''admin'',''super_admin'',''administrator'',''owner'',''admin_dispatch'',''admin_compliance'',''admin_finance'')' else '' end;
 for f in select c.oid,c.conrelid,c.conkey,c.confkey from pg_constraint c where c.contype='f' and c.confrelid=p_table loop
  -- Prevent a new referencing row from appearing between this check and DELETE.
  execute format('lock table %s in share row exclusive mode',f.conrelid::regclass);
  select string_agg(format('child.%I=parent.%I',child.attname,parent.attname),' and ' order by k.i) into joined
  from generate_subscripts(f.conkey,1) k(i)
  join pg_attribute child on child.attrelid=f.conrelid and child.attnum=f.conkey[k.i]
  join pg_attribute parent on parent.attrelid=p_table and parent.attnum=f.confkey[k.i];
  execute format('select exists(select 1 from %s child join %s parent on %s where parent.%I=$1%s)',f.conrelid::regclass,p_table,joined,p_owner_column,role_filter) into linked using p_id;
  if linked then raise exception 'CONFLICT: Membership history still references this staff member. Nothing was removed; contact support before retrying.';end if;
 end loop;
end;
$staff$;

create or replace function public.matmove_staff_remove(p_actor uuid,p_id uuid,p_expected timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $staff$
declare target public.matmove_staff_access%rowtype; legacy jsonb; old_roles jsonb; previous_access jsonb;
begin
 -- Same lock as matmove_staff_save: concurrent changes cannot cross removal.
 perform pg_advisory_xact_lock(87192811);
 if p_actor is null or not exists(select 1 from public.matmove_staff_access where id=p_actor and is_owner and is_active and removed_at is null) then
  raise exception 'FORBIDDEN: Only the active owner can remove staff.';
 end if;
 select * into target from public.matmove_staff_access where id=p_id for update;
 if not found then raise exception 'NOT_FOUND: Staff account not found.';end if;
 if p_id=p_actor or target.is_owner then raise exception 'FORBIDDEN: Owner access is protected.';end if;
 if p_reason is null or length(trim(p_reason))<3 or length(trim(p_reason))>500 then raise exception 'INVALID: Enter a removal reason from 3 to 500 characters.';end if;
 if target.removed_at is not null then return jsonb_build_object('removed',true,'id',p_id,'removedAt',target.removed_at);end if;
 if p_expected is null or target.updated_at is distinct from p_expected then raise exception 'CONFLICT: Staff assignments changed. Refresh and review before removing.';end if;
 previous_access:=to_jsonb(target);
 select to_jsonb(a) into legacy from public.admins a where a.id=p_id;
 perform public.matmove_staff_check_membership_history('public.admins'::regclass,p_id,'id',false);
 if to_regclass('public.user_roles') is not null then
  perform public.matmove_staff_check_membership_history('public.user_roles'::regclass,p_id,'profile_id',true);
  execute 'select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from public.user_roles r where profile_id=$1 and lower(role::text)=any($2)'
   into old_roles using p_id,ARRAY['admin','super_admin','administrator','owner','admin_dispatch','admin_compliance','admin_finance']::text[];
  execute 'delete from public.user_roles where profile_id=$1 and lower(role::text)=any($2)'
   using p_id,ARRAY['admin','super_admin','administrator','owner','admin_dispatch','admin_compliance','admin_finance']::text[];
 end if;
 -- Only the obsolete Admin membership is removed. Never cascade through Auth.
 delete from public.admins where id=p_id;
 update public.matmove_staff_access set is_active=false,is_owner=false,permissions='[]'::jsonb,
  requires_password_setup=false,invite_state='removed',removed_at=clock_timestamp(),removed_by=p_actor,updated_at=clock_timestamp()
 where id=p_id returning * into target;
 insert into public.matmove_staff_audit(actor_id,target_id,action,details) values(p_actor,p_id,'REMOVE_STAFF',
  jsonb_build_object('reason',trim(p_reason),'previousAccess',previous_access,
   'legacyAdminMembership',legacy,'legacyAdministrativeRoles',old_roles,'customerAndFinancialRecordsPreserved',true));
 return jsonb_build_object('removed',true,'id',p_id,'removedAt',target.removed_at);
end;
$staff$;

create or replace function public.matmove_staff_restore(p_actor uuid,p_id uuid,p_expected timestamptz,p_name text,p_permissions jsonb,p_department text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $staff$
declare target public.matmove_staff_access%rowtype;
begin
 perform pg_advisory_xact_lock(87192811);
 if p_actor is null or not exists(select 1 from public.matmove_staff_access where id=p_actor and is_owner and is_active and removed_at is null) then raise exception 'FORBIDDEN: Only the active owner can restore staff.';end if;
 select * into target from public.matmove_staff_access where id=p_id for update;
 if not found or target.removed_at is null then raise exception 'CONFLICT: This account is not awaiting staff restoration. Refresh the directory.';end if;
 if target.is_owner or p_id=p_actor then raise exception 'FORBIDDEN: Owner access is protected.';end if;
 if p_expected is null or target.updated_at is distinct from p_expected then raise exception 'CONFLICT: Staff record changed. Review the restoration again.';end if;
 if p_name is null or length(trim(p_name))<2 or length(trim(p_name))>120 or not exists(select 1 from auth.users where id=p_id and lower(email)=lower(target.email)) then raise exception 'INVALID: Staff identity could not be verified.';end if;
 if jsonb_typeof(p_permissions) is distinct from 'array' or jsonb_array_length(p_permissions)<1 or jsonb_array_length(p_permissions)>16 or exists(select 1 from jsonb_array_elements(p_permissions) p where jsonb_typeof(p)<>'string' or not(p#>>'{}'=any(ARRAY['dashboard','dispatch','pricing','kyc','financials','transactions','payouts','customers','staff','logs','games.overview','games.players','games.entries','games.winnings','games.settings','games.recovery']::text[]))) then raise exception 'INVALID: Invalid assignments.';end if;
 perform set_config('matmove.staff_restore_id',p_id::text,true);
 update public.matmove_staff_access set removed_at=null,removed_by=null,is_active=true,is_owner=false,
  permissions=p_permissions,full_name=trim(p_name),department=coalesce(p_department,''),requires_password_setup=true,invite_state='invited',updated_at=clock_timestamp()
 where id=p_id;
 perform set_config('matmove.staff_restore_id','',true);
 insert into public.matmove_staff_audit(actor_id,target_id,action,details) values(p_actor,p_id,'RESTORE_STAFF',jsonb_build_object('permissions',p_permissions,'previousRemovalAt',target.removed_at));
 -- Does not recreate legacy Admin memberships or change a Customer's role.
end;
$staff$;

revoke all on function public.matmove_staff_remove(uuid,uuid,timestamptz,text),public.matmove_staff_restore(uuid,uuid,timestamptz,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.matmove_staff_remove(uuid,uuid,timestamptz,text),public.matmove_staff_restore(uuid,uuid,timestamptz,text,jsonb,text) to service_role;
revoke all on function public.matmove_staff_removal_guard(),public.matmove_staff_legacy_grant_guard() from public,anon,authenticated;
revoke all on function public.matmove_staff_check_membership_history(regclass,uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.matmove_is_staff(),public.matmove_admin_can(text) from public,anon;
grant execute on function public.matmove_is_staff(),public.matmove_admin_can(text) to authenticated,service_role;

NOTIFY pgrst, 'reload schema';
commit;

-- Both values must be true. This installs the feature; it removes nobody.
select to_regprocedure('public.matmove_staff_remove(uuid,uuid,timestamp with time zone,text)') is not null as staff_removal_ready,
       to_regprocedure('public.matmove_staff_restore(uuid,uuid,timestamp with time zone,text,jsonb,text)') is not null as staff_restore_ready;
