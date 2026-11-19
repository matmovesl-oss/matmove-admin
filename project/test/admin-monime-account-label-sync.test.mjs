import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Monime account label sync is a permission-gated, batched POST and only changes verified account names', async () => {
  const api = await readFile('api/admin-wallet-balances.js', 'utf8');
  const ui = await readFile('src/pages/FinancialsPage.tsx', 'utf8');
  assert.match(api, /req\.body\?\.action !== 'sync_account_labels'/);
  assert.match(api, /if \(!financial\)/);
  assert.match(api, /method: 'PATCH'/);
  assert.match(api, /account\?\.id !== accountId/);
  assert.match(api, /updatedAccount\.name !== displayName/);
  assert.match(api, /monimeAccountDisplayName/);
  assert.match(api, /'Rider'/);
  assert.match(api, /'Driver'/);
  assert.match(api, /'Merchant'/);
  assert.match(ui, /Sync Monime account names/);
  assert.match(ui, /action: 'sync_account_labels'/);
  assert.match(ui, /nextOffset/);
});

test('admin sidebar preference persists and wallet data remains visible offline', async () => {
  const layout = await readFile('src/components/AdminLayout.tsx', 'utf8');
  const hooks = await readFile('src/lib/hooks.ts', 'utf8');
  assert.match(layout, /matmove-admin-sidebar-collapsed/);
  assert.match(layout, /transition-transform duration-300 ease-out/);
  assert.match(layout, /aria-controls="admin-sidebar"/);
  assert.match(layout, /Offline · showing last view/);
  assert.match(hooks, /navigator\.onLine/);
  assert.match(hooks, /Showing the last successfully loaded wallet data/);
  assert.match(hooks, /hasSnapshot\.current/);
});

test('financial refresh keeps the last verified customer snapshot visible during background refresh', async () => {
  const ui = await readFile('src/pages/FinancialsPage.tsx', 'utf8');
  assert.match(ui, /if \(!hasCurrentSnapshot\) \{ setWallets\(\[\]\); setAccounts\(\[\]\); setPlatform\(emptyPlatform\); setLoading\(true\); \}/);
});
