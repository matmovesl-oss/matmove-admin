import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAdmin } from '../server/admin-auth.js';
import { readFile } from 'node:fs/promises';

function token(claims) {
  return 'header.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.signature';
}
function request(accessToken) {
  return { headers: { authorization: `Bearer ${accessToken}` } };
}

test('Admin APIs accept a Supabase-validated password session without requiring AAL2', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const aal1 = token({ sub: userId, role: 'authenticated', aal: 'aal1' });
  let verifiedToken = '';
  let permissionCalls = 0;
  const client = {
    auth: { getUser: async accessToken => {
      verifiedToken = accessToken;
      return { data: { user: { id: userId } }, error: null };
    } },
    rpc: async (name, args) => {
      permissionCalls += 1;
      assert.equal(name, 'matmove_admin_access');
      assert.deepEqual(args, { p_id: userId });
      return { data: { id: userId, is_active: true, removed_at: null, is_owner: true, permissions: [] }, error: null };
    },
  };
  const result = await requireAdmin(request(aal1), ['financials'], { client });
  assert.equal(verifiedToken, aal1);
  assert.equal(permissionCalls, 1);
  assert.equal(result.user.id, userId);
});

test('requireAdmin rejects missing and invalid Supabase sessions before permission lookup', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  let permissionCalls = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: null }, error: new Error('Invalid token signature') }) },
    rpc: async () => { permissionCalls += 1; return { data: null, error: null }; },
  };
  await assert.rejects(requireAdmin({ headers: {} }, ['financials'], { client }), e => e.status === 401);
  await assert.rejects(requireAdmin(request('forged-token'), ['financials'], { client }), e => e.status === 401);
  assert.equal(permissionCalls, 0);
});

test('requireAdmin still enforces active staff membership and exact section assignments', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const aal1 = token({ sub: userId, role: 'authenticated', aal: 'aal1' });
  let row = { id: userId, is_active: true, removed_at: null, is_owner: false, permissions: ['dashboard'] };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    rpc: async () => ({ data: row, error: null }),
  };
  await assert.rejects(requireAdmin(request(aal1), ['financials'], { client }), e => e.status === 403);
  row = { ...row, is_active: false, permissions: ['financials'] };
  await assert.rejects(requireAdmin(request(aal1), ['financials'], { client }), e => e.status === 403);
  row = { ...row, is_active: true, removed_at: '2026-11-13T00:00:00Z' };
  await assert.rejects(requireAdmin(request(aal1), ['financials'], { client }), e => e.status === 403);
});

test('Admin UI no longer renders or imports the mandatory authenticator gate', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /StaffMfaGate/);
  assert.doesNotMatch(app, /mfaToken/);
  assert.match(app, /loadAdminSession\(supabase,session\)/);
  assert.match(app, /access\?\.is_active/);
});

test('Admin API authorization still validates the bearer token and permission RPC', async () => {
  const source = await readFile(new URL('../server/admin-auth.js', import.meta.url), 'utf8');
  assert.match(source, /client\.auth\.getUser\(token\)/);
  assert.match(source, /client\.rpc\('matmove_admin_access'/);
  assert.match(source, /canAdminAccess\(row,key\)/);
  assert.doesNotMatch(source, /aal2|authenticator code|mfa/i);
});
