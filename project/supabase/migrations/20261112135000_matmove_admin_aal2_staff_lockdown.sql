-- Require a verified TOTP assurance level for staff-only database capabilities.
-- Keep matmove_admin_me() available at AAL1 so the UI can identify the signed-in
-- staff account and route it into the enrollment/challenge screen.
-- Apply only after the Admin MFA UI has been deployed and all active staff have
-- enrolled and verified a factor. Otherwise existing staff would be locked out.
begin;

create or replace function public.matmove_admin_require_aal2()
returns void
language plpgsql
stable
security invoker
set search_path to 'pg_catalog'
as $function$
begin
  if auth.uid() is null then
    raise exception 'AUTH: Sign in to Admin.';
  end if;
  if coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'MFA_REQUIRED: Verify your Admin authenticator code before continuing.';
  end if;
end;
$function$;

revoke all on function public.matmove_admin_require_aal2()
  from public, anon, authenticated, service_role;
grant execute on function public.matmove_admin_require_aal2()
  to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    and exists (
      select 1
      from public.matmove_staff_access a
      where a.id = auth.uid()
        and a.is_active
        and a.removed_at is null
        and (
          a.is_owner
          or exists(select 1 from public.admins legacy where legacy.id = a.id)
        )
    );
$function$;

create or replace function public.matmove_admin_can(p_section text)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    and exists (
      select 1
      from public.matmove_staff_access a
      where a.id = auth.uid()
        and a.is_active
        and a.removed_at is null
        and (
          a.is_owner
          or a.permissions ? p_section
          or (
            p_section = 'games'
            and exists (
              select 1
              from jsonb_array_elements_text(a.permissions) p
              where p like 'games.%'
            )
          )
        )
    );
$function$;

create or replace function public.matmove_notification_sender()
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  actor uuid := auth.uid();
begin
  perform public.matmove_admin_require_aal2();
  if actor is null then
    raise exception 'AUTH: Sign in to Admin.';
  end if;

  perform 1
  from public.matmove_staff_access a
  where a.id = actor
    and a.is_active
    and coalesce(to_jsonb(a)->>'removed_at', '') = ''
    and (a.is_owner or a.permissions ? 'notifications')
  for share;

  if not found then
    raise exception 'ACCESS: Notifications assignment required.';
  end if;
  return actor;
end;
$function$;

create or replace function public.matmove_admin_account_deletion_requests(
  p_action text default 'list',
  p_user_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  actor uuid := auth.uid();
  r public.matmove_account_deletion_requests%rowtype;
  rows jsonb;
begin
  perform public.matmove_admin_require_aal2();
  if actor is null or not exists (
    select 1 from public.matmove_staff_access
    where id = actor and is_owner and is_active and removed_at is null
  ) then
    raise exception 'FORBIDDEN: Only the verified owner can review account deletion requests.';
  end if;

  if p_action = 'list' then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.requested_at desc), '[]'::jsonb)
    into rows
    from (
      select r.id, r.user_id, r.reason, r.status, r.requested_at,
             r.reviewed_at, r.reviewed_by, r.review_note,
             p.full_name, p.email, p.phone, p.role
      from public.matmove_account_deletion_requests r
      join public.profiles p on p.id = r.user_id
      order by r.requested_at desc
      limit 250
    ) q;
    return jsonb_build_object('rows', rows);
  end if;

  if p_action not in ('under_review','reject')
     or p_user_id is null
     or p_note is null
     or length(btrim(p_note)) < 3
     or length(p_note) > 500 then
    raise exception 'INVALID: Enter a valid review action and note.';
  end if;

  select * into r
  from public.matmove_account_deletion_requests
  where user_id = p_user_id and status in ('requested','under_review')
  order by requested_at desc
  limit 1
  for update;
  if not found then
    raise exception 'NOT_FOUND: Open account deletion request not found.';
  end if;

  update public.matmove_account_deletion_requests
  set status = case when p_action = 'reject' then 'rejected' else 'under_review' end,
      reviewed_at = clock_timestamp(),
      reviewed_by = actor,
      review_note = btrim(p_note)
  where id = r.id
  returning * into r;

  if p_action = 'reject' then
    update public.profiles
    set account_deletion_requested_at = null, updated_at = clock_timestamp()
    where id = p_user_id;
  end if;

  return jsonb_build_object('success', true, 'userId', p_user_id, 'status', r.status, 'requestId', r.id);
