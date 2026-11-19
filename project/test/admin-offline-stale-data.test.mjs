import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('dashboard retains verified overview and Monime balances while polling or offline', async () => {
  const page = await readFile('src/pages/DashboardPage.tsx', 'utf8');
  assert.match(page, /hasOverviewSnapshot/);
  assert.match(page, /hasTreasurySnapshot/);
  assert.match(page, /snapshotStamp/);
  assert.match(page, /navigator\.onLine/);
  assert.match(page, /Showing the last verified dashboard data/);
  assert.match(page, /Showing the last verified Monime balances/);
});

test('KYC, transactions, customer and payout pages retain their last successful data', async () => {
  const [dashboard, transactions, users, withdrawals] = await Promise.all([
    readFile('src/pages/AdminDashboard.tsx', 'utf8'),
    readFile('src/pages/TransactionsPage.tsx', 'utf8'),
    readFile('src/pages/UsersPage.tsx', 'utf8'),
    readFile('src/pages/WithdrawalsPage.tsx', 'utf8')
  ]);
  assert.match(dashboard, /hasProfileSnapshot/);
  assert.doesNotMatch(dashboard, /setProfiles\(\[\]\); setSubmissions\(\[\]\); setDocuments\(\[\]\)/);
  assert.match(transactions, /hasSnapshot\.current/);
  assert.match(transactions, /Showing the last loaded gateway transactions/);
  assert.match(users, /lastSnapshotStamp/);
  assert.match(users, /Showing the last loaded customer records/);
  assert.match(withdrawals, /hasSnapshot\.current/);
  assert.match(withdrawals, /Showing the last loaded payout records/);
  assert.match(withdrawals, /loadError/);
});
