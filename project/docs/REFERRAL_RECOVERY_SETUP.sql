
-- ADMIN: run the COMPLETE file in the shared Supabase project after REFERRAL_ADMIN_SETUP.sql.
-- Attaches an existing verified receipt. Never creates, retries or reverses a provider transfer.
begin;
do $check$ begin
 if to_regclass('public.matmove_referral_admin_events') is null or to_regprocedure('public.matmove_referral_record(uuid,jsonb)') is null then raise exception 'Run Referral Admin and Referral Payments setup first.';end if;
end $check$;
create or replace function public.matmove_referral_recovery_match(p_actor uuid,p_reward uuid,p_receipt jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $ref$
declare r public.matmove_referral_rewards%rowtype;matches boolean;provider text;
begin
 if not exists(select 1 from public.matmove_staff_access where id=p_actor and is_active and is_owner and removed_at is null) then raise exception 'FORBIDDEN: Only the active owner may recover referral receipts.';end if;
 select * into r from public.matmove_referral_rewards where id=p_reward;
 if not found or r.reserved_at is null or r.claimed_at is null then raise exception 'INVALID: Select a reward with an existing authorized transfer claim.';end if;
 provider:=p_receipt->>'id';
 matches:=coalesce(provider ~ '^trn-[A-Za-z0-9_-]+$',false) and (r.provider_id is null or r.provider_id=provider)
 and jsonb_typeof(p_receipt#>'{amount,value}')='number' and p_receipt#>>'{amount,value}'='100' and p_receipt#>>'{amount,currency}'='SLE'
 and p_receipt#>>'{sourceFinancialAccount,id}'=r.source_account and p_receipt#>>'{destinationFinancialAccount,id}'=r.destination_account
 and p_receipt#>>'{metadata,matmoveReferralRewardId}'=r.id::text and p_receipt#>>'{metadata,matmoveReferralNewUserId}'=r.new_user_id::text
 and p_receipt#>>'{metadata,matmoveReferralKind}'=r.kind and p_receipt#>>'{metadata,matmoveReferralRequestKey}'=r.request_key::text
 and p_receipt->>'status' in ('pending','processing','completed','failed') and r.amount_minor=100 and r.currency='SLE';
 if not coalesce(matches,false) then raise exception 'INVALID: The receipt does not match this exact SLE 1 reward.';end if;
 if exists(select 1 from public.matmove_referral_rewards where provider_id=provider and id<>r.id) then raise exception 'CONFLICT: This transfer receipt already belongs to another reward.';end if;
 if r.state in ('completed','failed') and p_receipt->>'status'<>r.state then raise exception 'CONFLICT: A terminal reward cannot be replaced by a different provider state.';end if;
 return jsonb_build_object('actor',p_actor,'rewardId',r.id,'providerId',provider,'amountMinor','100','currency','SLE','sourceAccount',r.source_account,'destinationAccount',r.destination_account,'kind',r.kind,'rewardState',r.state,'providerState',p_receipt->>'status','updatedAt',r.updated_at);
end $ref$;
create or replace function public.matmove_referral_admin_recovery_preview(p_actor uuid,p_reward uuid,p_receipt jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $ref$
begin
 perform pg_advisory_xact_lock(87192814);
 return public.matmove_referral_recovery_match(p_actor,p_reward,p_receipt);
end $ref$;
create or replace function public.matmove_referral_admin_recover(p_actor uuid,p_request uuid,p_reward uuid,p_provider text,p_expected timestamptz,p_reason text,p_receipt jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $ref$
declare payload jsonb;event public.matmove_referral_admin_events%rowtype;r public.matmove_referral_rewards%rowtype;result jsonb;receipt jsonb;
begin
 perform pg_advisory_xact_lock(87192814);
 if not exists(select 1 from public.matmove_staff_access where id=p_actor and is_active and is_owner and removed_at is null) then raise exception 'FORBIDDEN: Only the active owner may recover referral receipts.';end if;
 if p_request is null or p_reward is null or p_expected is null or p_provider is null or p_provider !~ '^trn-[A-Za-z0-9_-]+$' or p_reason is null or length(btrim(p_reason)) not between 3 and 500 then raise exception 'INVALID: Review the reward, original receipt and reason.';end if;
 payload:=jsonb_build_object('action','RECOVER_REFERRAL_RECEIPT','reward',p_reward,'provider',p_provider,'expected',extract(epoch from p_expected)::text,'reason',btrim(p_reason));
 select * into event from public.matmove_referral_admin_events where id=p_request;
 if found then if event.actor_id<>p_actor or event.payload<>payload then raise exception 'CONFLICT: This receipt attachment request changed.';end if;return event.receipt;end if;
 -- Lookup mode resolves a lost Admin response before another provider GET. It performs no mutation.
 if p_receipt is null then return jsonb_build_object('actor',p_actor,'requestId',p_request,'found',false);end if;
 select * into r from public.matmove_referral_rewards where id=p_reward for update;
 if not found or r.updated_at is distinct from p_expected then raise exception 'CONFLICT: The reward changed. Review its latest receipt before attaching.';end if;
 if p_receipt->>'id' is distinct from p_provider then raise exception 'INVALID: The original provider receipt changed.';end if;
 perform public.matmove_referral_recovery_match(p_actor,p_reward,p_receipt);
 result:=public.matmove_referral_record(p_reward,p_receipt);
 if result->>'id' is distinct from p_reward::text or result->>'provider_id' is distinct from p_provider or result->>'state' not in ('processing','completed','failed') then raise exception 'CONFLICT: The receipt attachment was not confirmed.';end if;
 receipt:=jsonb_build_object('actor',p_actor,'requestId',p_request,'rewardId',p_reward,'providerId',p_provider,'recorded',true,'state',result->>'state');
 insert into public.matmove_referral_admin_events(id,actor_id,payload,receipt) values(p_request,p_actor,payload,receipt);
 return receipt;
end $ref$;
revoke all on function public.matmove_referral_recovery_match(uuid,uuid,jsonb),public.matmove_referral_admin_recovery_preview(uuid,uuid,jsonb),public.matmove_referral_admin_recover(uuid,uuid,uuid,text,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.matmove_referral_admin_recovery_preview(uuid,uuid,jsonb),public.matmove_referral_admin_recover(uuid,uuid,uuid,text,timestamptz,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
