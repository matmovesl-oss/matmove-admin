import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const paths = [
  'docs/STAFF_ACCESS_SETUP.sql',
  'docs/STAFF_ACCESS_REPAIR.sql',
  'docs/GAME_REPORTS_SETUP.sql',
  'docs/SPIN_ADMIN_SNAPSHOT_SCOPE_REPAIR.sql',
];

test('Spin settings snapshot exposes config and permission-scoped summaries only', async () => {
  for (const path of paths.slice(0, 2).concat(paths.slice(3))) {
    const sql = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(sql, /create or replace function public\.matmove_spin_admin_snapshot\(\)/i);
    assert.match(sql, /matmove_admin_can\('games\.settings'\)/i);
    assert.match(sql, /matmove_admin_can\('games\.entries'\)/i);
    assert.match(sql, /matmove_admin_can\('games\.winnings'\)/i);
    assert.match(sql, /matmove_admin_any\(ARRAY\['games\.overview','games\.winnings'\]/i);
    assert.match(sql, /return jsonb_build_object\([\s\S]*?'config'[\s\S]*?'entryReceivedMinor'[\s\S]*?'winsPaidMinor'[\s\S]*?'winsOwedMinor'[\s\S]*?'reservedMinor'/i);
    assert.match(sql, /revoke all on function public\.matmove_spin_admin_snapshot_staff_base\(\) from public,anon,authenticated/i);
    assert.doesNotMatch(sql, /return public\.matmove_spin_admin_snapshot_staff_base\(\);\s*end;\s*\$snapshot\$/i);
  }
});

test('Spin report setup scopes reserved-capacity totals to Overview or Winnings', async () => {
  const setup = await readFile(new URL('../docs/GAME_REPORTS_SETUP.sql', import.meta.url), 'utf8');
  assert.match(setup, /p_view when 'rounds' then 'games\.overview'[\s\S]*when 'winnings' then 'games\.winnings'/i);
  assert.match(setup, /matmove_admin_any\(ARRAY\['games\.overview','games\.winnings'\][\s\S]*stats:=stats-'reservedMinor'/i);

  for (const path of ['docs/STAFF_ACCESS_SETUP.sql','docs/STAFF_ACCESS_REPAIR.sql','docs/SPIN_ADMIN_SNAPSHOT_SCOPE_REPAIR.sql']) {
    const sql = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(sql, /matmove_admin_any\(ARRAY\['games\.overview','games\.winnings'\][\s\S]*summary:=summary-'reservedMinor'/i);
  }
});


import {PGlite} from '@electric-sql/pglite';

test('Spin scope repair enforces per-section RPC data permissions and private base grants', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create schema auth;
      create role anon;
      create role authenticated;
      create role service_role;
      grant usage on schema public, auth to anon, authenticated, service_role;

      create function auth.uid()
      returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

      create function auth.jwt()
      returns jsonb language sql stable
      as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;

      create function public.matmove_admin_can(p_section text)
      returns boolean language sql stable
      as $$ select coalesce(p_section = any(string_to_array(current_setting('test.permissions',true),',')),false) $$;

      create function public.matmove_admin_any(p_sections text[])
      returns boolean language sql stable
      as $$ select exists(select 1 from unnest(p_sections) x where public.matmove_admin_can(x)) $$;

      create function public.matmove_spin_admin_allowed()
      returns boolean language sql stable
      as $$ select exists(select 1 from unnest(string_to_array(current_setting('test.permissions',true),',')) p where p like 'games.%') $$;

      create function public.matmove_spin_admin_snapshot_staff_base()
      returns jsonb language sql security definer set search_path=pg_catalog,public
      as $$
        select jsonb_build_object(
          'config',jsonb_build_object('id',7,'enabled',true,'bundle_tiers','[]'::jsonb),
          'entryReceivedMinor',90000,
          'winsPaidMinor',20000,
          'winsOwedMinor',5000,
          'reservedMinor',30000,
          'rounds',jsonb_build_array(jsonb_build_object('user_id','22222222-2222-4222-8222-222222222222')),
          'receipts',jsonb_build_array(jsonb_build_object('provider_id','trn-private')),
          'access',jsonb_build_array(jsonb_build_object('user_id','22222222-2222-4222-8222-222222222222'))
        )
      $$;

      create function public.matmove_spin_admin_snapshot()
      returns jsonb language plpgsql security definer set search_path=pg_catalog,public
      as $$ begin
        if not public.matmove_admin_can('games.settings') then raise exception 'FORBIDDEN'; end if;
        return public.matmove_spin_admin_snapshot_staff_base();
      end $$;

      create function public.matmove_spin_admin_report_staff_base(
        p_view text,p_page integer default 1,p_search text default '',p_status text default 'all',p_player uuid default null
      )
      returns jsonb language sql security definer set search_path=pg_catalog,public
      as $$
        select jsonb_build_object(
          'view',p_view,'page',p_page,'pageSize',25,'total',1,
          'rows',jsonb_build_array(jsonb_build_object('id','row-1')),
          'stats',jsonb_build_object(
            'entryReceivedMinor',90000,'winsPaidMinor',20000,'winsOwedMinor',5000,
            'prizesCredited',2,'paidEntries',1,'pendingEntries',2,'reservedMinor',30000
          )
        )
      $$;

      create function public.matmove_spin_admin_report(
        p_view text,p_page integer default 1,p_search text default '',p_status text default 'all',p_player uuid default null
      )
      returns jsonb language sql security definer set search_path=pg_catalog,public
      as $$ select public.matmove_spin_admin_report_staff_base(p_view,p_page,p_search,p_status,p_player) $$;

      grant execute on all functions in schema public to anon,authenticated,service_role;
    `);

    const patch = await readFile('docs/SPIN_ADMIN_SNAPSHOT_SCOPE_REPAIR.sql','utf8');
    const safePatch = patch.replace(/^[\\t ]*(?:begin|commit);[\\t ]*\\r?$/gim,'');
    await pg.exec(safePatch);

    const actor='11111111-1111-4111-8111-111111111111';
    const setActor=async permissions=>{
      await pg.exec(`select set_config('request.jwt.claim.sub','${actor}',false)`);
      await pg.exec(`select set_config('request.jwt.claims','{"role":"authenticated","sub":"${actor}"}',false)`);
      await pg.exec(`select set_config('test.permissions','${permissions}',false)`);
    };
    const asAuthenticated=async query=>{
      await pg.exec('set role authenticated');
      try{return await pg.query(query);}
      finally{await pg.exec('reset role');}
    };

    const grants=(await pg.query(`
      select
       has_function_privilege('anon','public.matmove_spin_admin_snapshot()','execute') anon_public,
       has_function_privilege('authenticated','public.matmove_spin_admin_snapshot()','execute') auth_snapshot,
       has_function_privilege('authenticated','public.matmove_spin_admin_snapshot_staff_base()','execute') auth_base,
       has_function_privilege('service_role','public.matmove_spin_admin_snapshot_staff_base()','execute') service_base
    `)).rows[0];
    assert.equal(grants.anon_public,false);
    assert.equal(grants.auth_snapshot,true);
    assert.equal(grants.auth_base,false);
    assert.equal(grants.service_base,false);

    await setActor('games.settings');
    const settingsOnly=(await asAuthenticated('select public.matmove_spin_admin_snapshot() as data')).rows[0].data;
    assert.deepEqual(settingsOnly.config,{id:7,enabled:true,bundle_tiers:[]});
    assert.equal(settingsOnly.entryReceivedMinor,null);
    assert.equal(settingsOnly.winsPaidMinor,null);
    assert.equal(settingsOnly.winsOwedMinor,null);
    assert.equal(settingsOnly.reservedMinor,null);
    assert.equal('rounds' in settingsOnly,false);
    assert.equal('receipts' in settingsOnly,false);
    assert.equal('access' in settingsOnly,false);

    await setActor('games.settings,games.entries');
    const entriesOnly=(await asAuthenticated('select public.matmove_spin_admin_snapshot() as data')).rows[0].data;
    assert.equal(entriesOnly.entryReceivedMinor,90000);
    assert.equal(entriesOnly.winsPaidMinor,null);
    assert.equal(entriesOnly.winsOwedMinor,null);
    assert.equal(entriesOnly.reservedMinor,null);

    await setActor('games.settings,games.winnings');
    const winnings=(await asAuthenticated('select public.matmove_spin_admin_snapshot() as data')).rows[0].data;
    assert.equal(winnings.entryReceivedMinor,null);
    assert.equal(winnings.winsPaidMinor,20000);
    assert.equal(winnings.winsOwedMinor,5000);
    assert.equal(winnings.reservedMinor,30000);

    await setActor('games.settings,games.overview');
    const overview=(await asAuthenticated('select public.matmove_spin_admin_snapshot() as data')).rows[0].data;
    assert.equal(overview.entryReceivedMinor,null);
    assert.equal(overview.winsPaidMinor,null);
    assert.equal(overview.reservedMinor,30000);

    await setActor('games.entries');
    const entryReport=(await asAuthenticated(`select public.matmove_spin_admin_report('entries',1,'','all',null) as data`)).rows[0].data;
    assert.equal(entryReport.stats.entryReceivedMinor,90000);
    assert.equal('winsPaidMinor' in entryReport.stats,false);
    assert.equal('winsOwedMinor' in entryReport.stats,false);
    assert.equal('reservedMinor' in entryReport.stats,false);

    await setActor('');
    await assert.rejects(
      () => asAuthenticated('select public.matmove_spin_admin_snapshot()'),
      /FORBIDDEN/
    );
    await assert.rejects(
      () => asAuthenticated(`select public.matmove_spin_admin_report('entries',1,'','all',null)`),
      /FORBIDDEN/
    );
  } finally {
    await pg.close();
  }
});
