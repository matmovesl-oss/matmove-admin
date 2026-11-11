import test from 'node:test';
import assert from 'node:assert/strict';
import { processAdminMonimeWebhookBatch } from '../server/monime-webhook-worker.js';

function makeRow(overrides = {}) {
  const row = {
    event_id: 'wke-admin-worker-test',
    event_type: 'financial_account.credited',
    object_id: 'fac-admin-test',
    object_type: 'financial_account',
    payload: {
      event: { id: 'wke-admin-worker-test', name: 'financial_account.credited', timestamp: '2026-11-09T10:00:00Z' },
      object: { id: 'fac-admin-test', type: 'financial_account' },
      data: {}
    },
    signature_verified: true,
    status: 'pending',
    attempts: 1,
    received_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_error: null,
    processed_at: null,
    ...overrides
  };
  return row;
}

function makeDb(rows) {
  const touchedTables = new Set();

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
    matched() {
      let result = this.table === 'matmove_admin_monime_webhook_events' ? rows : [];
      result = result.filter(item => this.filters.every(([op, key, value]) => {
        if (op === 'eq') return item[key] === value;
        return String(item[key]) < String(value);
      }));
      if (this.sort) {
        const [key, ascending] = this.sort;
        result = [...result].sort((a, b) =>
          String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1)
        );
      }
      if (this.maxRows !== null) result = result.slice(0, this.maxRows);
      return result;
    }
    project(item) {
      if (!item) return null;
      if (this.columns === '*' || this.columns === undefined) return { ...item };
      return Object.fromEntries(this.columns.split(',').map(key => [key, item[key]]));
    }
    async execute(single = false) {
      touchedTables.add(this.table);
      const matches = this.matched();
      if (this.values) {
        for (const item of matches) Object.assign(item, this.values);
        return { data: single ? this.project(matches[0]) : null, error: null };
      }
      return {
        data: single ? this.project(matches[0]) : matches.map(item => this.project(item)),
        error: null
      };
    }
    maybeSingle() { return this.execute(true); }
    single() { return this.execute(true); }
    then(resolve, reject) { return this.execute(false).then(resolve, reject); }
  }

  return { from: table => new Query(table), touchedTables };
}

test('admin worker quarantines signed financial-account events without overwriting the local wallet ledger', async () => {
  const row = makeRow();
  const { db, touchedTables } = makeDb([row]);
  const localWallet = { id: 'wallet-1', balance: 10, reserved_balance: 4, currency: 'SLE' };

  const result = await processAdminMonimeWebhookBatch({ db, limit: 3 });

  assert.deepEqual(result, { checked: 1, processed: 0, retrying: 0, failed: 1 });
  assert.equal(row.status, 'failed');
  assert.equal(row.attempts, 1);
  assert.match(row.last_error, /manual review/i);
  assert.equal(localWallet.balance, 10);
  assert.equal(localWallet.reserved_balance, 4);
  assert.deepEqual([...touchedTables], ['matmove_admin_monime_webhook_events']);
});

test('admin worker quarantines payout/payment events instead of settling from event labels', async () => {
  for (const [eventType, objectType] of [
    ['payout.completed', 'payout'],
    ['payout.failed', 'payout'],
    ['payment.completed', 'payment'],
    ['payment.failed', 'payment'],
    ['financial_transaction.created', 'financial_transaction']
  ]) {
    const row = makeRow({
      event_type: eventType,
      object_type: objectType,
      object_id: 'provider-object-1',
      payload: {
        event: { id: 'wke-admin-worker-test', name: eventType, timestamp: '2026-11-09T10:00:00Z' },
        object: { id: 'provider-object-1', type: objectType },
        data: {}
      }
    });
    const { db } = makeDb([row]);
    const result = await processAdminMonimeWebhookBatch({ db, limit: 3 });
    assert.deepEqual(result, { checked: 1, processed: 0, retrying: 0, failed: 1 });
    assert.equal(row.status, 'failed');
    assert.match(row.last_error, /manual review/i);
  }
});

test('admin worker rejects unverified or altered inbox payloads', async () => {
  const unverified = makeRow({ signature_verified: false });
  const altered = makeRow();
  altered.payload.event.id = 'wke-other-event';

  for (const row of [unverified, altered]) {
    const { db } = makeDb([row]);
    const result = await processAdminMonimeWebhookBatch({ db, limit: 3 });
    assert.deepEqual(result, { checked: 1, processed: 0, retrying: 0, failed: 1 });
    assert.equal(row.status, 'failed');
  }
});

test('admin worker limits each invocation and leaves the remaining inbox rows pending', async () => {
  const rows = Array.from({ length: 5 }, (_, index) => makeRow({
    event_id: `wke-admin-worker-${index + 1}`,
    received_at: new Date(Date.now() + index).toISOString(),
    payload: {
      event: { id: `wke-admin-worker-${index + 1}`, name: 'financial_account.credited', timestamp: '2026-11-09T10:00:00Z' },
      object: { id: 'fac-admin-test', type: 'financial_account' },
      data: {}
    }
  }));
  const { db } = makeDb(rows);
  const result = await processAdminMonimeWebhookBatch({ db, limit: 3 });

  assert.equal(result.checked, 3);
  assert.equal(result.failed, 3);
  assert.equal(rows.filter(row => row.status === 'pending').length, 2);
});

test('admin worker recovers a stale processing claim and records the attempt', async () => {
  const stale = makeRow({
    status: 'processing',
    attempts: 2,
    updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString()
  });
  const { db } = makeDb([stale]);
  const result = await processAdminMonimeWebhookBatch({ db, limit: 3 });

  assert.deepEqual(result, { checked: 1, processed: 0, retrying: 0, failed: 1 });
  assert.equal(stale.status, 'failed');
  assert.equal(stale.attempts, 3);
  assert.match(stale.last_error, /manual review/i);
});
