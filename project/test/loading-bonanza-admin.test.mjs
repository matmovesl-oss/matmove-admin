import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Loading Bonanza admin API uses the existing staff endpoint and owner-only writes', async () => {
  const api = await readFile(new URL('../server/admin-loading-bonanza.js', import.meta.url), 'utf8');
  const router = await readFile(new URL('../api/admin-staff.js', import.meta.url), 'utf8');
  assert.match(api, /authorize\(req, \['financials'\]/);
  assert.match(api, /access\.is_owner !== true/);
  assert.match(api, /function assertLiveMonime/);
  assert.match(api, /token\.startsWith\('mon_test_'\)/);
  assert.match(api, /matmove_loading_bonanza_admin_overview/);
  assert.match(api, /matmove_loading_bonanza_admin_save/);
  assert.match(api, /matmove_loading_bonanza_funding_claim/);
  assert.match(api, /matmove_loading_bonanza_funding_record/);
  assert.match(api, /Idempotency-Key/);
  assert.match(api, /MONIME_MAIN_ACCOUNT_ID/);
  assert.match(router, /loading-bonanza-overview/);
  assert.match(router, /createLoadingBonanzaAdminHandler/);
});

test('Loading Bonanza page keeps rate fixed at one percent and only edits threshold and budget', async () => {
  const page = await readFile(new URL('../src/pages/LoadingBonanzaPage.tsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const layout = await readFile(new URL('../src/components/AdminLayout.tsx', import.meta.url), 'utf8');
  assert.match(page, /cashbackBps: 100/);
  assert.match(page, /fixed 1% cashback/);
  assert.match(page, /minimumTopupMinor/);
  assert.match(page, /budgetMinor/);
  assert.match(page, /crypto\.randomUUID\(\)/);
  assert.match(page, /Only the account owner can change these settings/);
  assert.match(page, /Fund referral treasury/);
  assert.match(page, /fundTreasury/);
  assert.match(page, /I authorize this exact amount to move/);
  assert.match(app, /path="\/loading-bonanza"/);
  assert.match(layout, /name: 'Loading Bonanza', path: '\/loading-bonanza'/);
});
