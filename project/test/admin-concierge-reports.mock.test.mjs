import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/admin-concierge.js';

const adminId = '11111111-1111-4111-8111-111111111111';
const services = [
  { id: 'service-a', title: 'Airport Transfer', category: 'Travel', slug: 'airport-transfer', price_label: 'From SLE 500', is_active: true, deleted_at: null, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z' },
  { id: 'service-b', title: 'Visa Assistance', category: 'Travel', slug: 'visa-assistance', price_label: 'Quote on request', is_active: false, deleted_at: null, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-05T00:00:00.000Z' },
  { id: 'service-c', title: 'Hotel Booking', category: 'Accommodation', slug: 'hotel-booking', price_label: 'From US$80/night', is_active: false, deleted_at: '2026-10-12T00:00:00.000Z', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-12T00:00:00.000Z' },
];

function makeResponse() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function fixture({ interests = [], audit = [], serviceRows = services, now = '2026-11-04T13:00:00.000Z' } = {}) {
  const reads = [];
  const mutations = [];
  const data = {
    concierge_services: serviceRows,
    concierge_interests: interests,
    concierge_service_audit: audit,
  };
  const client = {
    from(table) {
      assert.ok(data[table], 'Unexpected table ' + table);
      let start = null, end = null, sliceStart = null, sliceEnd = null;
      const query = {
        select(columns) { reads.push({ table, columns }); return this; },
        order() { return this; },
        gte(column, value) { assert.equal(column, 'created_at'); start = value; return this; },
        lt(column, value) { assert.equal(column, 'created_at'); end = value; return this; },
        range(from, to) { sliceStart = from; sliceEnd = to; return this; },
        insert() { mutations.push({ table, action: 'insert' }); throw new Error('Report attempted insert'); },
        update() { mutations.push({ table, action: 'update' }); throw new Error('Report attempted update'); },
        delete() { mutations.push({ table, action: 'delete' }); throw new Error('Report attempted delete'); },
        then(resolve, reject) {
          let rows = data[table];
          if (start) rows = rows.filter(row => row.created_at >= start);
          if (end) rows = rows.filter(row => row.created_at < end);
          if (sliceStart != null) rows = rows.slice(sliceStart, sliceEnd + 1);
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const authorize = async (_req, keys) => {
    assert.deepEqual(keys, ['special']);
    return {
      client,
      user: { id: adminId },
      access: { id: adminId, is_active: true, is_owner: true, permissions: ['special'] },
    };
  };
  const handler = createHandler({ authorize, now: () => now });
  return {
    handler, reads, mutations,
    async run(query = { action: 'reports', from: '2026-11-03', to: '2026-11-04' }) {
      const res = makeResponse();
      await handler({ method: 'GET', query, headers: {} }, res);
      return res;
    },
  };
}

test('date-filtered report counts catalogue, enquiries, service breakdown and audit without treating quotes as revenue', async () => {
  const f = fixture({
    interests: [
      { id: 'i-1', service_id: 'service-a', service_title: 'Airport Transfer', price_label_snapshot: 'From SLE 500', status: 'new', created_at: '2026-11-03T10:00:00.000Z' },
      { id: 'i-2', service_id: 'service-a', service_title: 'Airport Transfer', price_label_snapshot: 'From SLE 500', status: 'completed', created_at: '2026-11-04T11:00:00.000Z' },
      { id: 'i-3', service_id: 'service-b', service_title: 'Visa Assistance', price_label_snapshot: 'Quote on request', status: 'cancelled', created_at: '2026-11-04T12:00:00.000Z' },
      { id: 'i-old', service_id: 'service-a', service_title: 'Airport Transfer', price_label_snapshot: 'Old quote', status: 'new', created_at: '2026-11-02T23:59:59.000Z' },
      { id: 'i-future', service_id: 'service-a', service_title: 'Airport Transfer', price_label_snapshot: 'Future quote', status: 'new', created_at: '2026-11-05T00:00:00.000Z' },
    ],
    audit: [
      { service_id: 'service-a', actor_id: adminId, action: 'created', created_at: '2026-11-03T09:00:00.000Z' },
      { service_id: 'service-a', actor_id: adminId, action: 'updated', created_at: '2026-11-04T09:00:00.000Z' },
    ],
  });
  const res = await f.run();

  assert.equal(res.statusCode, 200);
  const report = res.body.report;
  assert.deepEqual(report.range, { from: '2026-11-03', to: '2026-11-04', days: 2, trendGrouping: 'day' });
  assert.deepEqual(report.catalogue, { totalServices: 3, activeServices: 1, pausedServices: 1, deletedServices: 1 });
  assert.deepEqual(report.enquiries.byStatus, { new: 1, contacted: 0, in_progress: 0, completed: 1, cancelled: 1 });
  assert.equal(report.enquiries.total, 3);
  assert.equal(report.enquiries.open, 1);
  assert.equal(report.serviceBreakdown.length, 2);
  assert.equal(report.serviceBreakdown[0].serviceTitle, 'Airport Transfer');
  assert.equal(report.serviceBreakdown[0].enquiries, 2);
  assert.deepEqual(report.serviceBreakdown[0].priceLabels, ['From SLE 500']);
  assert.deepEqual(report.trend.map(item => item.period), ['2026-11-03', '2026-11-04']);
  assert.equal(report.audit.totalEvents, 2);
  assert.deepEqual(report.audit.byAction, { created: 1, updated: 1 });
  assert.equal(report.audit.recentEvents[0].action, 'updated');
  assert.equal(report.revenue, null);
  assert.match(report.revenueNote, /not proof of payment/i);
  assert.equal(report.complete, true);
  assert.deepEqual(f.mutations, []);
  assert.equal(f.reads.some(item => item.table === 'concierge_interests' && /customer_email|customer_phone|message/.test(item.columns)), false);
});

test('empty production activity produces zero metrics and no fabricated revenue', async () => {
  const f = fixture({ interests: [], audit: [] });
  const res = await f.run();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.report.enquiries.total, 0);
  assert.equal(res.body.report.enquiries.open, 0);
  assert.equal(res.body.report.serviceBreakdown.length, 0);
  assert.equal(res.body.report.trend.length, 0);
  assert.equal(res.body.report.audit.totalEvents, 0);
  assert.equal(res.body.report.revenue, null);
  assert.equal(res.body.report.catalogue.activeServices, 1);
});

test('default date window is 90 calendar days and reports monthly trend grouping', async () => {
  const f = fixture({ now: '2026-11-04T13:00:00.000Z' });
  const res = await f.run({ action: 'reports' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.report.range, {
    from: '2026-08-07', to: '2026-11-04', days: 90, trendGrouping: 'month',
  });
});

test('invalid, partial, reversed and overlong report ranges are rejected before database reads', async () => {
  for (const query of [
    { action: 'reports', from: '2026-02-30', to: '2026-03-01' },
    { action: 'reports', from: '2026-11-01' },
    { action: 'reports', from: '2026-11-05', to: '2026-11-04' },
    { action: 'reports', from: '2025-01-01', to: '2026-11-04' },
  ]) {
    const f = fixture();
    const res = await f.run(query);
    assert.equal(res.statusCode, 400);
    assert.equal(f.reads.length, 0);
  }
});

test('report pagination reads records beyond the first 500 without dropping rows', async () => {
  const interests = Array.from({ length: 501 }, (_, index) => ({
    id: 'interest-' + index,
    service_id: 'service-a',
    service_title: 'Airport Transfer',
    price_label_snapshot: 'From SLE 500',
    status: 'new',
    created_at: '2026-11-03T10:00:00.000Z',
  }));
  const f = fixture({ interests });
  const res = await f.run();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.report.enquiries.total, 501);
  assert.equal(res.body.report.serviceBreakdown[0].enquiries, 501);
});
