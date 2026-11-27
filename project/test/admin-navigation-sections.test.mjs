import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout = readFileSync(new URL('../src/components/AdminLayout.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('Admin navigation is grouped into compact expandable workspaces', () => {
  for (const label of [
    'Operations & Support',
    'Finance & Wallets',
    'Customers & KYC',
    'Administration & App Releases',
    'Sports & Tournaments',
    'Games & Events',
    'Reports & System',
  ]) assert.ok(layout.includes(label), `missing workspace: ${label}`);

  for (const route of [
    '/financials', '/civitas', '/loading-bonanza', '/cash-payments',
    '/transactions', '/payouts', '/special', '/payroll',
    '/sports', '/games', '/events', '/customers', '/kyc', '/staff', '/app-releases',
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

test('Admin account identity and sign-out live together inside the collapsible sidebar', () => {
  const sidebarStart = layout.indexOf('id="admin-sidebar"');
  const sidebarEnd = layout.indexOf('</aside>', sidebarStart);
  const headerStart = layout.indexOf('<header className="mm-admin-header');
  const headerEnd = layout.indexOf('</header>', headerStart);
  assert.ok(sidebarStart >= 0 && sidebarEnd > sidebarStart, 'admin sidebar should be present');
  assert.ok(headerStart >= 0 && headerEnd > headerStart, 'admin header should be present');

  const sidebar = layout.slice(sidebarStart, sidebarEnd);
  const header = layout.slice(headerStart, headerEnd);
  const accountPanelStart = sidebar.indexOf('aria-label="Signed-in admin account"');
  const signOutButton = sidebar.indexOf('aria-label="Sign out"', accountPanelStart);
  const sidebarFooter = sidebar.indexOf('MATMOVE OPERATIONS', accountPanelStart);

  assert.ok(accountPanelStart >= 0, 'signed-in admin card belongs in the sidebar');
  assert.ok(signOutButton > accountPanelStart, 'sign-out belongs directly after the account card');
  assert.ok(sidebarFooter > signOutButton, 'account and sign-out stay above the pinned sidebar footer');
  assert.match(sidebar.slice(accountPanelStart, sidebarFooter), /access\.full_name/);
  assert.match(sidebar.slice(accountPanelStart, sidebarFooter), /access\.email/);
  assert.match(sidebar.slice(accountPanelStart, sidebarFooter), /handleSignOut/);
  assert.doesNotMatch(header, /access\.full_name|access\.email|aria-label="Sign out"|handleSignOut/);
});
