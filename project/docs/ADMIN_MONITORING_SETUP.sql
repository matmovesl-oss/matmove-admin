
-- ADMIN project: docs/ADMIN_MONITORING_SETUP.sql
-- Prerequisite: complete ADMIN_REPORTS_SETUP.sql (step 41).
-- Run this COMPLETE SQL in the ONE shared Supabase project's SQL Editor.
-- Read-only reporting and monitoring. Existing RLS remains enabled.
-- Includes current payout and ride payment records alongside legacy requests.
begin;
do $prerequisite$
begin
 if to_regprocedure('public.matmove_admin_report_page(uuid,text,text,timestamptz,integer)') is null then
  raise exception 'Run the complete ADMIN_REPORTS_SETUP.sql from step 41 first.';
 end if;
end;
$prerequisite$;
create or replace function public.matmove_report_definition(p_report text)
returns table(report text,title text,permission text,table_name text,key_name text,columns text[],row_filter text)
language sql immutable set search_path=pg_catalog,public as $definition$
 select * from (values
('customers','Customer accounts','customers','profiles','id',array['id','email','full_name','role','phone_number','kyc_status','created_at']::text[],'customer'),
('dispatch','Ride and delivery requests','dispatch','bookings','id',array['id','rider_id','driver_id','service_type','vehicle_type','pickup_location','destination_location','fare_amount','status','scheduled_time','created_at','updated_at']::text[],''),
('pricing','Vehicle pricing','pricing','pricing_settings','vehicle_type',array['vehicle_type','min_fare','per_km_rate']::text[],''),
('kyc','KYC submission history','kyc','kyc_submissions','id',array['id','profile_id','target_role','status','submitted_at','reviewed_at','created_at']::text[],''),
('wallets','Wallet records (cached balances)','financials','wallets','id',array['id','user_id','currency','balance','reserved_balance','is_frozen','monime_account_id','created_at']::text[],''),
('withdrawals','Withdrawal requests','payouts','withdrawal_requests','id',array['id','user_id','amount','currency','status','provider','provider_transaction_id','created_at','processed_at']::text[],''),
('payments','Application payment records','transactions','payment_transactions','id',array['id','user_id','wallet_id','type','amount','currency','status','provider_transaction_id','created_at']::text[],''),
('ride_payments','Ride payment states','transactions','ride_payments','booking_id',array['booking_id','payer_id','driver_id','state','fare_minor','driver_minor','fee_minor','created_at','updated_at']::text[],''),
('payouts','Current payout requests','payouts','matmove_withdrawals','id',array['id','user_id','wallet_id','amount_minor','monime_fee_minor','platform_fee_minor','total_minor','actual_monime_fee_minor','provider','state','created_at','updated_at']::text[],''),
('merchant_payments','Merchant checkouts','transactions','matmove_merchant_payments','id',array['id','rider_id','merchant_id','product_minor','delivery_minor','fee_minor','total_minor','state','delivery_state','created_at','updated_at']::text[],''),
('staff','Staff assignments including removed staff','staff','matmove_staff_access','id',array['id','email','full_name','department','is_owner','is_active','invite_state','removed_at','created_at','updated_at']::text[],''),
('logs','Audit log history','logs','audit_logs','id',array['id','admin_id','target_user_id','action','created_at']::text[],''),
('staff_audit','Staff access audit history','logs','matmove_staff_audit','id',array['id','actor_id','target_id','action','created_at']::text[],''),
('spin_players','Wheel player rounds','games.players','matmove_spin_rounds','id',array['id','user_id','state','created_at','updated_at']::text[],''),
('arcade_players','Dice, fruit and number player rounds','games.players','matmove_arcade_rounds','id',array['id','user_id','game','state','created_at','updated_at']::text[],''),
('spin_overview','Wheel round states','games.overview','matmove_spin_rounds','id',array['id','user_id','state','created_at','updated_at']::text[],''),
('arcade_overview','Dice, fruit and number round states','games.overview','matmove_arcade_rounds','id',array['id','user_id','game','state','expires_at','created_at','updated_at']::text[],''),
('spin_entries','Wheel entry transfers','games.entries','matmove_spin_legs','id',array['id','round_id','amount_minor','provider_id','status','created_at','updated_at']::text[],'entry'),
('spin_winnings','Wheel prize transfers','games.winnings','matmove_spin_legs','id',array['id','round_id','spin_index','amount_minor','provider_id','status','created_at','updated_at']::text[],'win'),
('arcade_entries','Dice, fruit and number entry transfers','games.entries','matmove_arcade_legs','id',array['id','round_id','amount_minor','provider_id','status','created_at','updated_at']::text[],'entry'),
('arcade_winnings','Dice, fruit and number prize transfers','games.winnings','matmove_arcade_legs','id',array['id','round_id','attempt_index','amount_minor','provider_id','status','created_at','updated_at']::text[],'win'),
('game_settings','Published game configuration versions','games.settings','matmove_arcade_configs','id',array['id','created_by','created_at']::text[],''),
('game_recovery','Game recovery audit history','games.recovery','matmove_arcade_admin_events','id',array['id','admin_id','action','created_at']::text[],'')
 ) as definitions(report,title,permission,table_name,key_name,columns,row_filter)
 where report=p_report;
$definition$;

create or replace function public.matmove_report_allowed(p_actor uuid,p_permission text)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $allowed$
 select exists(select 1 from public.matmove_staff_access a
 where a.id=p_actor and a.is_active=true and a.removed_at is null
 and (a.is_owner=true or a.permissions ? p_permission
 or (p_permission like 'games.%' and a.permissions ? 'games')));
$allowed$;

