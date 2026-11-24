import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Admin sign-out displays returned Supabase errors inline and remains retryable', async () => {
  const layout = await readFile('src/components/AdminLayout.tsx', 'utf8');
  const start = layout.indexOf('async function handleSignOut()');
  const end = layout.indexOf('const visibleItems', start);
  assert.ok(start >= 0 && end > start, 'sign-out handler should be present');

  const handler = layout.slice(start, end);
  assert.match(handler, /const \{ error \} = await supabase\.auth\.signOut\(\{ scope: 'local' \}\)/);
  assert.match(handler, /if \(error\) throw error/, 'Supabase-returned errors must not be silently ignored');
  assert.match(handler, /setSignOutError\(''\)/, 'a retry clears the previous message');
  assert.match(handler, /setSignOutError\(message\)/, 'failures are retained in component state');
  assert.doesNotMatch(handler, /console\.error|\balert\s*\(/, 'feedback must not rely on console-only output or blocking alerts');
  assert.match(layout, /signOutError && \(/);
  assert.match(layout, /role="alert"/, 'the inline message is announced accessibly');
  assert.match(layout, /aria-label="Dismiss sign-out error"/);
  assert.match(layout, /disabled=\{signingOut\}/, 'duplicate sign-out requests stay blocked');

  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  assert.match(packageJson.scripts.build, /test\/admin-signout-feedback\.test\.mjs/);
});
