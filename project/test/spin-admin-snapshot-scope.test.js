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
