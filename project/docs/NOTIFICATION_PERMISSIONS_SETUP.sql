
-- ADMIN: docs/NOTIFICATION_PERMISSIONS_SETUP.sql
-- Run this COMPLETE file in the ONE shared Supabase project.
-- Requires STAFF_REMOVAL_SETUP.sql and Customer NOTIFICATIONS_SETUP.sql.
-- Adds a grant option; DOES NOT grant message access to existing staff.
begin;
do $prerequisite$ begin
 if to_regprocedure('public.matmove_staff_restore(uuid,uuid,timestamptz,text,jsonb,text)') is null
 or to_regprocedure('public.matmove_notification_sender()') is null then
  raise exception 'Run STAFF_REMOVAL_SETUP.sql and NOTIFICATIONS_SETUP.sql first.';
 end if;
end $prerequisite$;
create or replace function public.matmove_staff_permissions_valid(p_permissions jsonb)
returns boolean language sql immutable set search_path=pg_catalog,public as $permissions$
 select case when jsonb_typeof(p_permissions) is distinct from 'array' then false else
 jsonb_array_length(p_permissions) between 1 and 17
 and not exists(select 1 from jsonb_array_elements(p_permissions) e where jsonb_typeof(e)<>'string' or not(e#>>'{}'=any(ARRAY['dashboard','dispatch','pricing','kyc','financials','transactions','payouts','customers','staff','logs','games.overview','games.players','games.entries','games.winnings','games.settings','games.recovery','notifications']::text[])))
 and (select count(distinct e) from jsonb_array_elements(p_permissions) e)=jsonb_array_length(p_permissions)
 end;
$permissions$;
create or replace function public.matmove_staff_save(p_actor uuid,p_id uuid,p_email text,p_name text,p_permissions jsonb,p_department text,p_active boolean,p_setup boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public as $staff$
begin
 perform pg_advisory_xact_lock(87192811);
 if not exists(select 1 from public.matmove_staff_access where id=p_actor and is_active and is_owner and removed_at is null) then raise exception 'FORBIDDEN: Only the active owner can authorize staff.';end if;
 if p_id=p_actor or exists(select 1 from public.matmove_staff_access where id=p_id and is_owner) then raise exception 'FORBIDDEN: Owner access is protected.';end if;
 if p_active is null or p_setup is null or p_name is null or length(trim(p_name))>120 or length(trim(p_name))<2 or p_email is null or not exists(select 1 from auth.users where id=p_id and lower(email)=lower(p_email)) then raise exception 'INVALID: Invalid staff identity.';end if;
 if not public.matmove_staff_permissions_valid(p_permissions) then raise exception 'INVALID: Invalid assignments.';end if;
 insert into public.matmove_staff_access(id,email,full_name,permissions,department,is_active,requires_password_setup,invite_state)
 values(p_id,lower(p_email),trim(p_name),p_permissions,p_department,p_active,p_setup,case when p_setup then 'invited' else 'authorized' end)
 on conflict(id) do update set full_name=excluded.full_name,permissions=excluded.permissions,department=excluded.department,is_active=excluded.is_active,updated_at=clock_timestamp();
 insert into public.matmove_staff_audit(actor_id,target_id,action,details) values(p_actor,p_id,'ASSIGN_STAFF',jsonb_build_object('permissions',p_permissions,'active',p_active,'department',p_department));
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
 if not public.matmove_staff_permissions_valid(p_permissions) then raise exception 'INVALID: Invalid assignments.';end if;
 perform set_config('matmove.staff_restore_id',p_id::text,true);
 update public.matmove_staff_access set removed_at=null,removed_by=null,is_active=true,is_owner=false,
  permissions=p_permissions,full_name=trim(p_name),department=coalesce(p_department,''),requires_password_setup=true,invite_state='invited',updated_at=clock_timestamp()
 where id=p_id;
 perform set_config('matmove.staff_restore_id','',true);
 insert into public.matmove_staff_audit(actor_id,target_id,action,details) values(p_actor,p_id,'RESTORE_STAFF',jsonb_build_object('permissions',p_permissions,'previousRemovalAt',target.removed_at));
 -- Does not recreate legacy Admin memberships or change a Customer's role.
end;
$staff$;

revoke all on function public.matmove_staff_permissions_valid(jsonb) from public,anon,authenticated;
revoke all on function public.matmove_staff_save(uuid,uuid,text,text,jsonb,text,boolean,boolean),public.matmove_staff_restore(uuid,uuid,timestamptz,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.matmove_staff_save(uuid,uuid,text,text,jsonb,text,boolean,boolean),public.matmove_staff_restore(uuid,uuid,timestamptz,text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
