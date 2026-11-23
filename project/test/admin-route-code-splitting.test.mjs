import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

const routes = [
  'ConciergePage', 'HomepagePostsPage', 'SpecialOperationsPage',
  'AdministrativePayrollPage', 'CivitasAdministrativePage', 'AdminTravelPage',
  'AdminEventsPage', 'NotificationsPage', 'CustomerSupportPage', 'ReportsPage',
  'GamesPage', 'DashboardPage', 'KycPage', 'FinancialsPage',
  'LoadingBonanzaPage', 'PayoutsPage', 'UsersPage', 'StaffGovernancePage',
  'LogsPage', 'AuditPage', 'DispatchRadarPage', 'PricingPage',
  'TransactionsPage', 'CashPaymentsPage', 'StaffPasswordPage'
];

test('operational Admin pages are loaded with React.lazy rather than static page imports', () => {
  for (const route of routes) {
    assert.match(app, new RegExp('const ' + route + ' = lazy\\\\('), route + ' should be lazy loaded');
  }
  for (const route of routes) {
    assert.doesNotMatch(app, new RegExp('^import .*' + route + '.* from [\\x27\\x22]./pages/', 'm'), route + ' must not be statically imported');
  }
});

test('lazy route tree and staff recovery are covered by Suspense', () => {
  assert.match(app, /import \\{ lazy, Suspense, useState, useEffect, useRef \\} from 'react'/);
  assert.match(app, /<Suspense fallback=\\{<div role="status"/);
  assert.match(app, /<StaffPasswordPage key=\\{session\\.user\\.id\\}/);
  assert.match(app, /<Routes>/);
});

test('route-level permission gates remain in place for financials and dispatch', () => {
  assert.match(app, /function Gate\\(\\{access,section,children\\}/);
  assert.match(app, /canAccess\\(access,section\\)/);
  assert.match(app, /function GameGate\\(\\{access\\}/);
  assert.ok(app.includes('section={' + String.fromCharCode(96) + 'games.'));
  assert.match(app, /<Gate access=\\{access\\} section="financials"><FinancialsPage\\/>/);
  assert.match(app, /<Gate access=\\{access\\} section="dispatch"><DispatchRadarPage\\/>/);
});
