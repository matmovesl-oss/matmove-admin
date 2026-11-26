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


test('Gala applications use one Sports-admin review queue for landing submissions and manual entries', () => {
  const page = read('../src/pages/SportsPage.tsx');
  assert.match(page, /matmove_sports_applications_admin_snapshot/);
  assert.match(page, /matmove_sports_application_admin_action/);
  assert.match(page, /id:'applications',label:'Applications'/);
  assert.match(page, /Gala application queue/);
  assert.match(page, /source==='admin_manual'\?'Admin entered':'Landing page'/);
  assert.match(page, /manual_submit/);
  assert.match(page, /Approve & add to roster/);
  assert.match(page, /request_info/);
  assert.match(page, /terms_accepted/);
  assert.match(page, /rules_accepted/);
});

test('Gala Admin manual entry collects the complete player application and fixed country', () => {
  const page = read('../src/pages/SportsPage.tsx');
  for (const value of ['MatMove SLE Wallet ID','Legal name','Country','Sierra Leone','Contact phone','WhatsApp number','Email address','eFootball User ID','eFootball team name']) {
    assert.ok(page.includes(value), 'Missing Admin application field: ' + value);
  }
  assert.match(page, /galaRegistrationOpen/);
  assert.match(page, /galaReviewOpen/);
  assert.match(page, /matmove_sports_update_registration_window/);
});

test('Gala Admin roster no longer has a separate direct-add intake that bypasses the application record', () => {
  const page = read('../src/pages/SportsPage.tsx');
  assert.match(page, /Approved Gala applications appear in this roster automatically/);
  assert.doesNotMatch(page, /async function addPlayer/);
  assert.doesNotMatch(page, /onSubmit=\{addPlayer\}/);
});
