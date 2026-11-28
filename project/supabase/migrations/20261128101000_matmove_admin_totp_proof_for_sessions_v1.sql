begin;

create or replace function public.matmove_admin_session_valid()
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_session_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    return false;
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) method
    where method->>'method' = 'totp'
  ) then
    return false;
  end if;

  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when others then
    return false;
  end;

  if v_session_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.matmove_admin_sessions s
    join public.matmove_staff_access a on a.id = s.user_id
    where s.session_id = v_session_id
      and s.user_id = v_user_id
      and s.revoked_at is null
      and s.started_at > clock_timestamp() - interval '24 hours'
      and s.last_activity_at > clock_timestamp() - interval '15 minutes'
      and a.is_active = true
      and a.removed_at is null
  );
end;
$function$;

create or replace function public.matmove_admin_session_touch(
  p_device_label text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_row public.matmove_admin_sessions%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'AUTH: Sign in to MatMove Admin.';
  end if;
  if coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'MFA_REQUIRED: Verify your Admin authenticator before starting a session.';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) method
    where method->>'method' = 'totp'
  ) then
    raise exception 'MFA_REQUIRED: A verified TOTP authenticator is required for MatMove Admin.';
  end if;

  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when others then
    raise exception 'SESSION_INVALID: This Admin sign-in has no valid session identifier.';
  end;
  if v_session_id is null then
    raise exception 'SESSION_INVALID: This Admin sign-in has no valid session identifier.';
  end if;

  if not exists (
    select 1 from public.matmove_staff_access a
    where a.id = v_user_id and a.is_active = true and a.removed_at is null
  ) then
    raise exception 'STAFF_REMOVED: Active Admin staff access is required.';
  end if;

  insert into public.matmove_admin_sessions(session_id, user_id, device_label, user_agent)
  values (
    v_session_id,
    v_user_id,
    left(nullif(btrim(p_device_label), ''), 120),
    left(nullif(btrim(p_user_agent), ''), 500)
  )
  on conflict (session_id) do nothing;

  select * into v_row
  from public.matmove_admin_sessions
  where session_id = v_session_id
  for update;

  if not found or v_row.user_id <> v_user_id then
    raise exception 'SESSION_INVALID: The Admin session could not be verified.';
  end if;
  if v_row.revoked_at is not null then
    raise exception 'SESSION_REVOKED: This Admin session has been revoked. Sign in again.';
  end if;
  if v_row.started_at <= v_now - interval '24 hours' then
    raise exception 'SESSION_EXPIRED: The 24-hour maximum Admin session lifetime has been reached. Sign in again.';
  end if;
  if v_row.last_activity_at <= v_now - interval '15 minutes' then
    raise exception 'SESSION_EXPIRED: Admin access expired after 15 minutes of inactivity. Sign in again.';
  end if;

  update public.matmove_admin_sessions
  set last_activity_at = v_now,
      device_label = coalesce(left(nullif(btrim(p_device_label), ''), 120), device_label),
      user_agent = coalesce(left(nullif(btrim(p_user_agent), ''), 500), user_agent)
  where session_id = v_session_id;

  return jsonb_build_object(
    'sessionId', v_session_id,
    'startedAt', v_row.started_at,
    'lastActivityAt', v_now
  );
end;
$function$;

revoke all on function public.matmove_admin_session_valid() from public, anon;
grant execute on function public.matmove_admin_session_valid() to authenticated, service_role;
revoke all on function public.matmove_admin_session_touch(text, text) from public, anon, service_role;
grant execute on function public.matmove_admin_session_touch(text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