end;
$function$;

create or replace function public.matmove_admin_audit_feed(p_limit integer default 250)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  actor uuid := auth.uid();
  result_rows jsonb;
  max_rows integer := least(greatest(coalesce(p_limit,250),1),1000);
  permitted boolean;
begin
  perform public.matmove_admin_require_aal2();
  if actor is null then
    raise exception 'AUTH: Sign in to view Admin audit records.';
  end if;

  select exists(
    select 1 from public.matmove_staff_access s
    where s.id = actor and s.is_active = true and s.removed_at is null
      and (s.is_owner = true or s.permissions ? 'logs')
  ) into permitted;

  if not permitted then
    raise exception 'FORBIDDEN: Audit access has not been assigned.';
  end if;

  with events as (
    select a.id::text event_id, a.admin_id actor_id, a.action,
      coalesce(nullif(a.resource_type,''),'admin_action') table_name,
      jsonb_strip_nulls(coalesce(a.metadata,'{}'::jsonb)||jsonb_build_object(
        'resourceId',a.resource_id,'targetProfileId',a.target_profile_id,
        'reason',a.reason,'before',a.before_data,'after',a.after_data
      )) metadata, a.created_at
    from public.admin_audit_logs a
    union all
    select l.id::text, l.admin_id, l.action, 'legacy_admin_actions',
      jsonb_build_object('details',l.details,'targetUserId',l.target_user_id), l.created_at
    from public.audit_logs l
    union all
    select s.id::text, s.actor_id, s.action, 'matmove_staff_access',
      jsonb_build_object('targetId',s.target_id,'details',s.details), s.created_at
    from public.matmove_staff_audit s
    union all
    select k.id::text, k.reviewer_id, k.decision, 'kyc_submissions',
      jsonb_build_object('profileId',k.profile_id,'submissionId',k.submission_id,'reason',k.reason,'reviewVersion',k.review_version), k.created_at
    from public.matmove_kyc_review_events k
    union all
    select d.request_id::text, d.actor_id, d.action, 'bookings',
      jsonb_build_object('bookingId',d.booking_id,'driverId',d.driver_id,'expectedVersion',d.expected_version,'newVersion',d.new_version,'note',d.note), d.created_at
    from public.matmove_dispatch_audit d
    union all
    select c.id::text, c.actor_id, c.action, 'concierge_services',
      jsonb_build_object('serviceId',c.service_id,'before',c.before_data,'after',c.after_data), c.created_at
    from public.concierge_service_audit c
    union all
    select w.id::text, w.admin_id,
      case when w.is_frozen then 'wallet_frozen' else 'wallet_unfrozen' end,
      'wallets',
      jsonb_build_object('walletId',w.wallet_id,'wasFrozen',w.was_frozen,'isFrozen',w.is_frozen,'reason',w.reason),
      w.created_at
    from public.matmove_wallet_freeze_audit w
    union all
    select s.id::text, s.admin_id, s.action, 'matmove_spin', s.details, s.created_at
    from public.matmove_spin_admin_log s
    union all
    select r.id::text, r.actor_id,
      coalesce(r.payload->>'action','referral_admin_change'),
      'matmove_referral_campaign',
      jsonb_build_object('payload',r.payload,'receipt',r.receipt), r.created_at
    from public.matmove_referral_admin_events r
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.event_id,
    'actor_name',coalesce(nullif(p.full_name,''),nullif(p.email,''),e.actor_id::text,'Admin'),
    'action',e.action,
    'table_name',e.table_name,
    'metadata',e.metadata,
    'created_at',e.created_at
  ) order by e.created_at desc),'[]'::jsonb)
  into result_rows
  from (select * from events order by created_at desc limit max_rows) e
  left join public.profiles p on p.id=e.actor_id;

  return jsonb_build_object('actor',actor,'rows',result_rows,'limit',max_rows);
