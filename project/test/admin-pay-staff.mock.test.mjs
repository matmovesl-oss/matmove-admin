import { createHandler } from '../api/admin-pay-staff.js';
import assert from 'node:assert/strict';

const UUID = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';
const SOURCE = 'fac-payroll123';
const DEST = 'fac-staff123';
const env = {
  MONIME_STAFF_PAYROLL_ACCOUNT_ID: SOURCE,
  MONIME_API_KEY: 'test-key',
  MONIME_SPACE_ID: 'spc-test',
};

function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(v) { this.body = v; return this; } };
}

let savedLedger = null;
const client = {
  from(table) {
    let operation = 'select';
    let inserted = null;
    let updated = null;
    const filters = {};
    const b = {
      select() { return b; },
      eq(k, v) { filters[k] = v; return b; },
      maybeSingle() {
        if (table === 'profiles') return Promise.resolve({ data: { id: UUID, role: 'staff', full_name: 'Test Staff' }, error: null });
        if (table === 'matmove_admin_payroll') return Promise.resolve({ data: savedLedger && savedLedger.request_key === filters.request_key ? savedLedger : null, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      insert(v) { operation = 'insert'; inserted = v; return b; },
      single() {
        if (table !== 'matmove_admin_payroll' || operation !== 'insert') throw new Error('Unexpected single');
        savedLedger = { id: '33333333-3333-4333-8333-333333333333', ...inserted };
        return Promise.resolve({ data: savedLedger, error: null });
      },
      update(v) { operation = 'update'; updated = v; return b; },
      then(resolve, reject) {
        let result;
        if (table === 'wallets') result = { data: [{ id: '44444444-4444-4444-8444-444444444444', user_id: UUID, currency: 'SLE', monime_account_id: DEST, metadata: {} }], error: null };
        else if (table === 'matmove_admin_payroll' && operation === 'update') { savedLedger = { ...savedLedger, ...updated }; result = { error: null }; }
        else result = { data: null, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return b;
  },
};

const authorize = async (req, keys) => {
  if (!req.headers?.authorization) { const e = new Error('Sign in to the Admin portal.'); e.status = 401; throw e; }
  if (!keys.includes('special')) { const e = new Error('Forbidden'); e.status = 403; throw e; }
  return { client, user: { id: UUID }, access: { is_owner: true, is_active: true } };
};

const calls = [];
const fetcher = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  if (String(url).includes('/financial-accounts/')) {
    const id = String(url).includes(DEST) ? DEST : SOURCE;
    return { ok: true, status: 200, json: async () => ({ success: true, result: { id, currency: 'SLE', name: 'Test account', balance: { available: { currency: 'SLE', value: 500000 } } } }) };
  }
  if (String(url).endsWith('/internal-transfers')) {
    const body = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ success: true, result: { id: 'trn-test123', status: 'completed', amount: body.amount, sourceFinancialAccount: body.sourceFinancialAccount, destinationFinancialAccount: body.destinationFinancialAccount, updateTime: new Date().toISOString() } }) };
  }
  throw new Error('Unexpected URL: ' + url);
};

const handler = createHandler({ authorize, env, fetcher });

// GET: verifies Monime's { result: financial account } envelope and withBalance parameter.
let res = response();
await handler({ method: 'GET', headers: { authorization: 'Bearer test' } }, res);
assert.equal(res.code, 200);
assert.equal(res.body.accountId, SOURCE);
assert.deepEqual(res.body.balance, { currency: 'SLE', value: 500000 });
assert.ok(calls[0].url.includes('withBalance=true'));
console.log('PASS: payroll GET parses Monime result envelope and balance');

// POST: creates durable ledger row before creating transfer, then records provider completion.
res = response();
await handler({ method: 'POST', headers: { authorization: 'Bearer test' }, body: { staffUserId: UUID, amount: '125.50', reason: 'November payroll', requestKey: REQUEST } }, res);
assert.equal(res.code, 200);
assert.equal(res.body.status, 'completed');
assert.equal(savedLedger.amount_minor, 12550);
assert.equal(savedLedger.state, 'completed');
const postCall = calls.find(c => c.url.endsWith('/internal-transfers'));
assert.equal(postCall.options.headers['Idempotency-Key'], REQUEST);
console.log('PASS: payroll POST verifies staff wallet, uses stable idempotency key, and persists completed state');

// Method and invalid payload guards.
res = response();
await handler({ method: 'DELETE', headers: { authorization: 'Bearer test' } }, res);
assert.equal(res.code, 405);
console.log('PASS: unsupported payroll method returns 405');

res = response();
await handler({ method: 'POST', headers: { authorization: 'Bearer test' }, body: { staffUserId: UUID, amount: '-1', reason: 'test', requestKey: REQUEST } }, res);
assert.equal(res.code, 400);
console.log('PASS: invalid payroll amount rejected before transfer');
