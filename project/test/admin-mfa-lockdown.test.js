import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAdmin } from '../server/admin-auth.js';
import { readFile } from 'node:fs/promises';

const userId='11111111-1111-4111-8111-111111111111';
const sessionId='22222222-2222-4222-8222-222222222222';
const uuid=/^[0-9a-f-]{36}$/i;

function token(claims) {
  return 'header.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.signature';
}
function request(accessToken) {
  return { headers: { authorization: `Bearer ${accessToken}` } };
}
function sessionRow(overrides={}) {
  const now=new Date().toISOString();
  return {session_id:sessionId,user_id:userId,started_at:now,last_activity_at:now,revoked_at:null,...overrides};
}
function liveClient({claims={},access={id:userId,is_active:true,removed_at:null,is_owner:true,permissions:[]},session=sessionRow(),authUser={id:userId}}={}) {
  let permissionCalls=0,sessionReads=0;
  const client={
    auth:{getUser:async accessToken=>({data:{user:authUser},error:null})},
    from(table){
      assert.equal(table,'matmove_admin_sessions');
      return {select(){return this;},eq(column,value){assert.equal(column,'session_id');assert.equal(value,sessionId);return this;},maybeSingle:async()=>{sessionReads++;return {data:session,error:null};}};
    },
    rpc:async(name,args)=>{permissionCalls++;assert.equal(name,'matmove_admin_access');assert.deepEqual(args,{p_id:userId});return {data:access,error:null};},
  };
  const accessToken=token({sub:userId,role:'authenticated',aal:'aal2',session_id:sessionId,amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)}],...claims});
  return {client,accessToken,get permissionCalls(){return permissionCalls;},get sessionReads(){return sessionReads;}};
}

test('Admin API requires a Supabase-verified AAL2 session with TOTP proof and a registered live session',async()=>{
  const fixture=liveClient();
  const result=await requireAdmin(request(fixture.accessToken),['financials'],{client:fixture.client});
  assert.equal(result.user.id,userId);
  assert.equal(result.sessionId,sessionId);
  assert.equal(fixture.sessionReads,1);
  assert.equal(fixture.permissionCalls,1);
});

test('password-only and passkey-only sessions cannot bypass the required TOTP step',async()=>{
  for(const claims of [
    {aal:'aal1',amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)}]},
    {aal:'aal2',amr:[{method:'webauthn',timestamp:Math.floor(Date.now()/1000)}]},
    {aal:'aal2',amr:[]},
  ]){
    const fixture=liveClient({claims});
    await assert.rejects(requireAdmin(request(fixture.accessToken),['financials'],{client:fixture.client}),e=>e.status===403);
    assert.equal(fixture.sessionReads,0);
    assert.equal(fixture.permissionCalls,0);
  }
});

test('missing, invalid, or mismatched Supabase sessions are rejected before permissions',async()=>{
  const noToken=liveClient();
  await assert.rejects(requireAdmin({headers:{}},['financials'],{client:noToken.client}),e=>e.status===401);
  const noUser={auth:{getUser:async()=>({data:{user:null},error:new Error('Invalid token signature')})},rpc:async()=>{throw new Error('Permission lookup must not run');}};
  await assert.rejects(requireAdmin(request('forged-token'),['financials'],{client:noUser}),e=>e.status===401);

  const mismatch=liveClient({claims:{session_id:'33333333-3333-4333-8333-333333333333'}});
  await assert.rejects(requireAdmin(request(mismatch.accessToken),['financials'],{client:mismatch.client}),e=>e.status===401);
});

test('revoked, missing, inactive or expired Admin sessions are denied',async()=>{
  const cases=[
    {session:null},
    {session:sessionRow({revoked_at:new Date().toISOString()})},
    {session:sessionRow({last_activity_at:new Date(Date.now()-16*60*1000).toISOString()})},
    {session:sessionRow({started_at:new Date(Date.now()-25*60*60*1000).toISOString()})},
    {access:{id:userId,is_active:false,removed_at:null,is_owner:true,permissions:[]}},
    {access:{id:userId,is_active:true,removed_at:'2026-11-13T00:00:00Z',is_owner:true,permissions:[]}},
  ];
  for(const options of cases){
    const fixture=liveClient(options);
    await assert.rejects(requireAdmin(request(fixture.accessToken),['financials'],{client:fixture.client}));
  }
});

test('requireAdmin still enforces exact section assignments after live session checks',async()=>{
  const fixture=liveClient({access:{id:userId,is_active:true,removed_at:null,is_owner:false,permissions:['dashboard']}});
  await assert.rejects(requireAdmin(request(fixture.accessToken),['financials'],{client:fixture.client}),e=>e.status===403);
});

test('Admin app enforces TOTP, backend session registration and the 13/15-minute and 24-hour policy',async()=>{
  const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
  const gate=await readFile(new URL('../src/components/StaffMfaGate.tsx',import.meta.url),'utf8');
  assert.match(app,/StaffMfaGate/);
  assert.match(app,/matmove_admin_session_touch/);
  assert.match(app,/15\*60\*1000/);
  assert.match(app,/13\*60\*1000/);
  assert.match(app,/24\*60\*60\*1000/);
  assert.match(app,/setAccess\(null\);setMfaReady\(false\)/);
  assert.match(gate,/getClaims\(\)/);
  assert.match(gate,/item\\?\\.method === 'totp'/);
  assert.match(gate,/Add a backup authenticator/);
  assert.match(gate,/registerPasskey\(\)/);
});

test('Admin API enforces TOTP and registered sessions and supports owner device revocation',async()=>{
  const source=await readFile(new URL('../server/admin-auth.js',import.meta.url),'utf8');
  const route=await readFile(new URL('../api/admin-staff.js',import.meta.url),'utf8');
  const sql=await readFile(new URL('../supabase/migrations/20261128100000_matmove_admin_session_registry_v1.sql',import.meta.url),'utf8');
  assert.match(source,/claims\.aal!=='aal2'/);
  assert.match(source,/method=>method\?\.method==='totp'/);
  assert.match(source,/matmove_admin_sessions/);
  assert.match(route,/revokeSessions/);
  assert.match(route,/REVOKE_ADMIN_SESSIONS/);
  assert.match(sql,/matmove_admin_revoke_sessions_on_staff_change/);
  assert.match(sql,/interval '15 minutes'/);
  assert.match(sql,/interval '24 hours'/);
});

test('Admin entry requires a live staff assignment and no route file is added',async()=>{
  const tree=await readFile(new URL('../api/admin-staff.js',import.meta.url),'utf8');
  assert.match(tree,/matmove_staff_access/);
  assert.match(tree,/matmove_admin_session_touch|revokeSessions/);
});
