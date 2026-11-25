import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Sports is a dedicated staff permission and protected Admin route', () => {
  const permissions = read('../shared/admin-permissions.js');
  const app = read('../src/App.tsx');
  const layout = read('../src/components/AdminLayout.tsx');
  assert.match(permissions, /\['sports',\s*'Sports tournament management',\s*'\/sports'\]/);
  assert.match(app, /path="\/sports".*section="sports"/);
  assert.match(layout, /key: 'sports'.*path: '\/sports'/);
});

test('Sports workspace uses protected database actions and keeps the actual game room ID', () => {
  const page = read('../src/pages/SportsPage.tsx');
  assert.match(page, /matmove_sports_admin_snapshot/);
  assert.match(page, /matmove_sports_admin_action/);
  assert.match(page, /game_tournament_id/);
  assert.match(page, /save only three game IDs/);
  assert.match(page, /Grand Final Friend Match/);
  assert.match(page, /invitation_url/);
  assert.match(page, /matmove-sports-evidence/);
});

test('Sports MVP includes the 16-player bracket, match statistics, evidence and payout audit trail', () => {
  const page = read('../src/pages/SportsPage.tsx');
  assert.match(page, /Generate 15-match bracket/);
  assert.match(page, /registrationOpen/);
  assert.match(page, /lock after the bracket is generated/);
  assert.match(page, /quarter_final/);
  assert.match(page, /semi_final/);
  assert.match(page, /group_final/);
  assert.match(page, /grand_final/);
  assert.match(page, /Goals scored/);
  assert.match(page, /Goal difference/);
  assert.match(page, /transaction_reference/);
  assert.match(page, /Winner available after Grand Final/);
  assert.match(page, /Only the overall champion receives the cash prize/);
  assert.match(page, /Share on WhatsApp/);
  assert.ok(page.includes('image/png'));
  assert.match(page, /Top scorer/);
  assert.match(page, /does not initiate a Monime transfer/);
});
