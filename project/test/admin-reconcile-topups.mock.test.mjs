import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/admin-reconcile-topups.js';

const actorId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const walletId = '33333333-3333-4333-8333-333333333333';
const paymentId = '44444444-4444-4444-8444-444444444444';
const sessionId = 'scs-test-checkout-session-001';
const customerAccountId = 'fac-customer-wallet';
const platformAccountId = 'fac-platform-settlement';

function payment(overrides = {}) {
  return {
    id: paymentId,
    user_id: userId,
    wallet_id: walletId,
    provider_reference: sessionId,
    amount: '1.00',
    currency: 'SLE',
    status: 'pending',
    provider: 'monime',
    initiated_at: '2026-09-12T13:45:14.285Z',
    updated_at: '2026-09-12T13:45:15.283Z',
    provider_response: { result: { id: sessionId } },
    ...overrides,
  };
}

function wallet(overrides = {}) {
  return {
    id: walletId,
    user_id: userId,
    currency: 'SLE',
    monime_account_id: customerAccountId,
    metadata: {},
    ...overrides,
  };
}

function checkoutSession(overrides = {}) {
  return {
    id: sessionId,
    status: 'pending',
    financialAccountId: platformAccountId,
    metadata: {
      payment_transaction_id: paymentId,
      wallet_id: walletId,
      matmove_user_id: userId,
      amount: '1',
      currency: 'SLE',
    },
    lineItems: {
      data: [{
        id: 'lit-test-001',
        reference: paymentId,
        quantity: 1,
        price: { value: 100, currency: 'SLE' },
      }],
    },
    ...overrides,
  };
}

function response() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function fixture({ payments = [payment()], wallets = [wallet()], session = checkoutSession(), providerError = null } = {}) {
  const calls = [];
  const mutations = [];
  const reads = [];
  const client = {
    from(table) {
      let filters = [];
      let limit = null;
      const builder = {
        select(columns) { reads.push({ table, columns }); return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        order() { return this; },
        limit(value) { limit = value; return this; },
        in(key, values) { filters.push([key, values]); return this; },
        insert() { mutations.push({ table, action: 'insert' }); throw new Error('Read-only endpoint attempted insert'); },
        update() { mutations.push({ table, action: 'update' }); throw new Error('Read-only endpoint attempted update'); },
        delete() { mutations.push({ table, action: 'delete' }); throw new Error('Read-only endpoint attempted delete'); },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            let data = table === 'payment_transactions' ? payments : table === 'wallets' ? wallets : [];
            for (const [key, value] of filters) {
              data = data.filter(row => Array.isArray(value) ? value.includes(row[key]) : row[key] === value);
            }
            return { data: limit == null ? data : data.slice(0, limit), error: null };
          }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const authorize = async (_req, keys, { env }) => {
    assert.deepEqual(keys, ['financials', 'transactions']);
    assert.equal(env.MONIME_SPACE_ID, 'fixture-space');
    return {
      client,
      user: { id: actorId },
      access: { id: actorId, is_owner: true, is_active: true, permissions: ['financials', 'transactions'] },
    };
  };
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options });
    if (providerError) {
      if (providerError === 'network') throw new Error('offline');
      return { ok: false, status: providerError === 'not_found' ? 404 : 503, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, result: session }),
    };
  };
  const env = { MONIME_API_KEY: 'fixture-api-key', MONIME_SPACE_ID: 'fixture-space' };
  const handler = createHandler({ authorize, env, fetcher });
  return {
    calls, mutations, reads, handler,
    async run(req = { method: 'GET', query: { limit: '20' }, headers: {} }) {
      const res = response();
      await handler(req, res);
      return res;
    },
  };
}

