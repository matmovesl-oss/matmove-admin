import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Dispatch supports cancellation review for unfinished paid and unpaid requests', async () => {
  const source = await readFile(new URL('../src/pages/DispatchRadarPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /'cash_reserve_pending', 'cash_review_required', 'accepted'/);
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
  assert.match(source, /const cancelable = mutable && !\(booking\.paymentMethod === 'cash' && \(booking\.status === 'in_progress' \|\| !!booking\.driverId\)\)/);
  assert.match(source, /A driver is linked to this cash request/);
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

test('Admin can open the cancellation workflow for quarantined requests without bypassing uncertain cash ledgers',async()=>{
 const dispatch=await readFile(new URL('../src/pages/DispatchRadarPage.tsx',import.meta.url),'utf8');
 const review=await readFile(new URL('../src/components/AdminTripReview.tsx',import.meta.url),'utf8');
 assert.match(dispatch,/cash_review_required/);
 assert.match(review,/cash_review_required/);
 assert.match(review,/cashPayment\?\.status!=='review_required'/);
});

test('Admin can flag an uncollected cash fare without treating the MatMove fee reserve as fare payment',async()=>{
 const review=await readFile(new URL('../src/components/AdminTripReview.tsx',import.meta.url),'utf8');
 assert.match(review,/canFlagUnpaid/);
 assert.match(review,/cashPayment\.status==='collection_pending'/);
 assert.match(review,/Flag unpaid cash fare/);
 assert.match(review,/no cash receipt or payout is marked complete/);
});

test('Dispatch cards include a compact route map and selected-trip map sits beside its details on desktop',async()=>{
 const dispatch=await readFile(new URL('../src/pages/DispatchRadarPage.tsx',import.meta.url),'utf8');
 const review=await readFile(new URL('../src/components/AdminTripReview.tsx',import.meta.url),'utf8');
 assert.match(dispatch,/pickupPin: \{lat:number;lng:number\} \| null/);
 assert.match(dispatch,/function DispatchMiniMap/);
 assert.match(dispatch,/<DispatchMiniMap pickupPin=\{b\.pickupPin\} destinationPin=\{b\.destinationPin\}\s*\/>/);
 assert.match(dispatch,/md:grid-cols-\[minmax\(0,0\.85fr\)_minmax\(0,1\.15fr\)\]/);
 assert.match(review,/lg:grid-cols-\[minmax\(0,1\.1fr\)_minmax\(300px,\.9fr\)\]/);
 assert.match(review,/lg:sticky lg:top-4/);
});

test('Admin offers an audited 50/5/45 settlement for in-progress digital rides',async()=>{
 const dispatch=await readFile(new URL('../src/pages/DispatchRadarPage.tsx',import.meta.url),'utf8');
 const review=await readFile(new URL('../src/components/AdminTripReview.tsx',import.meta.url),'utf8');
 assert.match(dispatch,/Review uncompleted · 50\/5\/45/);
 assert.match(dispatch,/50% refunded to the customer, 5% awarded to the assigned driver and 45% allocated to MatMove/);
 assert.match(review,/50\/5\/45 settlement/);
 assert.match(review,/Customer refund \(50%\)/);
 assert.match(review,/Assigned driver award \(5%\)/);
 assert.match(review,/MatMove platform share \(45%\)/);
 assert.match(review,/physical cash return verification/);
});

test('Admin uncompleted ride screen explains the verified 50/5/45 settlement',async()=>{
 const review=await readFile(new URL('../src/components/AdminTripReview.tsx',import.meta.url),'utf8');
 assert.match(review,/50\/5\/45 settlement/);
 assert.match(review,/Customer refund \(50%\)/);
 assert.match(review,/Assigned driver award \(5%\)/);
 assert.match(review,/MatMove platform share \(45%\)/);
 assert.match(review,/provider-verified/);
});
