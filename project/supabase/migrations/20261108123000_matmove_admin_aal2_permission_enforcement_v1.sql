-- Require a verified TOTP authenticator session for all permission-gated Admin
-- operations. The most recent AMR entry must be TOTP as well as AAL2.
-- matmove_admin_me() remains available so staff can load their own assignment
-- and enroll TOTP before accessing Admin.
--
-- This migration must be applied only after the Admin MFA gate is deployed and
-- the active staff have been given the opportunity to enroll their factors.

create or replace function public.matmove_admin_can(p_section text)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
 select
  (auth.jwt()->>'aal') = 'aal2'
  and (auth.jwt()->'amr'->0->>'method') = 'totp'
  and exists(
   select 1 from public.matmove_staff_access a
   where a.id=auth.uid()
     and a.is_active
     and a.removed_at is null
     and (
      a.is_owner
      or a.permissions ? p_section
      or (
       p_section='games'
       and exists(
        select 1
        from jsonb_array_elements_text(a.permissions) p
        where p like 'games.%'
       )
      )
     )
  );
$function$;

-- matmove_admin_any(text[]) delegates to matmove_admin_can(text), so all RLS
-- and RPC checks using either helper now require a current TOTP-backed aal2 session. Do not alter
-- matmove_admin_me() or matmove_admin_access(uuid): the former is the
-- caller's own bootstrap record; the latter remains service_role-only.
