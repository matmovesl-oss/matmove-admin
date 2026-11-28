-- Bind Admin access to a verified Supabase Auth session and its revocation registry.
-- Staff removal/disable/permission changes already set revoked_at via the existing
-- matmove_admin_revoke_sessions_on_staff_change trigger. This migration makes
-- RLS and server APIs consult that same registry on every privileged operation.
begin;

create or replace function public.matmove_admin_session_valid()
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'auth'
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
  if v_session_id is null then return false; end if;

  return exists (
    select 1
    from auth.sessions auth_session
    join public.matmove_admin_sessions registry
      on registry.session_id = auth_session.id
     and registry.user_id = auth_session.user_id
    join public.matmove_staff_access staff
      on staff.id = registry.user_id
    where auth_session.id = v_session_id
      and auth_session.user_id = v_user_id
      and auth_session.aal = 'aal2'
      and registry.revoked_at is null
      and registry.started_at > clock_timestamp() - interval '24 hours'
      and registry.last_activity_at > clock_timestamp() - interval '15 minutes'
      and staff.is_active = true
      and staff.removed_at is null
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
set search_path to 'pg_catalog', 'public', 'auth'
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
  if coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2'
     or not exists (
       select 1
       from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) method
       where method->>'method' = 'totp'
     ) then
    raise exception 'MFA_REQUIRED: Verify your Admin password and authenticator before continuing.';
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
    select 1 from auth.sessions auth_session
    where auth_session.id = v_session_id
      and auth_session.user_id = v_user_id
      and auth_session.aal = 'aal2'
  ) then
    raise exception 'SESSION_INVALID: The Supabase Auth session is no longer active.';
  end if;
  if not exists (
    select 1 from public.matmove_staff_access staff
    where staff.id = v_user_id
      and staff.is_active = true
      and staff.removed_at is null
  ) then
    raise exception 'STAFF_REMOVED: Active MatMove Admin staff access is required.';
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

-- This is called only by Vercel's service-role API after Supabase Auth has
-- validated the bearer token and the API has checked its signed AAL2/TOTP claims.
create or replace function public.matmove_admin_server_session_valid(
  p_user_id uuid,
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
  select exists (
    select 1
    from auth.sessions auth_session
    join public.matmove_admin_sessions registry
      on registry.session_id = auth_session.id
     and registry.user_id = auth_session.user_id
    join public.matmove_staff_access staff
      on staff.id = registry.user_id
    where auth_session.id = p_session_id
      and auth_session.user_id = p_user_id
      and auth_session.aal = 'aal2'
      and registry.revoked_at is null
      and registry.started_at > clock_timestamp() - interval '24 hours'
      and registry.last_activity_at > clock_timestamp() - interval '15 minutes'
      and staff.is_active = true
      and staff.removed_at is null
  );
$function$;

create or replace function public.matmove_admin_require_aal2()
returns void
language plpgsql
stable
security invoker
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'AUTH: Sign in to Admin.';
  end if;
  if coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2'
     or not exists (
       select 1
       from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) method
       where method->>'method' = 'totp'
     ) then
    raise exception 'MFA_REQUIRED: Verify your MatMove Admin authenticator code.';
  end if;
  if not public.matmove_admin_session_valid() then
    raise exception 'SESSION_INVALID: Your Admin session is expired or revoked. Sign in again.';
  end if;
end;
$function$;

create or replace function public.matmove_admin_can(p_section text)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select public.matmove_admin_session_valid()
    and exists (
      select 1
      from public.matmove_staff_access staff
      where staff.id = auth.uid()
        and staff.is_active = true
        and staff.removed_at is null
        and (
          staff.is_owner
          or staff.permissions ? p_section
          or (
            p_section = 'games'
            and exists (
              select 1
              from jsonb_array_elements_text(staff.permissions) permission
              where permission like 'games.%'
            )
          )
        )
    );
$function$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select public.matmove_admin_session_valid()
    and exists (
      select 1
      from public.matmove_staff_access staff
      where staff.id = auth.uid()
        and staff.is_active = true
        and staff.removed_at is null
        and (staff.is_owner or exists (
          select 1 from public.admins legacy where legacy.id = staff.id
        ))
    );
$function$;

create or replace function public.matmove_is_staff()
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select public.matmove_admin_session_valid()
    and exists (
      select 1
      from public.matmove_staff_access staff
      where staff.id = auth.uid()
        and staff.is_active = true
        and staff.removed_at is null
    );
$function$;

