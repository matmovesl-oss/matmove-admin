import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Admin preview without Supabase credentials does not mount staff authentication or production services', async () => {
  const entry = await read('../src/main.tsx');
  const supabase = await read('../src/lib/supabase.ts');
  const preview = await read('../src/components/SecureAdminPreviewDisconnected.tsx');
  const pkg = JSON.parse(await read('../package.json'));

  assert.match(supabase, /export const isSupabaseConfigured = Boolean\(url && key\)/);
  assert.match(supabase, /https:\/\/not-configured\.invalid/);
  assert.match(entry, /isSupabaseConfigured \? <App \/> : <SecureAdminPreviewDisconnected \/>/);
  assert.match(preview, /Preview is not connected to a test database/);
  assert.match(preview, /intentionally disconnected from live staff accounts, customer records, wallets and payment services/);
  assert.match(entry, /if \(import\.meta\.env\.PROD && isSupabaseConfigured/);
  assert.match(pkg.scripts.build, /test\/admin-preview-no-supabase\.test\.mjs/);
});

test('configured Admin production still mounts the existing app', async () => {
  const entry = await read('../src/main.tsx');
  assert.match(entry, /isSupabaseConfigured \? <App \/>/);
});
