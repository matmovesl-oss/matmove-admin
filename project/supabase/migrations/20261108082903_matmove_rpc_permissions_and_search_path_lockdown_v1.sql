-- MatMove production security lockdown, phase 2: RPC boundaries.

do $migration$
declare def text; updated text; item record;
begin
  select pg_get_functiondef('public.admin_change_user_role(uuid,text,text)'::regprocedure) into def;
  updated := regexp_replace(
    def,
    'IF NOT EXISTS[[:space:]]*\([[:space:]]*SELECT 1[[:space:]]*FROM public\.admins a[[:space:]]*WHERE a\.id = v_admin_id[[:space:]]*\)',
    'IF NOT public.matmove_admin_can(''customers'')',
    'i'
  );
  if updated = def then raise exception 'Could not insert the Customers permission check into admin_change_user_role.'; end if;
  updated := regexp_replace(updated, 'SET search_path TO[^\n]*', 'SET search_path TO ''pg_catalog'', ''public''', 'i');
  execute updated;

  select pg_get_functiondef('public.admin_set_wallet_active(uuid,boolean,text)'::regprocedure) into def;
  updated := regexp_replace(
    def,
    'IF NOT EXISTS[[:space:]]*\([[:space:]]*SELECT 1[[:space:]]*FROM public\.admins[[:space:]]*WHERE id = v_admin_id[[:space:]]*\)',
    'IF NOT public.matmove_admin_can(''financials'')',
    'i'
  );
  if updated = def then raise exception 'Could not insert the Financials permission check into admin_set_wallet_active.'; end if;
  updated := regexp_replace(updated, 'SET search_path TO[^\n]*', 'SET search_path TO ''pg_catalog'', ''public''', 'i');
  execute updated;

  select pg_get_functiondef('public.set_currency_rate(text,text,numeric,numeric)'::regprocedure) into def;
  updated := regexp_replace(
    def,
    'IF NOT EXISTS[[:space:]]*\([[:space:]]*SELECT 1[[:space:]]*FROM public\.admins[[:space:]]*WHERE id = v_admin_id[[:space:]]*\)',
    'IF NOT public.matmove_admin_can(''financials'')',
    'i'
  );
  if updated = def then raise exception 'Could not insert the Financials permission check into set_currency_rate.'; end if;
  updated := regexp_replace(updated, 'SET search_path TO[^\n]*', 'SET search_path TO ''pg_catalog'', ''public''', 'i');
  execute updated;

  for item in
    select n.nspname, p.proname, oidvectortypes(p.proargtypes) as args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
        where cfg like 'search_path=pg_catalog%' or cfg = 'search_path=""'
      )
  loop
    execute format('alter function %I.%I(%s) set search_path = pg_catalog, public',
      item.nspname, item.proname, item.args);
  end loop;
end
$migration$;

revoke all on function public.matmove_admin_send_notification(text,text,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.matmove_admin_send_notification(text,text,uuid,text,text,text)
  to service_role;

revoke all on function public.settle_wallet_topup(uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.settle_wallet_topup(uuid,text,jsonb)
  to service_role;

revoke all on function public.get_nearby_eligible_drivers(numeric,numeric,numeric)
  from public, anon, authenticated;
grant execute on function public.get_nearby_eligible_drivers(numeric,numeric,numeric)
  to service_role;

alter function public.calculate_trip_fare(text,numeric)
  set search_path = pg_catalog, public;

revoke all on function public.admin_change_user_role(uuid,text,text) from public, anon;
grant execute on function public.admin_change_user_role(uuid,text,text) to authenticated, service_role;

revoke all on function public.admin_set_wallet_active(uuid,boolean,text) from public, anon;
grant execute on function public.admin_set_wallet_active(uuid,boolean,text) to authenticated, service_role;

revoke all on function public.set_currency_rate(text,text,numeric,numeric) from public, anon;
grant execute on function public.set_currency_rate(text,text,numeric,numeric) to authenticated, service_role;

notify pgrst, 'reload schema';
