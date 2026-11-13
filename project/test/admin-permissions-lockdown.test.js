import test from 'node:test';
import assert from 'node:assert/strict';
import { canAdminAccess, homeFor } from '../shared/admin-permissions.js';

test('unidentified, inactive and removed users are denied regardless of old permissions', () => {
  assert.equal(canAdminAccess(null, 'financials'), false);
  assert.equal(canAdminAccess({ id: 'user-a', is_active: false, permissions: ['financials'] }, 'financials'), false);
  assert.equal(canAdminAccess({ id: 'user-b', is_active: true, removed_at: '2026-11-01T00:00:00Z', permissions: ['financials'] }, 'financials'), false);
});

test('active staff without an assigned permission are denied', () => {
  const staff = { id: 'user-c', is_active: true, removed_at: null, is_owner: false, permissions: [] };
  assert.equal(canAdminAccess(staff, 'financials'), false);
  assert.equal(canAdminAccess(staff, 'kyc'), false);
  assert.equal(homeFor(staff), '/access-denied');
});

test('active staff retain only the permissions assigned to them', () => {
  const staff = { id: 'user-d', is_active: true, removed_at: null, is_owner: false, permissions: ['kyc'] };
  assert.equal(canAdminAccess(staff, 'kyc'), true);
  assert.equal(canAdminAccess(staff, 'financials'), false);
});

test('active owner retains owner access', () => {
  const owner = { id: 'owner', is_active: true, removed_at: null, is_owner: true, permissions: [] };
  assert.equal(canAdminAccess(owner, 'financials'), true);
  assert.equal(canAdminAccess(owner, 'staff'), true);
});

test('owner status cannot override removal or inactivity', () => {
  assert.equal(canAdminAccess({ is_owner: true, is_active: false, removed_at: null }, 'staff'), false);
  assert.equal(canAdminAccess({ is_owner: true, is_active: true, removed_at: '2026-11-01T00:00:00Z' }, 'staff'), false);
});
