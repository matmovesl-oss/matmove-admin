-- Read-only. Run after the paused matching deployment and Stage 2 migration.
with functions(signature) as (values
 ('public.matmove_admin_money_prepare(text,uuid,uuid,uuid,text,text,bigint,text)'),
 ('public.matmove_admin_money_claim(text,uuid,uuid)'),
 ('public.matmove_admin_money_record(text,uuid,uuid,jsonb)'),
 ('public.matmove_admin_money_review(text,uuid,uuid)')
), resolved as (select signature,to_regprocedure(signature) id from functions)
select count(*)=4 and bool_and(id is not null) as money_rpcs_ready,
 bool_and(id is not null and not has_function_privilege('anon',id,'EXECUTE')
  and not has_function_privilege('authenticated',id,'EXECUTE')) as browser_money_rpcs_blocked,
 bool_and(id is not null and has_function_privilege('service_role',id,'EXECUTE')) as server_money_rpcs_ready
from resolved;
select c.relname as table_name,c.relrowsecurity as rls_enabled,
 not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
 and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as browser_table_access_blocked
from pg_class c where c.oid in (to_regclass('public.matmove_admin_payroll'),
 to_regclass('public.matmove_admin_refunds'),to_regclass('public.matmove_admin_money_receipts')) order by c.relname;