create or replace function public.matmove_admin_report_catalog(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $catalog$
declare result jsonb;
begin
 if not exists(select 1 from public.matmove_staff_access where id=p_actor and is_active=true and removed_at is null)
 then raise exception 'FORBIDDEN: Active Admin access required.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.report,'title',d.title,'permission',d.permission,
  'columns',d.columns,'available',to_regclass(format('public.%I',d.table_name)) is not null,
  'note',case when d.report='wallets' then 'Database cached balances; not a live Monime balance.'
    when d.row_filter in ('entry','win') then 'Amounts are SLE minor units (100 = SLE 1). Only completed transfers are confirmed receipts.'
    else 'Operational database history. Missing optional fields are blank. Records reflect their state when read.' end)
  order by d.title),'[]'::jsonb) into result
 from unnest(array['customers','dispatch','pricing','kyc','wallets','withdrawals','payments','ride_payments','payouts','merchant_payments','staff','logs','staff_audit','spin_players','arcade_players','spin_overview','arcade_overview','spin_entries','spin_winnings','arcade_entries','arcade_winnings','game_settings','game_recovery']::text[]) k
 cross join lateral public.matmove_report_definition(k) d
 where public.matmove_report_allowed(p_actor,d.permission);
 return result;
end;
$catalog$;

create or replace function public.matmove_admin_report_overview(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $overview$
declare catalog jsonb;item jsonb;modules jsonb:='[]'::jsonb;d record;
 where_sql text;group_field text;total text;groups jsonb;money jsonb;unverified text;
 latest jsonb:='[]'::jsonb;observed timestamptz:=clock_timestamp();
begin
 catalog:=public.matmove_admin_report_catalog(p_actor);
 for item in select value from jsonb_array_elements(catalog)
 loop
  select * into d from public.matmove_report_definition(item->>'id');
  if not public.matmove_report_allowed(p_actor,d.permission) then continue;end if;
  if not (item->>'available')::boolean then
   modules:=modules||jsonb_build_array(jsonb_build_object('id',d.report,'title',d.title,'permission',d.permission,'status','unavailable','count',null,'groups','[]'::jsonb,'completedMoney',null,'unverifiedCompleted',null,'message','Report source is not installed.'));
   continue;
  end if;
  begin
   where_sql:='true';money:=null;unverified:=null;
   if d.row_filter='customer' then where_sql:='j->>''role'' in (''rider'',''driver'',''merchant'')';
   elsif d.row_filter in ('entry','win') then where_sql:=format('j->>''kind''=%L',d.row_filter);end if;
   group_field:=case
    when d.report='customers' then 'role'
    when d.report='wallets' then 'currency'
    when d.report='staff' then 'is_active'
    when d.report in ('ride_payments','payouts','merchant_payments','spin_players','arcade_players','spin_overview','arcade_overview') then 'state'
    when d.report in ('dispatch','kyc','withdrawals','payments','spin_entries','spin_winnings','arcade_entries','arcade_winnings') then 'status'
    else null end;
   execute format($counts$
    with source as (select to_jsonb(t) j from public.%I t),filtered as (select j from source where %s),
    buckets as (select coalesce(nullif(j->>$1,''),'Not supplied') as value,count(*)::text as count from filtered group by 1)
    select (select count(*)::text from filtered),case when $1 is null then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(b) order by b.value) from buckets b),'[]'::jsonb) end
   $counts$,d.table_name,where_sql) into total,groups using group_field;
   if d.row_filter in ('entry','win') then
    -- These four game transfer tables are SLE-only and store integer cents.
    -- A pending/processing/failed leg is never included in a paid total.
    execute format($receipts$
     with source as (select to_jsonb(t) j from public.%I t),completed as
      (select j from source where %s and j->>'status'='completed'),
     checked as (select j,coalesce(nullif(btrim(j->>'provider_id'),''),'')<>''
       and case when coalesce(j->>'amount_minor','')~'^[0-9]+$' then (j->>'amount_minor')::numeric>0 else false end as verified from completed)
     select jsonb_build_object('currency','SLE','minor',coalesce(sum(case when verified then (j->>'amount_minor')::numeric else 0 end),0)::text),
       count(*) filter(where not coalesce(verified,false))::text from checked
    $receipts$,d.table_name,where_sql) into money,unverified;
   end if;
   if d.report='dispatch' then
    execute format($recent$
     select coalesce(jsonb_agg(r.row order by r.created desc nulls last,r.id desc),'[]'::jsonb) from (
      select j->>'created_at' as created,j->>'id' as id,
       jsonb_build_object('id',j->>'id','service_type',j->>'service_type','status',j->>'status',
        'fare_amount',j->>'fare_amount','created_at',j->>'created_at',
        'pickup_location',j->>'pickup_location','destination_location',j->>'destination_location') as row
      from (select to_jsonb(t) j from public.%I t) source
      order by j->>'created_at' desc nulls last,j->>'id' desc limit 5
     ) r
    $recent$,d.table_name) into latest;
   end if;
   modules:=modules||jsonb_build_array(jsonb_build_object('id',d.report,'title',d.title,'permission',d.permission,'status','ok','count',total,'groups',groups,'completedMoney',money,'unverifiedCompleted',unverified,'message',null));
  exception when others then
   modules:=modules||jsonb_build_array(jsonb_build_object('id',d.report,'title',d.title,'permission',d.permission,'status','error','count',null,'groups','[]'::jsonb,'completedMoney',null,'unverifiedCompleted',null,'message','This module could not be read. Retry monitoring and check the installed schema.'));
  end;
 end loop;
 return jsonb_build_object('actor',p_actor,'generatedAt',observed,'modules',modules,'recentBookings',latest);
end;
$overview$;
revoke all on function public.matmove_admin_report_overview(uuid) from public,anon,authenticated;
grant execute on function public.matmove_admin_report_overview(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
