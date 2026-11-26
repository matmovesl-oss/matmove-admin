import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout = readFileSync(new URL('../src/components/AdminLayout.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('Admin navigation is grouped into compact expandable workspaces', () => {
  for (const label of [
    'Operations & Support',
    'Finance & Wallets',
    'Customers & Staff',
    'Sports & Tournaments',
    'Games & Events',
    'Reports & System',
  ]) assert.ok(layout.includes(label), `missing workspace: ${label}`);

  for (const route of [
    '/financials', '/civitas', '/loading-bonanza', '/cash-payments',
    '/transactions', '/payouts', '/special', '/payroll',
    '/sports', '/games', '/events', '/customers', '/kyc', '/staff',
  ]) assert.ok(layout.includes(`'${route}'`), `missing Admin route: ${route}`);

  assert.match(layout, /aria-expanded=\{expanded\}/);
  assert.ok(layout.includes('aria-controls={`admin-nav-group-${section.key}`}'));
  assert.match(layout, /sectionItems = visibleItems\.filter/);
  assert.match(layout, /setExpandedSection\(\(current\) => current === section\.key \? null : section\.key\)/);
  assert.match(layout, /const activeSection = navSections\.find\(\(section\) => section\.paths\.includes\(location\.pathname\)\)/);
});

test('Admin navigation no longer restores stale scroll offsets after menu changes', () => {
  assert.doesNotMatch(layout, /sidebarNavRef|mainRef|matmove-admin-scroll:/);
  assert.match(layout, /mm-admin-nav-list min-h-0 flex-1/);
  assert.match(styles, /\.mm-admin-nav-group/);
  assert.match(styles, /overscroll-behavior: contain/);
});
