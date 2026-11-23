import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Admin offline shell caches only the static app shell and fingerprinted assets', async () => {
  const [worker, entry, html, offline, manifest, app] = await Promise.all([
    readFile('public/sw.js', 'utf8'),
    readFile('src/main.tsx', 'utf8'),
    readFile('index.html', 'utf8'),
    readFile('public/offline.html', 'utf8'),
    readFile('public/manifest.webmanifest', 'utf8'),
    readFile('src/App.tsx', 'utf8')
  ]);
  assert.match(entry, /serviceWorker\.register\('\/sw\.js'/);
  assert.match(html, /rel="manifest"/);
  assert.match(worker, /CACHE_PREFIX = 'matmove-admin-static-'/);
  assert.match(worker, /HASHED_ASSET/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /\/(?:api|auth|rest|storage|functions|realtime)/);
  assert.doesNotMatch(worker, /cache\.put\([^\n]*(?:wallet|staff|customer|transaction|payment)/i);
  assert.match(offline, /permissions and live information must be verified online/);
  assert.equal(JSON.parse(manifest).display, 'standalone');
  assert.match(app, /Connect to the internet to verify your MatMove Admin access/);
  assert.match(app, /lastVerified\.current/);
});

test('Admin homepage artwork has a same-origin fallback when uploaded images are missing', async () => {
  const page = await readFile('src/pages/HomepagePostsPage.tsx', 'utf8');
  const fallback = await readFile('public/image-unavailable.svg', 'utf8');
  assert.equal((page.match(/image-unavailable\.svg/g) || []).length >= 4, true);
  assert.match(page, /currentTarget\.onerror=null/);
  assert.match(fallback, /MatMove/);
});
