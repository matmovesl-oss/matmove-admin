import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Admin portal keeps page headings compact while retaining readable form controls', async () => {
  const css = await readFile('src/index.css', 'utf8');
  assert.match(css, /\.mm-admin-shell h1[\s\S]*?font-size: clamp\(1\.15rem/);
  assert.match(css, /\.mm-admin-header h1[\s\S]*?font-size: clamp\(1rem/);
  assert.match(css, /font-size: max\(16px, 1rem\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.mm-admin-shell h1/);
});
