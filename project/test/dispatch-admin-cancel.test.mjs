import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Dispatch supports cancellation review for unfinished paid and unpaid requests', async () => {
  const source = await readFile(new URL('../src/pages/DispatchRadarPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /'cash_reserve_pending', 'accepted'/);
  assert.match(source, /matmove_admin_cancel_booking/);
  assert.match(source, /booking\.status === 'accepted' \|\| booking\.status === 'cash_reserve_pending'/);
  assert.match(source, /data\.refundStatus === 'refund_pending'/);
  assert.match(source, /Review cancellation \/ refund/);
  assert.match(source, /booking\.paymentStarted/);
});

test('Dispatch shows the durable automatic stale-request investigation queue', async () => {
  const source = await readFile(new URL('../src/pages/DispatchRadarPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /matmove_ride_investigation_tickets/);
  assert.match(source, /Automatic ride investigations/);
  assert.match(source, /Copy request reference/);
});
