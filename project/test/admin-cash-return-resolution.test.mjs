import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const review=readFileSync(new URL('../src/components/AdminTripReview.tsx',import.meta.url),'utf8');
test('Admin requests physical cash return confirmation before cancelling driver-linked cash rides',()=>{
 assert.match(review,/matmove_admin_request_cash_return/);
 assert.match(review,/Request physical cash return confirmation/);
 assert.match(review,/cashReturnReady/);
 assert.match(review,/Both parties confirmed physical cash return/);
});
