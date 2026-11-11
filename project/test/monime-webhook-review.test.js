import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHandler } from '../api/get-all-transactions.js';

const actorId = '11111111-1111-4111-8111-111111111111';
const eventId = 'wke-review-test-123';

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function mockClient({ rpcData = null, rpcError = null, reviewRows = [], reviewError = null } = {}) {
  const calls = { rpc: [], query: null };
  const client = {
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      return { data: rpcData, error: rpcError };
    },
    from(table) {
      const query = {
        table,
        columns: '',
        filters: [],
        sort: null,
        maxRows: null,
        select(columns) { this.columns = columns; return this; },
        eq(key, value) { this.filters.push([key, value]); return this; },
        order(key, options) { this.sort = [key, options]; return this; },
        limit(value) { this.maxRows = value; return this; },
        then(resolve, reject) {
          calls.query = {
            table: this.table,
            columns: this.columns,
            filters: this.filters,
            sort: this.sort,
            maxRows: this.maxRows
          };
          return Promise.resolve({ data: reviewRows, error: reviewError }).then(resolve, reject);
        }
      };
      return query;
    }
  };
  return { client, calls };
}

function adminStub(client, calls, user = { id: actorId }) {
  return async (_req, permissions) => {
    calls.permissions = permissions;
    return { client, user, access: { id: user.id, is_active: true, permissions: ['transactions'] } };
  };
}

const testEnv = {
  MONIME_API_KEY: 'mon_test_fake_key_for_unit_test',
  MONIME_SPACE_ID: 'spc_test_unit'
};

function providerStub() {
  return async (url, options) => {
    assert.equal(String(url), 'https://api.monime.io/v1/financial-transactions?limit=50');
    assert.equal(options.headers.Authorization, `Bearer ${testEnv.MONIME_API_KEY}`);
    return {
      ok: true,
      status: 200,
      json: async () => ({ result: [{ id: 'txn-test-1', type: 'credit', amount: { currency: 'SLE', value: 1200 } }] })
    };
  };
}

test('non-GET/POST methods are rejected without checking Monime or touching the queue', async () => {
  const { client, calls } = mockClient();
  const handler = createHandler({ requireAdminFn: adminStub(client, calls), env: testEnv });
  const res = responseRecorder();
  await handler({ method: 'DELETE', headers: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET, POST');
  assert.deepEqual(calls.rpc, []);
});

test('manual-review POST requires Transactions access, event ID and note, then records only review metadata', async () => {
  const reviewed = {
    reviewed: true,
    eventId,
    reviewState: 'reviewed',
    reviewedAt: '2026-11-11T13:00:00Z',
    reviewedBy: actorId
  };
  const { client, calls } = mockClient({ rpcData: reviewed });
  const handler = createHandler({ requireAdminFn: adminStub(client, calls), env: testEnv });
  const res = responseRecorder();

  await handler({
    method: 'POST',
    headers: {},
    body: { action: 'mark-webhook-reviewed', eventId, note: 'Provider event investigated; retained for manual settlement.' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reviewed, true);
  assert.deepEqual(calls.permissions, ['transactions']);
  assert.deepEqual(calls.rpc, [{
    name: 'matmove_admin_monime_webhook_mark_reviewed',
    args: {
      p_event_id: eventId,
      p_actor_id: actorId,
      p_note: 'Provider event investigated; retained for manual settlement.'
    }
  }]);
});

test('invalid review requests are rejected before invoking the database RPC', async () => {
  const { client, calls } = mockClient();
  const handler = createHandler({ requireAdminFn: adminStub(client, calls), env: testEnv });
  for (const body of [
    { action: 'settle', eventId, note: 'No.' },
    { action: 'mark-webhook-reviewed', eventId: 'bad-event-id', note: 'Reviewed.' },
    { action: 'mark-webhook-reviewed', eventId, note: '  ' },
    { action: 'mark-webhook-reviewed', eventId, note: 'x'.repeat(1001) }
  ]) {
    const res = responseRecorder();
    await handler({ method: 'POST', headers: {}, body }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.deepEqual(calls.rpc, []);
});

test('GET returns only safe failed-event metadata and filters to unreviewed records', async () => {
  const rows = [{
    event_id: eventId,
    event_type: 'payout.completed',
    object_id: 'pay-provider-1',
    object_type: 'payout',
    status: 'failed',
    attempts: 1,
    received_at: '2026-11-11T12:00:00Z',
    updated_at: '2026-11-11T12:01:00Z',
    last_error: 'Retained for manual review.'
  }];
  const { client, calls } = mockClient({ reviewRows: rows });
  const handler = createHandler({
    requireAdminFn: adminStub(client, calls),
    fetcher: providerStub(),
    env: testEnv
  });
  const res = responseRecorder();
  await handler({ method: 'GET', headers: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.transactions.length, 1);
  assert.equal(res.body.webhookReviewAvailable, true);
  assert.equal(res.body.webhookReviewEvents[0].event_id, eventId);
  assert.deepEqual(calls.query.filters, [['status', 'failed'], ['review_state', 'unreviewed']]);
  assert.equal(calls.query.maxRows, 100);
  assert.equal(calls.query.columns.includes('payload'), false);
  assert.equal(calls.query.columns.includes('review_note'), false);
});

test('GET tolerates a not-yet-installed private queue without granting direct browser access', async () => {
  const { client, calls } = mockClient({
    reviewError: { code: 'PGRST205', message: 'Could not find the table matmove_admin_monime_webhook_events in the schema cache.' }
  });
  const handler = createHandler({
    requireAdminFn: adminStub(client, calls),
    fetcher: providerStub(),
    env: testEnv
  });
  const res = responseRecorder();
  await handler({ method: 'GET', headers: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.transactions.length, 1);
  assert.equal(res.body.webhookReviewAvailable, false);
  assert.deepEqual(res.body.webhookReviewEvents, []);
  assert.match(res.body.webhookReviewError, /migration is not installed/i);
});

test('Admin review migration keeps the queue private and the review RPC service-role-only', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20261111140000_matmove_admin_monime_manual_review.sql', import.meta.url),
    'utf8'
  );
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.matmove_admin_monime_webhook_events\s+from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update on table public\.matmove_admin_monime_webhook_events\s+to service_role/i);
  assert.match(migration, /a\.permissions \? 'transactions'/);
  assert.match(migration, /reviewed_by = p_actor_id/);
  assert.doesNotMatch(migration, /update public\.wallets|insert into public\.wallet_transactions|settle_wallet/);
});

test('Transactions screen explains that review notes never move funds', async () => {
  const source = await readFile(new URL('../src/pages/TransactionsPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /Monime webhook events — manual review/);
  assert.match(source, /Mark reviewed \(no funds moved\)/);
  assert.match(source, /does not credit a wallet, issue a refund, or settle a payout/i);
  assert.match(source, /matmove_admin_monime_webhook_mark_reviewed|mark-webhook-reviewed/);
});