end;
$function$;

create or replace function public.matmove_admin_bulk_update_role(
  p_user_ids uuid[],
  p_new_role text
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  perform public.matmove_admin_require_aal2();
  if not exists (
    select 1 from public.matmove_staff_access
    where id = (select auth.uid()) and is_active and is_owner and removed_at is null
  ) then
    raise exception 'FORBIDDEN: Only the verified owner can change roles.';
  end if;
  if p_new_role not in ('rider','driver','merchant','staff')
     or cardinality(p_user_ids) not between 1 and 100 then
    raise exception 'INVALID: Unsupported role or selection.';
  end if;
  update public.profiles set role = p_new_role where id = any(p_user_ids);
  return found;
end;
$function$;

create or replace function public.matmove_admin_restore_customer_role(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_role text;
  v_current_role text;
  v_payroll boolean;
begin
  perform public.matmove_admin_require_aal2();
  if auth.uid() is null or not exists (
    select 1 from public.matmove_staff_access
    where id = auth.uid() and is_owner and is_active and removed_at is null
  ) then
    raise exception 'FORBIDDEN: Only the verified owner can restore a Customer role.';
  end if;

  if exists(select 1 from public.matmove_staff_access where id = p_user_id)
     or exists(select 1 from public.admins where id = p_user_id) then
    raise exception 'CONFLICT: This account has an Admin access record. Use Staff Governance to manage Admin access.';
  end if;

  select role::text, is_payroll_staff into v_current_role, v_payroll
  from public.profiles where id = p_user_id for update;
  if not found then raise exception 'NOT_FOUND: Customer profile not found.'; end if;

  v_role := public.matmove_staff_resolve_customer_role(p_user_id);
  if v_role not in ('rider','driver','merchant') then
    raise exception 'CONFLICT: Original Customer role cannot be verified. Manual support review is required.';
  end if;
  if not coalesce(v_payroll,false) and v_current_role <> 'staff' then
    raise exception 'CONFLICT: This account is not classified as Payroll staff.';
  end if;

  update public.profiles
  set role = v_role, customer_onboarding_role = v_role,
      is_payroll_staff = false, updated_at = clock_timestamp()
  where id = p_user_id;

  insert into public.matmove_staff_audit(actor_id,target_id,action,details)
  values(auth.uid(),p_user_id,'RESTORE_STAFF',
    jsonb_build_object('restoredCustomerRole',v_role,'reason','Owner restored original Customer access'));

  return jsonb_build_object('success',true,'userId',p_user_id,'role',v_role,'isPayrollStaff',false);
end;
$function$;

create or replace function public.matmove_admin_set_staff_role(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_role text;
  v_original text;
begin
  perform public.matmove_admin_require_aal2();
  if auth.uid() is null or not exists (
    select 1 from public.matmove_staff_access
    where id = auth.uid() and is_owner and is_active and removed_at is null
  ) then
    raise exception 'FORBIDDEN: Only the verified owner can change payroll classification.';
  end if;

  select role::text into v_role
  from public.profiles where id = p_user_id for update;
  if not found then return false; end if;

  v_original := public.matmove_staff_resolve_customer_role(p_user_id);
  if v_original not in ('rider','driver','merchant') then
    raise exception 'CONFLICT: Original Customer role could not be verified.';
  end if;
  if v_role not in ('rider','driver','merchant','staff') then
    raise exception 'CONFLICT: Only a verified Customer account can be added to payroll.';
  end if;

  update public.profiles
  set role = case when role::text = 'staff' then v_original else role end,
      customer_onboarding_role = coalesce(customer_onboarding_role,v_original),
      is_payroll_staff = true, updated_at = clock_timestamp()
  where id = p_user_id;
  return true;
end;
$function$;

notify pgrst, 'reload schema';
commit;