test('completed checkout session is read and flagged for settlement review, never auto-updated', async () => {
  const f = fixture({ session: checkoutSession({ status: 'completed' }) });
  const res = await f.run();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.readOnly, true);
  assert.equal(res.body.updatesApplied, 0);
  assert.equal(res.body.checked, 1);
  const finding = res.body.findings[0];
  assert.equal(finding.providerStatus, 'completed');
  assert.equal(finding.identityMatches, true);
  assert.equal(finding.walletReferenceMatches, true);
  assert.equal(finding.amountMatches, true);
  assert.equal(finding.settlementTarget, 'different_from_customer_wallet');
  assert.equal(finding.finding, 'provider_completed_but_settlement_target_needs_review');
  assert.equal(finding.safeToAutoUpdate, false);
  assert.match(f.calls[0].url, new RegExp('/checkout-sessions/' + sessionId));
  assert.equal(f.calls[0].options.method, 'GET');
  assert.equal(f.calls[0].options.headers['Monime-Space-Id'], 'fixture-space');
  assert.deepEqual(f.mutations, []);
});

test('checkout session completed directly to the customer wallet is classified separately', async () => {
  const f = fixture({ session: checkoutSession({
    status: 'completed',
    financialAccountId: customerAccountId,
  }) });
  const res = await f.run();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.findings[0].finding, 'provider_completed_to_customer_wallet');
  assert.equal(res.body.findings[0].settlementTarget, 'customer_wallet');
  assert.equal(res.body.findings[0].safeToAutoUpdate, false);
  assert.deepEqual(f.mutations, []);
});

test('cancelled and expired checkout sessions are classified only when identity and amount match', async () => {
  for (const status of ['cancelled', 'expired']) {
    const f = fixture({ session: checkoutSession({ status }) });
    const res = await f.run();
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.findings[0].providerStatus, status);
    assert.equal(res.body.findings[0].finding, 'provider_' + status);
    assert.equal(res.body.findings[0].safeToAutoUpdate, false);
  }
});

test('amount mismatch or metadata identity mismatch remains review_required', async () => {
  const amountMismatch = fixture({ session: checkoutSession({
    metadata: { ...checkoutSession().metadata, amount: '2' },
  }) });
  const amountRes = await amountMismatch.run();
  assert.equal(amountRes.body.findings[0].amountMatches, false);
  assert.equal(amountRes.body.findings[0].finding, 'review_required');

  const identityMismatch = fixture({ session: checkoutSession({
    metadata: { ...checkoutSession().metadata, wallet_id: '99999999-9999-4999-8999-999999999999' },
  }) });
  const identityRes = await identityMismatch.run();
  assert.equal(identityRes.body.findings[0].identityMatches, false);
  assert.equal(identityRes.body.findings[0].finding, 'review_required');
});

test('wrong local wallet owner or currency cannot be treated as a matching customer wallet', async () => {
  for (const invalidWallet of [
    wallet({ user_id: '99999999-9999-4999-8999-999999999999' }),
    wallet({ currency: 'USD' }),
  ]) {
    const f = fixture({ wallets: [invalidWallet], session: checkoutSession({ status: 'completed' }) });
    const res = await f.run();
    assert.equal(res.body.findings[0].walletReferenceMatches, false);
    assert.equal(res.body.findings[0].finding, 'review_required');
    assert.deepEqual(f.mutations, []);
  }
});

test('invalid or mismatched local checkout reference is not sent to Monime', async () => {
  const f = fixture({ payments: [payment({
    provider_reference: 'not-a-checkout-session',
    provider_response: { result: { id: 'not-a-checkout-session' } },
  })] });
  const res = await f.run();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.findings[0].finding, 'invalid_or_unmatched_local_provider_reference');
  assert.equal(f.calls.length, 0);
  assert.equal(res.body.updatesApplied, 0);
});

test('provider not-found and network errors are returned as review findings, not payment updates', async () => {
  for (const providerError of ['not_found', 'network']) {
    const f = fixture({ providerError });
    const res = await f.run();
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.findings[0].finding, providerError === 'not_found' ? 'provider_session_not_found' : 'provider_unavailable');
    assert.equal(res.body.updatesApplied, 0);
    assert.deepEqual(f.mutations, []);
  }
});

test('invalid limits and non-GET methods are rejected', async () => {
  const f = fixture();
  const methodRes = await f.run({ method: 'POST', headers: {} });
  assert.equal(methodRes.statusCode, 405);
  assert.equal(f.calls.length, 0);

  const limitRes = await f.run({ method: 'GET', query: { limit: '26' }, headers: {} });
  assert.equal(limitRes.statusCode, 400);
  assert.equal(f.calls.length, 0);
});