create or replace function public.matmove_admin_list_sessions(p_user_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_target uuid := coalesce(p_user_id, auth.uid());
  v_rows jsonb;
begin
  if auth.uid() is null or not public.matmove_admin_session_valid() then
    raise exception 'SESSION_INVALID: A verified Admin session is required.';
  end if;
  if v_target <> auth.uid() and not exists (
    select 1 from public.matmove_staff_access
    where id = auth.uid()
      and is_active = true
      and is_owner = true
      and removed_at is null
  ) then
    raise exception 'FORBIDDEN: Only the owner can view another administrator’s sessions.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sessionId', registry.session_id,
    'deviceLabel', coalesce(registry.device_label, 'Unknown device'),
    'userAgent', registry.user_agent,
    'startedAt', registry.started_at,
    'lastActivityAt', registry.last_activity_at,
    'isCurrent', registry.session_id = nullif(auth.jwt()->>'session_id','')::uuid
  ) order by registry.last_activity_at desc), '[]'::jsonb)
  into v_rows
  from public.matmove_admin_sessions registry
  join auth.sessions auth_session
    on auth_session.id = registry.session_id
   and auth_session.user_id = registry.user_id
  where registry.user_id = v_target
    and registry.revoked_at is null
    and registry.started_at > clock_timestamp() - interval '24 hours'
    and registry.last_activity_at > clock_timestamp() - interval '15 minutes';

  return jsonb_build_object('sessions', v_rows);
end;
$function$;

create or replace function public.matmove_admin_revoke_sessions(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_target uuid := coalesce(p_user_id, auth.uid());
  v_count integer;
begin
  if auth.uid() is null or not public.matmove_admin_session_valid() then
    raise exception 'SESSION_INVALID: A verified Admin session is required.';
  end if;
  if v_target <> auth.uid() and not exists (
    select 1 from public.matmove_staff_access
    where id = auth.uid()
      and is_active = true
      and is_owner = true
      and removed_at is null
  ) then
    raise exception 'FORBIDDEN: Only the owner can revoke another administrator’s sessions.';
  end if;

  update public.matmove_admin_sessions
  set revoked_at = coalesce(revoked_at, clock_timestamp())
  where user_id = v_target and revoked_at is null;
  get diagnostics v_count = row_count;

  insert into public.matmove_staff_audit(actor_id, target_id, action, details)
  values (
    auth.uid(),
    v_target,
    'REVOKE_ADMIN_SESSIONS',
    jsonb_build_object(
      'revokedSessions', v_count,
      'scope', case when v_target = auth.uid() then 'own_devices' else 'staff_devices' end
    )
  );
  return jsonb_build_object('success', true, 'userId', v_target, 'revokedSessions', v_count);
end;
$function$;

-- Owner-only server API action used to revoke an individual staff member's
-- sessions without changing or deleting their Customer login/account.
create or replace function public.matmove_admin_server_revoke_sessions(
  p_actor_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_count integer;
begin
  if p_actor_id is null or p_user_id is null or p_actor_id = p_user_id then
    raise exception 'INVALID: Select another administrator.';
  end if;
  if not exists (
    select 1 from public.matmove_staff_access
    where id = p_actor_id
      and is_owner = true
      and is_active = true
      and removed_at is null
  ) then
    raise exception 'FORBIDDEN: Only the active owner can revoke another administrator’s sessions.';
  end if;
  if not exists (
    select 1 from public.matmove_staff_access
    where id = p_user_id
      and is_owner = false
      and is_active = true
      and removed_at is null
  ) then
    raise exception 'NOT_FOUND: Active Admin staff assignment not found.';
  end if;

  update public.matmove_admin_sessions
  set revoked_at = coalesce(revoked_at, clock_timestamp())
  where user_id = p_user_id and revoked_at is null;
  get diagnostics v_count = row_count;

  insert into public.matmove_staff_audit(actor_id, target_id, action, details)
  values (
    p_actor_id,
    p_user_id,
    'REVOKE_ADMIN_SESSIONS',
    jsonb_build_object('revokedSessions', v_count, 'scope', 'owner_revoked_staff_devices')
  );
  return jsonb_build_object('success', true, 'userId', p_user_id, 'revokedSessions', v_count);
end;
$function$;

revoke all on function public.matmove_admin_session_touch(text,text) from public, anon;
grant execute on function public.matmove_admin_session_touch(text,text) to authenticated;

revoke all on function public.matmove_admin_session_valid() from public, anon;
grant execute on function public.matmove_admin_session_valid() to authenticated, service_role;

revoke all on function public.matmove_admin_server_session_valid(uuid,uuid) from public, anon, authenticated;
grant execute on function public.matmove_admin_server_session_valid(uuid,uuid) to service_role;

revoke all on function public.matmove_admin_require_aal2() from public, anon;
grant execute on function public.matmove_admin_require_aal2() to authenticated;

revoke all on function public.matmove_admin_list_sessions(uuid) from public, anon;
grant execute on function public.matmove_admin_list_sessions(uuid) to authenticated;

revoke all on function public.matmove_admin_revoke_sessions(uuid) from public, anon;
grant execute on function public.matmove_admin_revoke_sessions(uuid) to authenticated;

revoke all on function public.matmove_admin_server_revoke_sessions(uuid,uuid) from public, anon, authenticated;
grant execute on function public.matmove_admin_server_revoke_sessions(uuid,uuid) to service_role;

notify pgrst, 'reload schema';
commit;
