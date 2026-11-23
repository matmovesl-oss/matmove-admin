import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync(new URL('../src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
const financials = readFileSync(new URL('../src/pages/FinancialsPage.tsx', import.meta.url), 'utf8');

test('Admin dashboard requests have a bounded 30 second lifetime and remain refreshable afterwards', () => {
  assert.match(dashboard, /let activeController: AbortController \| null = null/);
  assert.match(dashboard, /window\.setTimeout\(\(\) => controller\.abort\(\), 30_000\)/);
  assert.match(dashboard, /window\.clearTimeout\(timeout\)/);
  assert.match(dashboard, /activeController\?\.abort\(\)/);
  assert.match(dashboard, /const valid = \(\) => live && current\.current === stamp/);
  assert.doesNotMatch(dashboard, /current\.current === stamp && !controller\.signal\.aborted/);
});

test('Financials customer-wallet and Monime reads each have their own abort timeout', () => {
  assert.match(financials, /databaseController = new AbortController\(\)/);
  assert.match(financials, /databaseTimeout = window\.setTimeout\(\(\) => databaseController\.abort\(\), 25_000\)/);
  assert.match(financials, /abortSignal\(databaseController\.signal\)/);
  assert.match(financials, /gatewayController = new AbortController\(\)/);
  assert.match(financials, /gatewayTimeout = window\.setTimeout\(\(\) => gatewayController\.abort\(\), 25_000\)/);
  assert.match(financials, /signal: gatewayController\.signal/);
  assert.match(financials, /window\.clearTimeout\(databaseTimeout\)/);
  assert.match(financials, /window\.clearTimeout\(gatewayTimeout\)/);
});

test('long account-label synchronization requests are also bounded', () => {
  assert.match(financials, /signal: AbortSignal\.timeout\(25_000\)/);
});

test('Admin dashboard keeps its existing 60 second visible-page refresh and offline snapshot', () => {
  assert.match(dashboard, /}, 60000\)/);
  assert.match(dashboard, /Offline\. Showing the last verified dashboard data\./);
});
