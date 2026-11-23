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
    assert.ok(app.includes('const ' + route + ' = lazy('), route + ' should be lazy loaded');
  }
  const staticPageImports = app.split('\\n').filter(line =>
    line.startsWith('import ') && line.includes('/pages/') && !line.includes('LoginPage')
  );
  assert.deepEqual(staticPageImports, []);
});

test('lazy route tree and staff recovery are covered by Suspense', () => {
  assert.ok(app.includes("import { lazy, Suspense, useState, useEffect, useRef } from 'react'"));
  assert.ok(app.includes('<Suspense fallback='));
  assert.ok(app.includes('<StaffPasswordPage key={session.user.id}'));
  assert.ok(app.includes('<Routes>'));
});

test('route-level permission gates remain in place for financials and dispatch', () => {
  assert.ok(app.includes('function Gate({access,section,children}'));
  assert.ok(app.includes('canAccess(access,section)'));
  assert.ok(app.includes('function GameGate({access}'));
  assert.ok(app.includes('section={' + String.fromCharCode(96) + 'games.'));
  assert.ok(app.includes('<Gate access={access} section="financials"><FinancialsPage/></Gate>'));
  assert.ok(app.includes('<Gate access={access} section="dispatch"><DispatchRadarPage/></Gate>'));
});
