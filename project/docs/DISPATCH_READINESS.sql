
-- Read-only checks. Paste the complete file into the shared Supabase SQL Editor.
-- Run after the complete updated ADMIN_DISPATCH_SETUP.sql has succeeded.
select
 to_regprocedure('public.matmove_dispatch_driver_status(uuid,uuid)') is not null as driver_diagnostics_ready,
 to_regprocedure('public.matmove_admin_dispatch_feed()') is not null as dispatch_feed_ready,
 to_regprocedure('public.matmove_admin_dispatch_change(uuid,bigint,text,uuid,uuid,text,uuid)') is not null as dispatch_assignment_ready,
 case when to_regprocedure('public.matmove_dispatch_driver_status(uuid,uuid)') is null then false
 else not has_function_privilege('authenticated','public.matmove_dispatch_driver_status(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.matmove_dispatch_driver_status(uuid,uuid)','EXECUTE') end as driver_diagnostics_private;

-- This second result explains the current eligibility of every Driver account.
-- Online/offline is deliberately not an assignment eligibility requirement.
-- No KYC documents, balances, secrets or payment records are returned or changed.
select p.id as driver_id,
 coalesce(nullif(p.full_name,''),nullif(p.email,''),p.id::text) as driver_label,
 p.kyc_status::text as kyc_status,
 (d.details->>'eligible')::boolean as can_assign_now,
 d.details->>'reasonCode' as reason_code,
 d.details->>'reason' as reason
from public.profiles p
cross join lateral (select public.matmove_dispatch_driver_status(p.id,null) as details) d
where p.role::text='driver'
 or exists(select 1 from public.user_roles ur where ur.profile_id=p.id and ur.role::text='driver')
order by (d.details->>'eligible')::boolean desc,driver_label,p.id;
