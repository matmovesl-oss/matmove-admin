begin;

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
  if not public.matmove_admin_session_valid() then
    raise exception 'SESSION_INVALID: Complete Admin two-step authentication and maintain a valid registered device session.';
  end if;
end;
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
  select public.matmove_admin_session_valid()
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

notify pgrst, 'reload schema';
commit;
