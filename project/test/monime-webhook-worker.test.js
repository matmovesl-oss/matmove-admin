import test from 'node:test';
import assert from 'node:assert/strict';
import { processAdminMonimeWebhookBatch } from '../server/monime-webhook-worker.js';

function makeFixture(eventType = 'financial_account.credited', objectType = 'financial_account', walletCount = 1) {
  const row = {
    event_id: 'wke-admin-worker-test',
    event_type: eventType,
    object_id: 'fac-admin-test',
    object_type: objectType,
    payload: {
      event: { id: 'wke-admin-worker-test', name: eventType, timestamp: '2026-11-09T10:00:00Z' },
      object: { id: 'fac-admin-test', type: objectType },
      data: {}
    },
    signature_verified: true,
    status: 'pending',
    attempts: 1,
    received_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_error: null,
    processed_at: null
  };
  const wallets = Array.from({ length: walletCount }, (_, index) => ({
    id: `wallet-admin-test-${index + 1}`,
    monime_account_id: 'fac-admin-test',
    currency: 'SLE',
    balance: 10
  }));
  const wallet = wallets[0] || null;

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.values = null;
      this.columns = '*';
      this.sort = null;
      this.maxRows = null;
    }
    select(columns = '*') { this.columns = columns; return this; }
    eq(key, value) { this.filters.push(['eq', key, value]); return this; }
    lt(key, value) { this.filters.push(['lt', key, value]); return this; }
    order(key, options = {}) { this.sort = [key, options.ascending !== false]; return this; }
    limit(value) { this.maxRows = value; return this; }
    update(values) { this.values = values; return this; }
    rows() {
      const source = this.table === 'matmove_admin_monime_webhook_events'
        ? [row]
        : this.table === 'wallets'
          ? wallets
          : [];
      let rows = source.filter(item => this.filters.every(([op, key, value]) => {
        if (op === 'eq') return item[key] === value;
        return String(item[key]) < String(value);
      }));
      if (this.sort) {
        const [key, ascending] = this.sort;
        rows = rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1));
      }
      if (this.maxRows !== null) rows = rows.slice(0, this.maxRows);
      return rows;
    }
    project(item) {
      if (!item) return null;
      if (this.columns === '*' || this.columns === undefined) return { ...item };
      return Object.fromEntries(this.columns.split(',').map(key => [key, item[key]]));
    }
    async execute(single = false) {
      const rows = this.rows();
      if (this.values) {
        for (const item of rows) Object.assign(item, this.values);
        return { data: single ? this.project(rows[0]) : null, error: null };
      }
      return { data: single ? this.project(rows[0]) : rows.map(item => this.project(item)), error: null };
    }
    maybeSingle() { return this.execute(true); }
    single() { return this.execute(true); }
    then(resolve, reject) { return this.execute(false).then(resolve, reject); }
  }

  const db = { from: table => new Query(table) };
  return { row, wallet, wallets, db };
}

async function withTestProvider(t, run) {
  const previous = {
    key: process.env.MONIME_API_KEY,
    space: process.env.MONIME_SPACE_ID,
    mode: process.env.MONIME_ENVIRONMENT,
    vercel: process.env.VERCEL_ENV
  };
  const originalFetch = globalThis.fetch;
  process.env.MONIME_API_KEY = 'mon_test_admin_worker_validation';
  process.env.MONIME_SPACE_ID = 'spc-admin-test';
  process.env.MONIME_ENVIRONMENT = 'test';
  process.env.VERCEL_ENV = 'preview';
  let calls = 0;

  globalThis.fetch = async (url, options) => {
    calls++;
    assert.match(String(url), /\/v1\/financial-accounts\/fac-admin-test\?withBalance=true$/);
    assert.equal(options.method, 'GET');
    assert.equal(options.headers['Monime-Space-Id'], 'spc-admin-test');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          id: 'fac-admin-test',
          balance: { available: { currency: 'SLE', value: 12345 } }
        }
      })
    };
  };

  try {
    await run(() => calls);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous.key === undefined) delete process.env.MONIME_API_KEY;
    else process.env.MONIME_API_KEY = previous.key;
    if (previous.space === undefined) delete process.env.MONIME_SPACE_ID;
    else process.env.MONIME_SPACE_ID = previous.space;
    if (previous.mode === undefined) delete process.env.MONIME_ENVIRONMENT;
    else process.env.MONIME_ENVIRONMENT = previous.mode;
    if (previous.vercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous.vercel;
  }
}

test('admin worker refreshes a wallet from the current Monime financial-account balance', async t => {
  const { row, wallet, db } = makeFixture();
  await withTestProvider(t, async fetchCalls => {
    const result = await processAdminMonimeWebhookBatch({ db, limit: 10 });
    assert.deepEqual(result, { checked: 1, processed: 1, retrying: 0, failed: 0 });
    assert.equal(fetchCalls(), 1);
    assert.equal(wallet.balance, 123.45);
    assert.equal(row.status, 'processed');
    assert.equal(row.attempts, 1);
    assert.equal(row.signature_verified, true);
  });
});

