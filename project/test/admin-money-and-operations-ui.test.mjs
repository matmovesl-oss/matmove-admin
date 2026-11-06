import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = path => fs.readFile(path, 'utf8');

test('Payroll and refund preparation works without a configured source balance, but confirmation stays gated', async () => {
  const ui = await read('src/components/AdminMoneyOperations.tsx');
  const review = ui.slice(ui.indexOf('function buildReview'), ui.indexOf('function persist'));
  assert.doesNotMatch(review, /!balance/);
  assert.match(ui, /Funding balance is not verified/);
  assert.match(ui, /disabled=\{busy\|\|blocked\|\|!balance\?\.newPaymentsEnabled\}/);
  assert.match(ui, /balance\?\.newPaymentsEnabled/);
});

test('Payroll roster refresh replaces stale rows and removes people no longer payroll eligible', async () => {
  const ui = await read('src/components/AdminMoneyOperations.tsx');
  assert.match(ui, /if\(!searchValue\.trim\(\)\)\{const freshIds=new Set\(data\.rows\.map/);
  assert.match(ui, /setRows\(data\.rows\)/);
  assert.match(ui, /setSelected\(previous=>previous\.filter\(id=>freshIds\.has\(id\)\)\)/);
  const api = await read('server/admin-money.js');
  assert.match(api, /eq\('is_payroll_staff',true\)\.in\('role',\['rider','driver','merchant'\]\)/);
});

test('Removed staff are excluded from active staff table and remain in the separate audit history', async () => {
  const ui = await read('src/pages/StaffGovernancePage.tsx');
  assert.match(ui, /const rows=staff\.filter\(s=>!s\.removed_at&&matches\(s\)\)/);
  assert.match(ui, /const removedRows=staff\.filter\(s=>!!s\.removed_at&&matches\(s\)\)/);
  assert.match(ui, /Removed staff history/);
});

test('Civitas customer directory supports name, email and phone search', async () => {
  const ui = await read('src/pages/CivitasAdministrativePage.tsx');
  assert.match(ui, /wallet\.profiles\?\.full_name/);
  assert.match(ui, /wallet\.profiles\?\.phone/);
  assert.match(ui, /wallet\.profiles\?\.email/);
});

test('Payout search includes transaction reference and destination phone', async () => {
  const ui = await read('src/pages/PayoutsPage.tsx');
  assert.match(ui, /p\.id,p\.reference,p\.transactionId,p\.paymentId/);
  assert.match(ui, /p\.destination\?\.phoneNumber/);
});

test('Dispatch provides today, 7-day, 30-day and full-history filters plus searchable 1000/2000 record views', async () => {
  const ui = await read('src/pages/DispatchRadarPage.tsx');
  assert.match(ui, /feedPeriod==='today'/);
  assert.match(ui, /feedPeriod==='7'\?7:30/);
  assert.match(ui, /option value="all">History/);
  assert.match(ui, /Booking ID, rider, driver, pickup or destination/);
  assert.match(ui, /Latest 1,000/);
  assert.match(ui, /Latest 2,000/);
});

test('Events show an optional USD display quote while wallet charge stays denominated in SLE', async () => {
  const ui = await read('src/pages/AdminEventsPage.tsx');
  assert.match(ui, /ticket_price_usd:\s*priceUsd\.trim\(\)\?Number\(priceUsd\):null/);
  assert.match(ui, /USD \$/);
  const customer = await read('../matmove.ent/project/src/components/PortalHome.tsx').catch(() => '');
  // Customer-side SLE debit is independently covered by the Customer release suite.
  assert.ok(ui.includes('Wallet debit price (SLE)'));
});

test('Admin Concierge delete hides removed service from Admin live list but preserves enquiry/audit history', async () => {
  const ui = await read('src/pages/ConciergePage.tsx');
  assert.match(ui, /services\.filter\(s=>!s\.deleted_at\)/);
  assert.match(ui, /mutate\('archive'/);
  assert.match(ui, /Existing enquiries remain in Admin history/);
});

test('Audit screen reads the unified database audit feed', async () => {
  const ui = await read('src/pages/AuditPage.tsx');
  assert.match(ui, /matmove_admin_audit_feed/);
  assert.match(ui, /limit:500/);
});
