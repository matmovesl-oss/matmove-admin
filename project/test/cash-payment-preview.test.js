import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Admin cash and USSD preview remains clearly isolated from live finance APIs', async () => {
  const source = await readFile(new URL('../src/components/CashPaymentsPreview.tsx', import.meta.url), 'utf8');
  assert.match(source, /Mock data only/);
  assert.match(source, /not connected to the live admin feed, Supabase, Monime or settlement controls/);
  assert.match(source, /Physical cash due to drivers/);
  assert.match(source, /MatMove fee allocation \(15%\)/);
  assert.match(source, /Orange Money USSD/);
  assert.match(source, /Afrimoney USSD/);
  assert.doesNotMatch(source, /supabase\.rpc|fetch\s*\(|\.from\(['"]wallets/);
});

test('Financials page mounts the separate cash collection preview behind existing permission gate', async () => {
  const source = await readFile(new URL('../src/pages/FinancialsPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /canAccess\(access,'financials'\)/);
  assert.match(source, /<CashPaymentsPreview\s*\/>/);
});
