import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAdminMonimeEventSafeToProcess, assertSupportedAdminMonimeEvent } from '../server/monime-event-routing.js';

const event = (name, type) => ({ type: name, object: { id: 'object-test', type } });

test('admin Monime allowlist accepts the supported event/object pairs', () => {
  for (const [name, type] of [
    ['payout.completed', 'payout'],
    ['payout.failed', 'payout'],
    ['financial_account.credited', 'financial_account'],
    ['financial_account.debited', 'financial_account'],
    ['financial_transaction.created', 'financial_transaction'],
    ['payment.completed', 'payment'],
    ['payment.failed', 'payment'],
  ]) {
    assert.deepEqual(assertSupportedAdminMonimeEvent(event(name, type)), { name, objectType: type });
  }
});

test('admin Monime handler rejects unsupported event names for manual review', () => {
  for (const name of [
    'internal_transfer.completed',
    'checkout_session.completed',
    'payout.reversed',
    'payment.unknown',
    'payment.pending',
    'unknown.event',
  ]) {
    assert.throws(
      () => assertSupportedAdminMonimeEvent(event(name, name.startsWith('payout.') ? 'payout' : name.startsWith('payment.') ? 'payment' : 'unknown')),
      /unsupported|manual review/i
    );
  }
});

test('admin Monime handler rejects an event whose object type does not match its name', () => {
  assert.throws(
    () => assertSupportedAdminMonimeEvent(event('payout.completed', 'financial_account')),
    /object type does not match/i
  );
});

test('admin Monime handler rejects incomplete event metadata', () => {
  assert.throws(() => assertSupportedAdminMonimeEvent(null), /missing its event or object type/i);
  assert.throws(() => assertSupportedAdminMonimeEvent({ type: 'payout.completed', object: {} }), /missing its event or object type/i);
});


test('admin event processor quarantines all recognized Monime events until ledger posting is verified', () => {
  for (const [name, type] of [
    ['financial_account.credited', 'financial_account'],
    ['financial_account.debited', 'financial_account'],
    ['payout.completed', 'payout'],
    ['payout.failed', 'payout'],
    ['payment.completed', 'payment'],
    ['payment.failed', 'payment'],
    ['financial_transaction.created', 'financial_transaction'],
  ]) {
    assert.throws(
      () => assertAdminMonimeEventSafeToProcess(event(name, type)),
      /manual review/i
    );
  }
});

test('admin event processor blocks payout, payment and raw financial-transaction settlement until provider state is verified', () => {
  for (const [name, type] of [
    ['payout.completed', 'payout'],
    ['payout.failed', 'payout'],
    ['payment.completed', 'payment'],
    ['payment.failed', 'payment'],
    ['financial_transaction.created', 'financial_transaction'],
  ]) {
    assert.throws(
      () => assertAdminMonimeEventSafeToProcess(event(name, type)),
      /manual review until its current provider object/i
    );
  }
});
