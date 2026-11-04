import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/admin-refund.js';

const actorId = '11111111-1111-4111-8111-111111111111';
const customerId = '22222222-2222-4222-8222-222222222222';
const walletId = '33333333-3333-4333-8333-333333333333';
const requestKey = '44444444-4444-4444-8444-444444444444';
const refundId = '55555555-5555-4555-8555-555555555555';
const sourceId = 'fac-refund-source';
const destinationId = 'fac-customer-wallet';

function makeClient(existing = []) {
  const tables = {
    wallets: [{
      id: walletId, user_id: customerId, currency: 'SLE',
      monime_account_id: destinationId, metadata: {},
    }],
    matmove_admin_refunds: existing,
  };
  function matches(row, filters) {
    return filters.every(([key, value]) => row[key] === value);
  }
  const client = {
    tables,
    from(table) {
      const rows = tables[table];
      assert.ok(rows, 'Unexpected table: ' + table);
      let action = 'select', filters = [], payload = null;
      const builder = {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        maybeSingle() { return execute(true); },
        single() { return execute(true); },
        insert(value) { action = 'insert'; payload = value; return this; },
        update(value) { action = 'update'; payload = value; return this; },
        then(resolve, reject) { return execute(false).then(resolve, reject); },
      };
      async function execute(single) {
        if (action === 'select') {
          const found = rows.filter(row => matches(row, filters));
          return { data: single ? (found[0] || null) : found, error: null };
        }
        if (action === 'insert') {
          const row = { id: refundId, ...payload };
          rows.push(row);
          return { data: row, error: null };
        }
        if (action === 'update') {
          const found = rows.filter(row => matches(row, filters));
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

function makeFetch(calls = [], transferStatus = 'completed') {
  return async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const value = String(url);
    if (value.includes('/financial-accounts/')) {
      const id = decodeURIComponent(value.split('/financial-accounts/')[1].split('?')[0]);
      return {
        ok: true, status: 200,
        json: async () => ({ result: {
          id, currency: 'SLE',
          balance: { available: { currency: 'SLE', value: 250000 } },
        } }),
      };
    }
    if (value.endsWith('/internal-transfers') && options.method === 'POST') {
      const payload = JSON.parse(options.body);
      return {
        ok: true, status: 200,
        json: async () => ({ result: {
          id: 'trn-refund-test-001',
          amount: payload.amount,
          sourceFinancialAccount: payload.sourceFinancialAccount,
          destinationFinancialAccount: payload.destinationFinancialAccount,
          status: transferStatus,
          updateTime: '2026-11-04T12:00:00.000Z',
        } }),
      };
    }
    if (value.includes('/internal-transfers/')) {
      return {
        ok: true, status: 200,
        json: async () => ({ result: {
          id: 'trn-refund-existing',
          amount: { currency: 'SLE', value: 12550 },
          sourceFinancialAccount: { id: sourceId },
          destinationFinancialAccount: { id: destinationId },
          status: transferStatus,
          updateTime: '2026-11-04T12:00:00.000Z',
        } }),
      };
    }
    throw new Error('Unexpected mocked Monime URL: ' + url);
  };
}

function handlerWith({ client = makeClient(), calls = [], fetcher = makeFetch(calls) } = {}) {
  const authorize = async () => ({
    client, user: { id: actorId },
    access: { id: actorId, is_active: true, is_owner: true, permissions: ['financials', 'special'] },
  });
  const env = {
    MONIME_REFUND_ACCOUNT_ID: sourceId,
    MONIME_API_KEY: 'mock-api-key',
    MONIME_SPACE_ID: 'mock-space',
  };
  return { handler: createHandler({ authorize, env, fetcher }), client, calls };
}

const request = () => ({
  method: 'POST',
  headers: {},
  body: {
    amount: '125.50',
    recipientAccountId: destinationId,
    recipientUserId: customerId,
    reason: 'Duplicate debit case 123',
    requestKey,
  },
});

test('refund POST verifies customer wallet, source balance, amount and persists confirmed transfer', async () => {
  const { handler, client, calls } = handlerWith();
  const res = makeResponse();
  await handler(request(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'completed');
  assert.equal(client.tables.matmove_admin_refunds.length, 1);
  assert.equal(client.tables.matmove_admin_refunds[0].amount_minor, 12550);
  assert.equal(client.tables.matmove_admin_refunds[0].state, 'completed');
  const transfer = calls.find(call => call.options.method === 'POST');
  assert.equal(transfer.options.headers['Idempotency-Key'], requestKey);
  const payload = JSON.parse(transfer.options.body);
  assert.equal(payload.amount.currency, 'SLE');
  assert.equal(payload.amount.value, 12550);
  assert.equal(payload.sourceFinancialAccount.id, sourceId);
  assert.equal(payload.destinationFinancialAccount.id, destinationId);
});

test('refund rejects an arbitrary destination not linked to the selected customer', async () => {
  const client = makeClient();
  client.tables.wallets[0].monime_account_id = 'fac-other-account';
  const { handler, calls } = handlerWith({ client });
  const res = makeResponse();
  await handler(request(), res);

  assert.equal(res.statusCode, 409);
  assert.equal(calls.length, 0);
  assert.equal(client.tables.matmove_admin_refunds.length, 0);
});

test('refund rejects invalid amounts before contacting Monime', async () => {
  const { handler, calls } = handlerWith();
  const req = request();
  req.body.amount = '0';
  const res = makeResponse();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

test('completed refund request replays from the ledger without creating another transfer', async () => {
  const existing = [{
    id: refundId, request_key: requestKey, initiated_by: actorId,
    recipient_user_id: customerId, recipient_account_id: destinationId,
    source_account_id: sourceId, amount_minor: 12550, state: 'completed',
    provider_transfer_id: 'trn-refund-existing',
  }];
  const client = makeClient(existing);
  const { handler, calls } = handlerWith({ client });
  const res = makeResponse();
  await handler(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.replayed, true);
  assert.equal(calls.length, 0);
});

test('pending refund recovery reads the existing provider transfer and does not submit a second POST', async () => {
  const existing = [{
    id: refundId, request_key: requestKey, initiated_by: actorId,
    recipient_user_id: customerId, recipient_account_id: destinationId,
    source_account_id: sourceId, amount_minor: 12550, state: 'processing',
    provider_transfer_id: 'trn-refund-existing',
  }];
  const client = makeClient(existing);
  const calls = [];
  const { handler } = handlerWith({ client, calls, fetcher: makeFetch(calls, 'processing') });
  const res = makeResponse();
  await handler(request(), res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.status, 'processing');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('/internal-transfers/trn-refund-existing'));
});
