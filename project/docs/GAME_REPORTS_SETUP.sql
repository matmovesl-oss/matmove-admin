
-- Run this entire file as postgres AFTER SPIN_GAME_SETUP.sql.
-- Read-only reporting; no changes to payment, prize or wheel rules.
begin;
create index if not exists matmove_spin_rounds_user_created on public.matmove_spin_rounds(user_id,created_at desc);
create index if not exists matmove_spin_legs_kind_created on public.matmove_spin_legs(kind,created_at desc,id);

create or replace function public.matmove_spin_admin_report(
 p_view text,p_page integer default 1,p_search text default '',p_status text default 'all',p_player uuid default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $report$
declare stats jsonb; rows_json jsonb; total bigint; needle text:=lower(trim(coalesce(p_search,''))); page_size integer:=100;
begin
 if not public.matmove_spin_admin_allowed() then raise exception 'FORBIDDEN: Game administrator permission required.'; end if;
 if p_view is null or p_view not in ('rounds','players','entries','winnings') or p_page is null or p_page not between 1 and 1000000 or length(needle)>100 or p_status is null then raise exception 'INVALID: Invalid report request.'; end if;
 if p_view in ('entries','winnings') and p_status not in ('all','pending','processing','completed','failed','review_required') then raise exception 'INVALID: Invalid payment filter.'; end if;
 if p_view='rounds' and p_status not in ('all','entry_pending','active','win_pending','completed','failed','review_required') then raise exception 'INVALID: Invalid round filter.'; end if;
 if p_view='players' and p_status not in ('all','paid','unpaid','eligible','paused','in_progress') then raise exception 'INVALID: Invalid player filter.'; end if;

 select jsonb_build_object(
  'paidPlayers',count(distinct r.user_id) filter(where t.kind='entry' and t.status='completed'),
  'paidEntries',count(*) filter(where t.kind='entry' and t.status='completed'),
  'entryReceivedMinor',coalesce(sum(t.amount_minor) filter(where t.kind='entry' and t.status='completed'),0),
  'winsPaidMinor',coalesce(sum(t.amount_minor) filter(where t.kind='win' and t.status='completed'),0),
  'winsOwedMinor',coalesce(sum(t.amount_minor) filter(where t.kind='win' and t.status<>'completed'),0),
  'pendingEntries',count(*) filter(where t.kind='entry' and t.status in ('pending','processing')),
  'prizesCredited',count(*) filter(where t.kind='win' and t.status='completed')
 ) into stats from public.matmove_spin_legs t join public.matmove_spin_rounds r on r.id=t.round_id;
 stats:=stats||jsonb_build_object(
  'approvedPlayers',(select count(*) from public.matmove_spin_access where approved and verified_adult),
  'openPaidRounds',(select count(*) from public.matmove_spin_rounds r where r.state not in ('completed','failed') and exists(select 1 from public.matmove_spin_legs t where t.round_id=r.id and t.kind='entry' and t.status='completed')),
  'playersWithOpenPaidRounds',(select count(distinct r.user_id) from public.matmove_spin_rounds r where r.state not in ('completed','failed') and exists(select 1 from public.matmove_spin_legs t where t.round_id=r.id and t.kind='entry' and t.status='completed')),
  'reviewRounds',(select count(*) from public.matmove_spin_rounds where state='review_required'),
  'reservedMinor',coalesce((select sum(reserve_minor) from public.matmove_spin_rounds where state not in ('completed','failed')),0)
 );

 if p_view in ('entries','winnings') then
  with filtered as materialized (
   select t.*,r.user_id,r.wallet_id,r.config_id,r.state round_state,r.lucky_digit,
    coalesce(nullif(trim(to_jsonb(p)->>'full_name'),''),nullif(trim(concat_ws(' ',to_jsonb(p)->>'first_name',to_jsonb(p)->>'last_name')), ''),'MatMove customer') customer_name,
    to_jsonb(p)->>'email' customer_email,to_jsonb(p)->>'role' customer_role
   from public.matmove_spin_legs t join public.matmove_spin_rounds r on r.id=t.round_id left join public.profiles p on p.id=r.user_id
   where t.kind=case p_view when 'entries' then 'entry' else 'win' end
    and (p_status='all' or t.status=p_status)
    and (p_player is null or r.user_id=p_player)
    and (needle='' or strpos(lower(concat_ws(' ',r.user_id::text,r.id::text,t.id::text,t.provider_id,t.source_account,t.destination_account,t.request_key,t.digit,to_jsonb(p)->>'full_name',to_jsonb(p)->>'first_name',to_jsonb(p)->>'last_name',to_jsonb(p)->>'email')),needle)>0)
  )
  select (select count(*) from filtered),coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from
    (select * from filtered order by created_at desc,id desc limit page_size offset (p_page-1)::bigint*page_size) x),'[]'::jsonb)
  into total,rows_json;
 elsif p_view='rounds' then
  with payment_totals as (
   select round_id,
    max(status) filter(where kind='entry') entry_status,
    max(provider_id) filter(where kind='entry') entry_provider_id,
    count(*) filter(where kind='win') spins_used,
    coalesce(sum(amount_minor) filter(where kind='win' and status='completed'),0) wins_paid_minor,
    coalesce(sum(amount_minor) filter(where kind='win' and status<>'completed'),0) wins_owed_minor
   from public.matmove_spin_legs group by round_id
  ),filtered as materialized (
   select r.*,t.entry_status,t.entry_provider_id,t.spins_used,t.wins_paid_minor,t.wins_owed_minor,
    coalesce(nullif(trim(to_jsonb(p)->>'full_name'),''),nullif(trim(concat_ws(' ',to_jsonb(p)->>'first_name',to_jsonb(p)->>'last_name')), ''),'MatMove customer') customer_name,
    to_jsonb(p)->>'email' customer_email,to_jsonb(p)->>'role' customer_role
   from public.matmove_spin_rounds r left join payment_totals t on t.round_id=r.id left join public.profiles p on p.id=r.user_id
   where (p_status='all' or r.state=p_status) and (p_player is null or r.user_id=p_player)
    and (needle='' or strpos(lower(concat_ws(' ',r.user_id::text,r.id::text,r.source_account,r.spin_account,t.entry_provider_id,to_jsonb(p)->>'full_name',to_jsonb(p)->>'first_name',to_jsonb(p)->>'last_name',to_jsonb(p)->>'email')),needle)>0)
  )
  select (select count(*) from filtered),coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from
    (select * from filtered order by created_at desc,id desc limit page_size offset (p_page-1)::bigint*page_size) x),'[]'::jsonb)
  into total,rows_json;
 else
  with everyone as (
   select user_id from public.matmove_spin_access union select user_id from public.matmove_spin_rounds
  ),payment_totals as (
   select r.user_id,
    count(*) filter(where t.kind='entry' and t.status='completed') paid_entries,
    coalesce(sum(t.amount_minor) filter(where t.kind='entry' and t.status='completed'),0) entry_paid_minor,
    count(*) filter(where t.kind='win') spins_used,
    coalesce(sum(t.amount_minor) filter(where t.kind='win' and t.status='completed'),0) wins_paid_minor,
    coalesce(sum(t.amount_minor) filter(where t.kind='win' and t.status<>'completed'),0) wins_owed_minor,
    min(t.updated_at) filter(where t.kind='entry' and t.status='completed') first_paid_at,
    max(t.updated_at) last_payment_at
   from public.matmove_spin_legs t join public.matmove_spin_rounds r on r.id=t.round_id group by r.user_id
  ),round_totals as (
   select r.user_id,count(*) total_rounds,count(*) filter(where r.state='completed') completed_rounds,
    count(*) filter(where r.state not in ('completed','failed') and exists(select 1 from public.matmove_spin_legs t where t.round_id=r.id and t.kind='entry' and t.status='completed')) open_paid_rounds,
    min(r.created_at) first_entry_request_at,max(r.updated_at) last_round_at
   from public.matmove_spin_rounds r group by r.user_id
  ),players as (
   select e.user_id,coalesce(a.approved,false) approved,coalesce(a.verified_adult,false) verified_adult,a.daily_limit_minor,a.updated_at access_updated_at,
    coalesce(nullif(trim(to_jsonb(p)->>'full_name'),''),nullif(trim(concat_ws(' ',to_jsonb(p)->>'first_name',to_jsonb(p)->>'last_name')), ''),'MatMove customer') customer_name,
    to_jsonb(p)->>'email' customer_email,to_jsonb(p)->>'role' customer_role,
    coalesce(t.paid_entries,0) paid_entries,coalesce(t.entry_paid_minor,0) entry_paid_minor,coalesce(t.spins_used,0) spins_used,
    coalesce(t.wins_paid_minor,0) wins_paid_minor,coalesce(t.wins_owed_minor,0) wins_owed_minor,
    coalesce(q.total_rounds,0) total_rounds,coalesce(q.completed_rounds,0) completed_rounds,coalesce(q.open_paid_rounds,0) open_paid_rounds,
    t.first_paid_at,q.first_entry_request_at,greatest(t.last_payment_at,q.last_round_at,a.updated_at) last_activity_at,
    (select source_account from public.matmove_spin_rounds r where r.user_id=e.user_id order by created_at desc,id desc limit 1) customer_account
   from everyone e left join public.profiles p on p.id=e.user_id left join public.matmove_spin_access a on a.user_id=e.user_id
   left join payment_totals t on t.user_id=e.user_id left join round_totals q on q.user_id=e.user_id
  ),filtered as materialized (
   select * from players where (p_player is null or user_id=p_player)
    and (needle='' or strpos(lower(concat_ws(' ',user_id::text,customer_name,customer_email,customer_account)),needle)>0)
    and (p_status='all' or (p_status='paid' and paid_entries>0) or (p_status='unpaid' and paid_entries=0)
     or (p_status='eligible' and approved and verified_adult) or (p_status='paused' and not approved) or (p_status='in_progress' and open_paid_rounds>0))
  )
  select (select count(*) from filtered),coalesce((select jsonb_agg(to_jsonb(x) order by x.last_activity_at desc nulls last,x.user_id) from
    (select * from filtered order by last_activity_at desc nulls last,user_id limit page_size offset (p_page-1)::bigint*page_size) x),'[]'::jsonb)
  into total,rows_json;
 end if;
 return jsonb_build_object('view',p_view,'page',p_page,'pageSize',page_size,'total',total,'rows',rows_json,'stats',stats,'asOf',clock_timestamp());
end;
$report$;
revoke all on function public.matmove_spin_admin_report(text,integer,text,text,uuid) from public,anon;
grant execute on function public.matmove_spin_admin_report(text,integer,text,text,uuid) to authenticated,service_role;
commit;
