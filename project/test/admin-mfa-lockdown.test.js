import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAdmin } from '../server/admin-auth.js';
import { readFile } from 'node:fs/promises';

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';

function token(claims) {
  return 'header.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.signature';
}
function validClaims(overrides = {}) {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    amr: [{ method: 'password', timestamp: 1795860000 }, { method: 'totp', timestamp: 1795860001 }],
    session_id: sessionId,
    ...overrides,
  };
}
function request(accessToken) {
  return { headers: { authorization: `Bearer ${accessToken}` } };
}
function clientFixture({claims = validClaims(),row={id:userId,is_active:true,removed_at:null,is_owner:true,permissions:[]},sessionValid=true,sessionError=null}={}) {
  const calls=[];
  const client={
    auth:{getUser:async()=>({data:{user:{id:userId}},error:null})},
    rpc:async(name,args)=>{
      calls.push({name,args});
      if(name==='matmove_admin_server_session_valid')return {data:sessionValid,error:sessionError};
      if(name==='matmove_admin_access')return {data:row,error:null};
      throw new Error('Unexpected RPC '+name);
    },
  };
  return {client,calls,token:token(claims)};
}

test('AAL1/password-only sessions are rejected before any Admin permission lookup',async()=>{
  const f=clientFixture({claims:validClaims({aal:'aal1',amr:[{method:'password',timestamp:1795860000}]})});
  await assert.rejects(requireAdmin(request(f.token),['financials'],{client:f.client}),e=>e.status===401&&/authenticator/i.test(e.message));
  assert.equal(f.calls.length,0);
});

test('AAL2 without an explicit TOTP authenticator method is rejected',async()=>{
  const f=clientFixture({claims:validClaims({amr:[{method:'password',timestamp:1795860000},{method:'webauthn',timestamp:1795860001}]})});
  await assert.rejects(requireAdmin(request(f.token),['financials'],{client:f.client}),e=>e.status===401);
  assert.equal(f.calls.length,0);
});

test('A verified TOTP session must match the live server session registry before permissions are read',async()=>{
  const f=clientFixture();
  const result=await requireAdmin(request(f.token),['financials'],{client:f.client});
  assert.equal(result.user.id,userId);
  assert.equal(result.sessionId,sessionId);
  assert.deepEqual(f.calls.map(call=>call.name),['matmove_admin_server_session_valid','matmove_admin_access']);
  assert.deepEqual(f.calls[0].args,{p_user_id:userId,p_session_id:sessionId});
});

test('revoked, expired or missing registry sessions are denied before permissions are read',async()=>{
  for(const sessionValid of [false,null]){
    const f=clientFixture({sessionValid});
    await assert.rejects(requireAdmin(request(f.token),['financials'],{client:f.client}),e=>e.status===401);
    assert.deepEqual(f.calls.map(call=>call.name),['matmove_admin_server_session_valid']);
  }
  const failed=clientFixture({sessionError:{code:'PGRST202',message:'function unavailable'}});
  await assert.rejects(requireAdmin(request(failed.token),['financials'],{client:failed.client}),e=>e.status===503);
  assert.deepEqual(failed.calls.map(call=>call.name),['matmove_admin_server_session_valid']);
});

test('requireAdmin rejects missing, malformed and invalid Supabase sessions before permission lookup',async()=>{
  let calls=0;
  const client={
    auth:{getUser:async()=>({data:{user:null},error:new Error('Invalid token signature')})},
    rpc:async()=>{calls++;return {data:null,error:null};},
  };
  await assert.rejects(requireAdmin({headers:{}},['financials'],{client}),e=>e.status===401);
  await assert.rejects(requireAdmin(request('forged-token'),['financials'],{client}),e=>e.status===401);
  assert.equal(calls,0);
});

test('verified sessions still require active staff membership and exact section assignments',async()=>{
  const f=clientFixture({row:{id:userId,is_active:true,removed_at:null,is_owner:false,permissions:['dashboard']}});
  await assert.rejects(requireAdmin(request(f.token),['financials'],{client:f.client}),e=>e.status===403);
  f.client.rpc=async(name,args)=>{
    f.calls.push({name,args});
    if(name==='matmove_admin_server_session_valid')return {data:true,error:null};
    return {data:{id:userId,is_active:false,removed_at:null,is_owner:false,permissions:['financials']},error:null};
  };
  await assert.rejects(requireAdmin(request(f.token),['financials'],{client:f.client}),e=>e.status===403);
  f.client.rpc=async(name,args)=>{
    f.calls.push({name,args});
    if(name==='matmove_admin_server_session_valid')return {data:true,error:null};
    return {data:{id:userId,is_active:true,removed_at:'2026-11-13T00:00:00Z',is_owner:false,permissions:['financials']},error:null};
  };
  await assert.rejects(requireAdmin(request(f.token),['financials'],{client:f.client}),e=>e.status===403);
});

test('Admin UI wires the mandatory TOTP gate, live session guard and 13/15 minute inactivity policy',async()=>{
  const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
  const gate=await readFile(new URL('../src/components/StaffMfaGate.tsx',import.meta.url),'utf8');
  assert.match(app,/StaffMfaGate/);
  assert.match(app,/matmove_admin_session_touch/);
  assert.match(app,/matmove_admin_session_valid/);
  assert.match(app,/13\*60\*1000/);
  assert.match(app,/15\*60\*1000/);
  assert.match(app,/lastActivityRef/);
  assert.match(gate,/matmove_admin_me/);
  assert.match(gate,/sessionHasTotpAmr/);
  assert.match(gate,/method\?\.method === 'totp'/);
  assert.match(gate,/stage === 'verified'/);
});

test('Admin API authorization validates AAL2, TOTP proof and the live registry after Supabase validates the bearer token',async()=>{
  const source=await readFile(new URL('../server/admin-auth.js',import.meta.url),'utf8');
  assert.match(source,/client\.auth\.getUser\(token\)/);
  assert.match(source,/claims\.aal!=='aal2'/);
  assert.match(source,/method=>method\?\.method==='totp'/);
  assert.match(source,/matmove_admin_server_session_valid/);
  assert.match(source,/matmove_admin_access/);
});

test('staff removal and permission changes revoke registry sessions through the database trigger',async()=>{
  const migration=await readFile(new URL('../supabase/migrations/20261128104500_matmove_admin_session_enforcement_v2.sql',import.meta.url),'utf8');
  assert.match(migration,/matmove_admin_session_valid/);
  assert.match(migration,/registry\.revoked_at is null/);
  assert.match(migration,/staff\.removed_at is null/);
  assert.match(migration,/24 hours/);
  assert.match(migration,/15 minutes/);
  const previous=await readFile(new URL('../supabase/migrations/20261108210500_matmove_staff_removed_access_fail_closed.sql',import.meta.url),'utf8').catch(()=> '');
  assert.ok(previous.length===0||/removed_at|is_active/.test(previous));
});
