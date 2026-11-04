import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/admin-wallet-balances.js';

const actor = '11111111-1111-4111-8111-111111111111';
const access = { id: actor, is_owner: true, is_active: true, permissions: [] };
const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
  MONIME_API_KEY: 'fixture-provider',
  MONIME_SPACE_ID: 'fixture-space',
  MONIME_ESCROW_ACCOUNT_ID: 'fac-escrow',
  MONIME_PLATFORM_FEE_ACCOUNT_ID: 'fac-fee',
  MONIME_SPIN_ACCOUNT_ID: 'fac-spin',
  MONIME_MAIN_ACCOUNT_ID: 'fac-main',
  MONIME_REFERRAL_ACCOUNT_ID: 'fac-referral',
};

function account(id) {
  return { id, currency: 'SLE', balance: { available: { currency: 'SLE', value: 1000 } } };
}
function response() {
  return {
    headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
function fixture(pages) {
  const calls = [];
  const client = {
    auth: { getUser: async token => ({ data: { user: { id: actor } }, error: token ? null : new Error('missing') }) },
    rpc: async (name, args) => {
      assert.equal(name, 'matmove_admin_access');
      assert.equal(args.p_id, actor);
      return { data: access, error: null };
    },
    from(table) {
      assert.equal(table, 'matmove_referral_campaign');
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: { treasury_account: 'fac-pinned-referral' }, error: null }),
      };
      return query;
    },
  };
  let page = 0;
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options });
    const current = pages[page++];
    return { ok: true, status: 200, json: async () => current };
  };
  const handler = createHandler(() => client, fetcher, env);
  return {
    calls,
    async run() {
      const res = response();
      await handler({ method: 'GET', headers: { authorization: 'Bearer fixture-token' } }, res);
      return res;
    },
  };
}

test('balance pagination merges distinct provider accounts across pages', async () => {
  const f = fixture([
    { success: true, result: [account('fac-customer-one')], pagination: { next: 'page-two' } },
    { success: true, result: [account('fac-customer-two')], pagination: {} },
  ]);
  const res = await f.run();
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.accounts.map(row => row.id), ['fac-customer-one', 'fac-customer-two']);
  assert.match(f.calls[1].url, /after=page-two/);
});

test('duplicate provider account IDs across pages reject the complete balance list', async () => {
  const f = fixture([
    { success: true, result: [account('fac-customer-one')], pagination: { next: 'page-two' } },
    { success: true, result: [account('fac-customer-one')], pagination: {} },
  ]);
  const res = await f.run();
  assert.equal(res.code, 502);
  assert.equal(res.body.accounts, undefined);
  assert.match(res.body.error, /duplicate financial account/i);
});

test('repeated provider cursor rejects the complete balance list', async () => {
  const f = fixture([
    { success: true, result: [account('fac-customer-one')], pagination: { next: 'repeat' } },
    { success: true, result: [account('fac-customer-two')], pagination: { next: 'repeat' } },
  ]);
  const res = await f.run();
  assert.equal(res.code, 502);
  assert.equal(res.body.accounts, undefined);
  assert.match(res.body.error, /repeated a cursor/i);
});

test('reaching the account-page safety cap rejects rather than returning partial totals', async () => {
  const pages = Array.from({ length: 100 }, (_, index) => ({
    success: true,
    result: [account('fac-customer-' + index)],
    pagination: { next: 'cursor-' + (index + 1) },
  }));
  const f = fixture(pages);
  const res = await f.run();
  assert.equal(f.calls.length, 100);
  assert.equal(res.code, 502);
  assert.equal(res.body.accounts, undefined);
  assert.match(res.body.error, /safety limit/i);
});

test('malformed account entries reject the complete balance list', async () => {
  const f = fixture([{ success: true, result: [{ currency: 'SLE' }], pagination: {} }]);
  const res = await f.run();
  assert.equal(res.code, 502);
  assert.equal(res.body.accounts, undefined);
});
