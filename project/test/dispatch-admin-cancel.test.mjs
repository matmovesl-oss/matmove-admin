import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Dispatch supports cancellation review for unfinished paid and unpaid requests', async () => {
  const source = await readFile(new URL('../src/pages/DispatchRadarPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /'cash_reserve_pending', 'accepted'/);
  assert.match(source, /matmove_admin_cancel_booking/);
  assert.match(source, /booking\.status === 'accepted' \|\| booking\.status === 'cash_reserve_pending'/);
  assert.match(source, /finalRefundStatus === 'refund_pending'/);
  assert.match(source, /Review cancellation \/ refund/);
  assert.match(source, /booking\.paymentStarted/);
});

test('Dispatch shows the durable automatic stale-request investigation queue', async () => {
  const source = await readFile(new URL('../src/pages/DispatchRadarPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /matmove_ride_investigation_tickets/);
  assert.match(source, /Automatic ride investigations/);
  assert.match(source, /Copy request reference/);
});

test('Dispatch only offers in-progress cancellation for digital payments and warns on cash handover uncertainty', async () => {
  const source = await readFile(new URL('../src/pages/DispatchRadarPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /const cancelable = mutable && !\(booking\.status === 'in_progress' && booking\.paymentMethod === 'cash'\)/);
  assert.match(source, /Cash handover may already have occurred/);
  assert.match(source, /booking\.status === 'in_progress'/);
});

test('Admin cancellation immediately requests server-side provider reconciliation without exposing provider credentials', async () => {
  const source = await readFile(new URL('../src/pages/DispatchRadarPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /api\/accept-ride-escrow\?action=admin_reconcile/);
  assert.match(source, /session\.access_token/);
  assert.match(source, /reconciliation\?\.refundVerified === true/);
  assert.doesNotMatch(source, /MONIME_API_KEY|MONIME_SPACE_ID/);
});

test('Dispatch separates cash fee-reserve returns from physical cash refunds and blocks assigned cash rides', async () => {
  const source = await readFile(new URL('../src/pages/DispatchRadarPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /booking\.paymentMethod === 'cash' && \(booking\.status === 'in_progress' \|\| !!booking\.driverId\)/);
  assert.match(source, /MatMove cash-fee reserve return is verified/);
  assert.match(source, /physical cash already handed to the driver must be returned/);
});
