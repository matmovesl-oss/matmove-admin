import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Admin cash and USSD preview remains clearly isolated from live finance APIs', async () => {
  const source = await readFile(new URL('../src/components/CashPaymentsPreview.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('Mock data only'));
  assert.ok(source.includes('not connected to the live admin feed, Supabase, Monime or settlement controls'));
  assert.ok(source.includes('Physical cash due to drivers'));
  assert.ok(source.includes('MatMove fee allocation (15%)'));
  assert.ok(source.includes('Orange Money USSD'));
  assert.ok(source.includes('Afrimoney USSD'));
  assert.ok(!source.includes('supabase.rpc'));
  assert.ok(!source.includes('fetch('));
  assert.ok(!source.includes(".from('wallets"));
});

test('Financials page mounts the separate cash collection preview behind existing permission gate', async () => {
  const source = await readFile(new URL('../src/pages/FinancialsPage.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes("canAccess(access,'financials')"));
  assert.ok(source.includes('<CashPaymentsPreview />'));
});
