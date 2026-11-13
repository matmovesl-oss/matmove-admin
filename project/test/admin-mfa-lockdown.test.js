import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hasVerifiedAal2Token, requireAdmin } from '../server/admin-auth.js';

function token(claims) {
  return 'header.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.signature';
}

test('Admin server authorization accepts only a verified AAL2 authenticated user token', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  assert.equal(hasVerifiedAal2Token(token({ sub: userId, role: 'authenticated', aal: 'aal2' }), userId), true);
  assert.equal(hasVerifiedAal2Token(token({ sub: userId, role: 'authenticated', aal: 'aal1' }), userId), false);
  assert.equal(hasVerifiedAal2Token(token({ sub: '22222222-2222-4222-8222-222222222222', role: 'authenticated', aal: 'aal2' }), userId), false);
  assert.equal(hasVerifiedAal2Token(token({ sub: userId, role: 'service_role', aal: 'aal2' }), userId), false);
  assert.equal(hasVerifiedAal2Token('not-a-jwt', userId), false);
});


function request(accessToken) {
  return { headers: { authorization: `Bearer ${accessToken}` } };
}

test('requireAdmin validates the Supabase session and rejects AAL1 before querying staff permissions', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const aal1 = token({ sub: userId, role: 'authenticated', aal: 'aal1' });
  let permissionCalls = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    rpc: async () => { permissionCalls += 1; return { data: null, error: null }; },
  };

  await assert.rejects(
    requireAdmin(request(aal1), ['financials'], { client }),
    error => error.status === 403
  );
  assert.equal(permissionCalls, 0);
});

test('requireAdmin rejects an unvalidated AAL2-looking token before permission lookup', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const forged = token({ sub: userId, role: 'authenticated', aal: 'aal2' });
  let permissionCalls = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: null }, error: new Error('Invalid token signature') }) },
    rpc: async () => { permissionCalls += 1; return { data: null, error: null }; },
  };

  await assert.rejects(
    requireAdmin(request(forged), ['financials'], { client }),
    error => error.status === 401
  );
  assert.equal(permissionCalls, 0);
});

test('requireAdmin checks staff permissions only after Supabase validates an AAL2 user token', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const aal2 = token({ sub: userId, role: 'authenticated', aal: 'aal2' });
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
      return { data: { id: userId, is_active: true, is_owner: true, permissions: [] }, error: null };
    },
  };

  const result = await requireAdmin(request(aal2), ['financials'], { client });
  assert.equal(verifiedToken, aal2);
  assert.equal(permissionCalls, 1);
  assert.equal(result.user.id, userId);
});

test('Admin UI gates active staff behind TOTP enrollment or challenge', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const gate = await readFile(new URL('../src/components/StaffMfaGate.tsx', import.meta.url), 'utf8');
  assert.match(app, /StaffMfaGate/);
  assert.match(app, /mfaToken!==session\.access_token/);
  assert.match(gate, /mfa\.enroll/);
  assert.match(gate, /mfa\.challenge/);
  assert.match(gate, /mfa\.verify/);
  assert.match(gate, /Your authenticator setup has started/);
  assert.match(gate, /Prepare verification challenge/);
  assert.match(gate, /setChallengeId\(''\);\s*setStage\('setup'\);/);
  assert.match(gate, /challengeId \?/);
  assert.match(gate, /currentLevel === 'aal2'/);
  assert.doesNotMatch(gate, /Skip|Continue without/i);
});

test('Protected Admin server APIs reject AAL1 before loading staff permissions', async () => {
  const source = await readFile(new URL('../server/admin-auth.js', import.meta.url), 'utf8');
  assert.match(source, /hasVerifiedAal2Token/);
  assert.match(source, /Verify your Admin authenticator code/);
  assert.ok(source.indexOf('hasVerifiedAal2Token(token') < source.indexOf("client.rpc('matmove_admin_access'"));
});

test('AAL2 database migration protects both permission helpers and owner-only RPCs', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20261112135000_matmove_admin_aal2_staff_lockdown.sql', import.meta.url),
    'utf8'
  );
  assert.match(sql, /auth\.jwt\(\)->>'aal'.*'aal2'/s);
  for (const name of [
    'is_admin',
    'matmove_admin_can',
    'matmove_notification_sender',
    'matmove_admin_account_deletion_requests',
    'matmove_admin_audit_feed',
    'matmove_admin_bulk_update_role',
    'matmove_admin_restore_customer_role',
    'matmove_admin_set_staff_role'
  ]) assert.match(sql, new RegExp('create or replace function public\\.' + name));
  assert.match(sql, /matmove_admin_require_aal2/);
  assert.match(sql, /matmove_admin_me\(\)/);
  assert.match(sql, /after the Admin MFA UI has been deployed and all active staff have/);
});


test('dispatch SECURITY DEFINER RPC actor helper explicitly requires AAL2', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261112135000_matmove_admin_aal2_staff_lockdown.sql', import.meta.url), 'utf8');
  const dispatch = migration.slice(
    migration.indexOf('create or replace function public.matmove_dispatch_actor'),
    migration.indexOf('create or replace function public.matmove_admin_account_deletion_requests')
  );
  assert.match(dispatch, /matmove_admin_require_aal2\(\)/);
  assert.match(dispatch, /matmove_admin_can\('dispatch'\)/);
  assert.match(dispatch, /removed_at is null/);
});
