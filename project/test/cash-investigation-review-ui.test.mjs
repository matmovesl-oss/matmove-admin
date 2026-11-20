import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('admin cash investigation distinguishes verified refunds from unresolved cash handovers', async () => {
  const review = await readFile('src/components/AdminTripReview.tsx', 'utf8');
  assert.ok(review.includes('provider has not confirmed the receipt yet'));
  assert.ok(review.includes('Do not issue a second refund'));
  assert.ok(review.includes('driver and customer must both confirm the return'));
  assert.ok(review.includes('Awaiting cash reconciliation'));
  assert.ok(review.includes('Check refund status'));
  assert.ok(review.includes('Refund MatMove fee reserve'));
});
