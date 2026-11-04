import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/admin-pay-staff.js';

const actorId = '11111111-1111-4111-8111-111111111111';
const staffId = '22222222-2222-4222-8222-222222222222';
const walletId = '33333333-3333-4333-8333-333333333333';
const requestKey = '44444444-4444-4444-8444-444444444444';
const sourceId = 'fac-payroll-source';
const destinationId = 'fac-staff-wallet';

function makeClient() {
  const tables = {
    profiles: [{
      id: staffId, role: 'staff', full_name: 'Test Staff',
      email: 'staff@example.test', is_wallet_frozen: false,
    }],
    wallets: [{
      id: walletId, user_id: staffId, currency: 'SLE',
      monime_account_id: destinationId, metadata: {}, is_frozen: false,
    }],
    matmove_admin_payroll: [],
  };

  function matches(row, filters) {
    return filters.every(([key, value]) => row[key] === value);
  }

  const client = {
    tables,
    from(table) {
      let action = 'select';
      let filters = [];
      let payload = null;
      let tableRows = tables[table];
      assert.ok(tableRows, 'Unexpected table: ' + table);

      const builder = {
        select() { return this; },
        order() { return this; },
        limit() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        maybeSingle() { return execute(true); },
        single() { return execute(true); },
        insert(value) { action = 'insert'; payload = value; return this; },
        update(value) { action = 'update'; payload = value; return this; },
        then(resolve, reject) { return execute(false).then(resolve, reject); },
      };

      async function execute(single) {
        if (action === 'select') {
          const found = tableRows.filter(row => matches(row, filters));
          return { data: single ? (found[0] || null) : found, error: null };
        }
        if (action === 'insert') {
          const row = { id: '55555555-5555-4555-8555-555555555555', ...payload };
          tableRows.push(row);
          return { data: row, error: null };
        }
        if (action === 'update') {
          const found = tableRows.filter(row => matches(row, filters));
          for (const row of found) Object.assign(row, payload);
          return { data: single ? (found[0] || null) : found, error: null };
        }
        throw new Error('Unsupported mock query action: ' + action);
      }
      return builder;
    },
  };
  return client;
}

function makeResponse() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function makeFetch(calls = []) {
  return async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/financial-accounts/')) {
      const id = decodeURIComponent(String(url).split('/financial-accounts/')[1].split('?')[0]);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: {
            id,
            currency: 'SLE',
            balance: { available: { currency: 'SLE', value: 250000 } },
          },
        }),
      };
    }
    if (String(url).endsWith('/internal-transfers') && options.method === 'POST') {
      const payload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: {
            id: 'trn-payroll-test-001',
            amount: payload.amount,
            sourceFinancialAccount: payload.sourceFinancialAccount,
            destinationFinancialAccount: payload.destinationFinancialAccount,
            status: 'completed',
            updateTime: '2026-11-04T12:00:00.000Z',
          },
        }),
      };
    }
    throw new Error('Unexpected mocked Monime URL: ' + url);
  };
}

function handlerWith({ client = makeClient(), calls = [], fetcher = makeFetch(calls) } = {}) {
  const authorize = async () => ({
    client,
    user: { id: actorId },
    access: { id: actorId, is_active: true, is_owner: true, permissions: ['special'] },
  });
  const env = {
    MONIME_STAFF_PAYROLE_ACCOUNT_ID: sourceId,
    MONIME_API_KEY: 'mock-api-key',
    MONIME_SPACE_ID: 'mock-space',
  };
  return { handler: createHandler({ authorize, env, fetcher }), client, calls };
}

test('payroll GET verifies Admin access and returns parsed Monime SLE balance and account ID', async () => {
  const { handler, client, calls } = handlerWith();
  client.tables.matmove_admin_payroll.push({
    id: '66666666-6666-4666-8666-666666666666',
    staff_user_id: staffId, wallet_id: walletId, amount_minor: 12550,
    currency: 'SLE', reason: 'November payroll',
    provider_transfer_id: 'trn-old-payroll', provider_status: 'completed',
    state: 'completed', failure_detail: null,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:01:00.000Z',
    completed_at: '2026-11-01T10:01:00.000Z',
  });
  const res = makeResponse();
  await handler({ method: 'GET', headers: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.accountId, sourceId);
  assert.deepEqual(res.body.balance, { currency: 'SLE', value: 250000 });
  assert.equal(res.body.payrollHistory.length, 1);
  assert.equal(res.body.payrollHistory[0].amount_minor, 12550);
  assert.equal(res.body.payrollHistory[0].provider_transfer_id, 'trn-old-payroll');
  assert.equal(res.body.historyError, null);
  assert.equal(calls.length, 1);
});

test('payroll POST verifies staff wallet, uses stable idempotency key, and persists completed state', async () => {
  const { handler, client, calls } = handlerWith();
  const res = makeResponse();
  await handler({
    method: 'POST',
    headers: {},
    body: {
      amount: '125.50',
      staffUserId: staffId,
      reason: 'November payroll',
      requestKey,
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.status, 'completed');
  assert.equal(calls.filter(item => item.options.method === 'POST').length, 1);
  const transferCall = calls.find(item => item.options.method === 'POST');
  assert.equal(transferCall.options.headers['Idempotency-Key'], requestKey);
  const payload = JSON.parse(transferCall.options.body);
  assert.equal(payload.amount.currency, 'SLE');
  assert.equal(payload.amount.value, 12550);
  assert.equal(payload.sourceFinancialAccount.id, sourceId);
  assert.equal(payload.destinationFinancialAccount.id, destinationId);
  assert.equal(client.tables.matmove_admin_payroll.length, 1);
  assert.equal(client.tables.matmove_admin_payroll[0].state, 'completed');
  assert.equal(client.tables.matmove_admin_payroll[0].provider_transfer_id, 'trn-payroll-test-001');
});

test('unsupported payroll method returns 405 without authorizing or contacting Monime', async () => {
  const { handler, calls } = handlerWith();
  const res = makeResponse();
  await handler({ method: 'DELETE', headers: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(calls.length, 0);
});

test('invalid payroll amount is rejected before Monime transfer submission', async () => {
  const { handler, calls } = handlerWith();
  const res = makeResponse();
  await handler({
    method: 'POST',
    headers: {},
    body: { amount: '0', staffUserId: staffId, reason: 'Test', requestKey },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

test('payroll refuses a recipient that is not a staff profile', async () => {
  const client = makeClient();
  client.tables.profiles[0].role = 'rider';
  const { handler, calls } = handlerWith({ client });
  const res = makeResponse();
  await handler({
    method: 'POST',
    headers: {},
    body: { amount: '1', staffUserId: staffId, reason: 'Test', requestKey },
  }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(calls.length, 0);
});
