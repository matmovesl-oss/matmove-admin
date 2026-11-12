import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hasVerifiedAal2Token } from '../server/admin-auth.js';

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

test('Admin UI gates active staff behind TOTP enrollment or challenge', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const gate = await readFile(new URL('../src/components/StaffMfaGate.tsx', import.meta.url), 'utf8');
  assert.match(app, /StaffMfaGate/);
  assert.match(app, /mfaToken!==session\.access_token/);
  assert.match(gate, /mfa\.enroll/);
  assert.match(gate, /mfa\.challenge/);
  assert.match(gate, /mfa\.verify/);
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
