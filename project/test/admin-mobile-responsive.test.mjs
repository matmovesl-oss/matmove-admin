import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Admin console supports compact phone, safe-area and landscape layouts', async () => {
  const css = await readFile('src/index.css', 'utf8');
  assert.match(css, /min-width:\s*320px/);
  assert.match(css, /100dvh/);
  assert.match(css, /@media\s*\(max-width:\s*767px\)/);
  assert.match(css, /@media\s*\(max-width:\s*380px\)/);
  assert.match(css, /orientation:\s*landscape/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /font-size:\s*16px/);
  assert.match(css, /min-height:\s*44px/);
});
