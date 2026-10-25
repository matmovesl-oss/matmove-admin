
-- ADMIN project: docs/ADMIN_REPORTS_SETUP.sql
-- Run this COMPLETE SQL in the ONE shared Supabase project's SQL Editor.
-- This migration only installs read-only reporting functions. Keep existing RLS.
begin;
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
 from unnest(array['customers','dispatch','pricing','kyc','wallets','withdrawals','payments','merchant_payments','staff','logs','staff_audit','spin_players','arcade_players','spin_overview','arcade_overview','spin_entries','spin_winnings','arcade_entries','arcade_winnings','game_settings','game_recovery']::text[]) k
 cross join lateral public.matmove_report_definition(k) d
 where public.matmove_report_allowed(p_actor,d.permission);
 return result;
end;
$catalog$;

create or replace function public.matmove_admin_report_page(
 p_actor uuid,p_report text,p_after text default null,p_cutoff timestamptz default null,p_limit integer default 250)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $page$
declare d record;cutoff timestamptz:=coalesce(p_cutoff,clock_timestamp());
 rows jsonb;next_key text;has_more boolean;filter_sql text:='true';has_time boolean;total bigint;states jsonb;
begin
 select * into d from public.matmove_report_definition(p_report);
 if not found then raise exception 'INVALID: Unknown report.';end if;
 if not public.matmove_report_allowed(p_actor,d.permission) then raise exception 'FORBIDDEN: Report assignment required.';end if;
 if p_limit is null or p_limit not between 1 and 250 or length(coalesce(p_after,''))>200
 or cutoff>clock_timestamp()+interval '1 minute' then raise exception 'INVALID: Invalid report page.';end if;
 if to_regclass(format('public.%I',d.table_name)) is null then raise exception 'UNAVAILABLE: Report source is not installed.';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=d.table_name and column_name=d.key_name)
 then raise exception 'UNAVAILABLE: Report key is missing. Check the installed schema.';end if;
 select exists(select 1 from information_schema.columns where table_schema='public' and table_name=d.table_name and column_name='created_at') into has_time;
 if has_time then filter_sql:=filter_sql||' and (j->>''created_at'' is null or (j->>''created_at'')::timestamptz <= $2)';end if;
 if d.row_filter='customer' then filter_sql:=filter_sql||' and j->>''role'' in (''rider'',''driver'',''merchant'')';
 elsif d.row_filter in ('entry','win') then filter_sql:=filter_sql||format(' and j->>''kind''=%L',d.row_filter);end if;
 -- Identifiers and projection fields come ONLY from the fixed definition above.
 execute format($query$
 with source as (select to_jsonb(t) j from public.%I t),
 page as (select j,j->>%L as key from source where %s
 and ($1 is null or (j->>%L collate "C") > ($1 collate "C"))
 order by (j->>%L) collate "C" limit $3+1),
 visible as (select * from page order by key collate "C" limit $3)
 select coalesce((select jsonb_agg((select jsonb_object_agg(c,case when jsonb_typeof(j->c)='number' then to_jsonb(j->>c) else j->c end) from unnest($4::text[]) c) order by key collate "C") from visible),'[]'::jsonb),
 (select count(*)>$3 from page),(select key from visible order by key collate "C" desc limit 1)
 $query$,d.table_name,d.key_name,filter_sql,d.key_name,d.key_name)
 into rows,has_more,next_key using p_after,cutoff,p_limit,d.columns;
 return jsonb_build_object('report',p_report,'columns',d.columns,'rows',rows,'cutoff',cutoff,
 'nextAfter',case when has_more then next_key else null end,'complete',not has_more,
 'consistency','Creation cutoff; statuses and mutable fields reflect their state when each page is read.');
end;
$page$;

revoke all on function public.matmove_report_definition(text),public.matmove_report_allowed(uuid,text),
 public.matmove_admin_report_catalog(uuid),public.matmove_admin_report_page(uuid,text,text,timestamptz,integer)
 from public,anon,authenticated;
grant execute on function public.matmove_admin_report_catalog(uuid),
 public.matmove_admin_report_page(uuid,text,text,timestamptz,integer) to service_role;
commit;
