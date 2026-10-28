
-- ADMIN: run this COMPLETE file in the shared Supabase SQL Editor.
-- Requires Customer REFERRALS_SETUP.sql and REFERRAL_PAYMENTS_SETUP.sql.
-- Installs reporting and owner controls. It does NOT enable the campaign.
begin;
do $check$ begin
 if to_regprocedure('public.matmove_referral_claim(uuid)') is null or to_regprocedure('public.matmove_report_allowed(uuid,text)') is null then raise exception 'Run Referral Payments and Admin Reports setup first.';end if;
end $check$;
alter table public.matmove_referral_campaign add column if not exists config_revision bigint not null default 0;
create table if not exists public.matmove_referral_admin_events(
 id uuid primary key,actor_id uuid not null references auth.users(id),payload jsonb not null,receipt jsonb not null,created_at timestamptz not null default now()
);
alter table public.matmove_referral_admin_events enable row level security;
revoke all on public.matmove_referral_admin_events from public,anon,authenticated;
create or replace function public.matmove_referral_admin_overview(p_actor uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $ref$
declare c public.matmove_referral_campaign%rowtype;totals jsonb;
begin
 if not public.matmove_report_allowed(p_actor,'financials') then raise exception 'FORBIDDEN: Financial assignment required.';end if;
 select * into c from public.matmove_referral_campaign where singleton;
 select jsonb_build_object('referrals',(select count(*)::text from public.matmove_referrals),'pendingMinor',coalesce(sum(amount_minor) filter(where state in ('pending','processing')),0)::text,
 'creditedMinor',coalesce(sum(amount_minor) filter(where state='completed' and provider_id is not null),0)::text,
 'reviewMinor',coalesce(sum(amount_minor) filter(where state in ('review_required','failed')),0)::text,
 'budgetUsedMinor',coalesce(sum(amount_minor) filter(where reserved_at is not null),0)::text,
 'reservedMinor',coalesce(sum(amount_minor) filter(where reserved_at is not null and state<>'completed'),0)::text) into totals from public.matmove_referral_rewards;
 return jsonb_build_object('actor',p_actor,'campaign',jsonb_build_object('revision',c.config_revision::text,'accepting',c.accepting_referrals,'payments',c.payments_enabled,'budgetMinor',c.budget_minor::text,'source',c.treasury_account),'totals',totals);
end $ref$;
create or replace function public.matmove_referral_admin_page(p_actor uuid,p_state text,p_after uuid,p_cutoff timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $ref$
declare rows jsonb;next_id text;
begin
 if not public.matmove_report_allowed(p_actor,'financials') then raise exception 'FORBIDDEN: Financial assignment required.';end if;
 if p_state is null or p_state not in ('all','pending','processing','completed','review_required','failed') or p_cutoff is null or p_cutoff>clock_timestamp()+interval '5 seconds' then raise exception 'INVALID: Invalid referral report.';end if;
 with selected as(select r.*,a.referrer_id,a.code from public.matmove_referral_rewards r join public.matmove_referrals a on a.new_user_id=r.new_user_id where r.created_at<=p_cutoff and (p_state='all' or r.state=p_state) and (p_after is null or r.id>p_after) order by r.id limit 51), numbered as(select *,row_number() over(order by id) n from selected)
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'new_user_email',n.email,'inviter_email',i.email,'beneficiary_email',b.email,'code',s.code,'kind',s.kind,'amount_minor',s.amount_minor::text,'currency',s.currency,'state',s.state,'provider_id',s.provider_id,'created_at',s.created_at,'updated_at',s.updated_at) order by s.id) filter(where s.n<=50),'[]'),max(s.id::text) filter(where s.n=50 and (select count(*) from selected)>50)
 into rows,next_id from numbered s left join public.profiles n on n.id=s.new_user_id left join public.profiles i on i.id=s.referrer_id left join public.profiles b on b.id=s.beneficiary_id;
 return jsonb_build_object('actor',p_actor,'rows',rows,'nextAfter',next_id);
end $ref$;
create or replace function public.matmove_referral_admin_save(p_actor uuid,p_request uuid,p_expected bigint,p_accepting boolean,p_payments boolean,p_budget bigint,p_source text,p_ready boolean,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $ref$
declare c public.matmove_referral_campaign%rowtype;event public.matmove_referral_admin_events%rowtype;payload jsonb;receipt jsonb;source text;used bigint;
begin
 perform pg_advisory_xact_lock(87192814);
 if not exists(select 1 from public.matmove_staff_access where id=p_actor and is_active and is_owner and removed_at is null) then raise exception 'FORBIDDEN: Only the active owner may change the referral campaign.';end if;
 if p_request is null or p_expected is null or p_expected<0 or p_accepting is null or p_payments is null or p_budget is null or p_budget<0 or p_budget>9000000000000000 or length(btrim(p_reason)) not between 3 and 500 or p_reason is null or p_payments and not p_accepting then raise exception 'INVALID: Review the budget, switches and reason.';end if;
 payload:=jsonb_build_object('expected',p_expected,'accepting',p_accepting,'payments',p_payments,'budget',p_budget,'source',p_source,'reason',btrim(p_reason));
 select * into event from public.matmove_referral_admin_events where id=p_request;
 if found then if event.actor_id<>p_actor or event.payload<>payload then raise exception 'CONFLICT: This saved request changed.';end if;return event.receipt;end if;
 select * into c from public.matmove_referral_campaign where singleton for update;
 if c.config_revision<>p_expected then raise exception 'CONFLICT: Campaign settings changed. Reload before saving.';end if;
 source:=coalesce(p_source,c.treasury_account);
 if source is distinct from c.treasury_account and exists(select 1 from public.matmove_referral_rewards where reserved_at is not null) then raise exception 'CONFLICT: Keep the treasury used by existing reward reservations.';end if;
 if p_accepting or p_payments then
  if p_ready is distinct from true then raise exception 'INVALID: Campaign activation is not enabled on the server yet.';end if;
  if source is null or source !~ '^fac-[A-Za-z0-9_-]+$' or exists(select 1 from public.wallets where monime_account_id=source or metadata->>'monime_account_id'=source) then raise exception 'INVALID: A separate business referral account is required.';end if;
  select coalesce(sum(amount_minor),0) into used from public.matmove_referral_rewards where reserved_at is not null;
  if p_budget<used+200 then raise exception 'INVALID: Budget must cover reserved rewards and at least one new referral pair.';end if;
 end if;
 update public.matmove_referral_campaign set config_revision=config_revision+1,accepting_referrals=p_accepting,payments_enabled=p_payments,budget_minor=p_budget,treasury_account=source,updated_at=clock_timestamp() where singleton returning * into c;
 receipt:=jsonb_build_object('actor',p_actor,'requestId',p_request,'saved',true,'revision',c.config_revision::text);
 insert into public.matmove_referral_admin_events(id,actor_id,payload,receipt) values(p_request,p_actor,payload,receipt);
 return receipt;
end $ref$;
revoke all on function public.matmove_referral_admin_overview(uuid),public.matmove_referral_admin_page(uuid,text,uuid,timestamptz),public.matmove_referral_admin_save(uuid,uuid,bigint,boolean,boolean,bigint,text,boolean,text) from public,anon,authenticated;
grant execute on function public.matmove_referral_admin_overview(uuid),public.matmove_referral_admin_page(uuid,text,uuid,timestamptz),public.matmove_referral_admin_save(uuid,uuid,bigint,boolean,boolean,bigint,text,boolean,text) to service_role;
notify pgrst,'reload schema';
commit;
