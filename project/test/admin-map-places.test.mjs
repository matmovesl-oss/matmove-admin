import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Dispatch Radar provides a permission-gated MatMove Places tab without replacing dispatch operations',async()=>{
 const [page,app]=await Promise.all([
  readFile(new URL('../src/pages/DispatchRadarPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/App.tsx',import.meta.url),'utf8')
 ]);
 assert.match(app,/path="\/dispatch" element=\{<Gate access=\{access\} section="dispatch"/);
 assert.match(page,/activeTab==='places'\?<AdminMapPlacesManager\/>/);
 assert.match(page,/Dispatch Radar/);
 assert.match(page,/MatMove Places/);
 assert.match(page,/StaleRideTickets/);
 assert.match(page,/AdminTripReview/);
});

test('Admin MatMove place directory uses the dispatch-authorized versioned Supabase RPC',async()=>{
 const [page,access]=await Promise.all([
  readFile(new URL('../src/components/AdminMapPlacesManager.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/lib/adminAccess.tsx',import.meta.url),'utf8')
 ]);
 assert.match(page,/matmove_admin_map_places/);
 assert.match(page,/p_actor:actor/);
 assert.match(page,/p_action:'list'/);
 assert.match(page,/p_action:'save'/);
 assert.match(page,/p_action:'delete'/);
 assert.match(page,/p_expected:draft\.version/);
 assert.match(page,/latitude/);
 assert.match(page,/longitude/);
 assert.match(page,/country_code/);
 assert.match(page,/Publish in customer place search/);
 assert.match(access,/dispatch/);
});