test('admin worker quarantines payout events instead of settling from the event label', async () => {
  const { row, wallet, db } = makeFixture('payout.completed', 'payout');
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetchCalls++; throw new Error('must not call provider for an unverified payout'); };
  try {
    const result = await processAdminMonimeWebhookBatch({ db, limit: 10 });
    assert.deepEqual(result, { checked: 1, processed: 0, retrying: 0, failed: 1 });
    assert.equal(fetchCalls, 0);
    assert.equal(wallet.balance, 10);
    assert.equal(row.status, 'failed');
    assert.match(row.last_error, /manual review until its current provider object/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin worker does not refresh account balances for unverified inbox content', async () => {
  const { row, wallet, db } = makeFixture();
  row.signature_verified = false;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls++; throw new Error('must not call provider for unsigned content'); };
  try {
    const result = await processAdminMonimeWebhookBatch({ db, limit: 10 });
    assert.deepEqual(result, { checked: 1, processed: 0, retrying: 0, failed: 1 });
    assert.equal(fetchCalls, 0);
    assert.equal(wallet.balance, 10);
    assert.equal(row.status, 'failed');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin worker retains a transient provider failure for retry', async () => {
  const { row, wallet, db } = makeFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => null });
  const previousKey = process.env.MONIME_API_KEY;
  const previousSpace = process.env.MONIME_SPACE_ID;
  process.env.MONIME_API_KEY = 'mon_test_admin_worker_validation';
  process.env.MONIME_SPACE_ID = 'spc-admin-test';

  try {
    const result = await processAdminMonimeWebhookBatch({ db, limit: 10 });
    assert.deepEqual(result, { checked: 1, processed: 0, retrying: 1, failed: 0 });
    assert.equal(row.status, 'pending');
    assert.equal(row.attempts, 1);
    assert.equal(wallet.balance, 10);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.MONIME_API_KEY;
    else process.env.MONIME_API_KEY = previousKey;
    if (previousSpace === undefined) delete process.env.MONIME_SPACE_ID;
    else process.env.MONIME_SPACE_ID = previousSpace;
  }
});


test('admin worker quarantines a financial-account event when no MatMove wallet matches', async t => {
  const { row, db } = makeFixture('financial_account.credited', 'financial_account', 0);
  await withTestProvider(t, async fetchCalls => {
    const result = await processAdminMonimeWebhookBatch({ db, limit: 10 });
    assert.deepEqual(result, { checked: 1, processed: 0, retrying: 0, failed: 1 });
    assert.equal(fetchCalls(), 1);
    assert.equal(row.status, 'failed');
    assert.match(row.last_error, /does not map to exactly one MatMove wallet/i);
  });
});

test('admin worker quarantines duplicate MatMove account mappings instead of updating multiple wallets', async t => {
  const { row, wallets, db } = makeFixture('financial_account.credited', 'financial_account', 2);
  await withTestProvider(t, async fetchCalls => {
    const result = await processAdminMonimeWebhookBatch({ db, limit: 10 });
    assert.deepEqual(result, { checked: 1, processed: 0, retrying: 0, failed: 1 });
    assert.equal(fetchCalls(), 1);
    assert.equal(row.status, 'failed');
    assert.ok(wallets.every(wallet => wallet.balance === 10));
    assert.match(row.last_error, /does not map to exactly one MatMove wallet/i);
  });
});


test('admin webhook worker refuses to claim inbox rows with a Test token in Production', async () => {
  const { row, db } = makeFixture();
  const previous = {
    key: process.env.MONIME_API_KEY,
    space: process.env.MONIME_SPACE_ID,
    mode: process.env.MONIME_ENVIRONMENT,
    vercel: process.env.VERCEL_ENV
  };
  process.env.MONIME_API_KEY = 'mon_test_not-a-real-secret';
  process.env.MONIME_SPACE_ID = 'spc-admin-test';
  process.env.MONIME_ENVIRONMENT = 'test';
  process.env.VERCEL_ENV = 'production';

  try {
    await assert.rejects(
      processAdminMonimeWebhookBatch({ db, limit: 10 }),
      /conflicts with the Vercel deployment environment/i
    );
    assert.equal(row.status, 'pending');
    assert.equal(row.attempts, 1);
  } finally {
    for (const [key, value] of [
      ['MONIME_API_KEY', previous.key],
      ['MONIME_SPACE_ID', previous.space],
      ['MONIME_ENVIRONMENT', previous.mode],
      ['VERCEL_ENV', previous.vercel]
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
