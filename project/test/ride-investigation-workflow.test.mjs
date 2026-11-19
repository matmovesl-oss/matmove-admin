import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page=readFileSync(new URL('../src/pages/DispatchRadarPage.tsx',import.meta.url),'utf8');
const review=readFileSync(new URL('../src/components/AdminTripReview.tsx',import.meta.url),'utf8');
test('stale investigation tickets open full trip investigation rather than only copying the UUID',()=>{
 assert.match(page,/Open full investigation/);
 assert.match(page,/onOpen=\{\(id\)=>\{setSelected\(''\);setSearchedTrip\(id\)/);
 assert.match(page,/AdminTripReview key=\{\x60\$\{access!\.id\}:\$\{searchedTrip\}\x60\}/);
});
test('Admin trip review exposes payment state and an explicit audited action surface',()=>{
 assert.match(review,/paymentMethod/);
 assert.match(review,/Flag unpaid request/);
 assert.match(review,/Cancel request and verify refund/);
 assert.match(review,/matmove_admin_flag_unpaid_ride/);
 assert.match(review,/matmove_admin_cancel_booking/);
 assert.match(review,/Trip locations/);
 assert.match(review,/\['Requested vehicle',safe\.vehicleType\],\[\"Driver's registered vehicle\",safe\.driver\?\.vehicleType\]/);
 assert.match(review,/Pickup and destination details are saved/);
});
test('dispatch investigation and selected request open in a full-height accessible side drawer',()=>{
 assert.match(page,/aria-label=\"Full ride investigation\"/);
 assert.match(page,/h-\[100dvh\]/);
 assert.match(page,/max-w-5xl/);
});
