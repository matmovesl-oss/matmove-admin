// Validate the event/object pair, but do not mutate MatMove money records from
// webhook notifications alone. Manual review is required until the provider
// object, exact amount/currency, destination and MatMove ledger posting are
// reconciled and idempotently recorded.
const PAYMENT_STATUSES = new Set(['completed', 'failed']);

export function assertSupportedAdminMonimeEvent(event) {
  const name = event?.type;
  const objectType = event?.object?.type;

  if (typeof name !== 'string' || typeof objectType !== 'string') {
    throw new Error('Monime event is missing its event or object type.');
  }

  let expectedObjectType = null;

  if (name === 'payout.completed' || name === 'payout.failed') {
    expectedObjectType = 'payout';
  } else if (
    name === 'financial_account.credited' ||
    name === 'financial_account.debited'
  ) {
    expectedObjectType = 'financial_account';
  } else if (name === 'financial_transaction.created') {
    expectedObjectType = 'financial_transaction';
  } else if (name.startsWith('payment.')) {
    const status = name.slice('payment.'.length);
    if (!PAYMENT_STATUSES.has(status)) {
      throw new Error('Unsupported Monime payment status event; manual review required.');
    }
    expectedObjectType = 'payment';
  } else {
    throw new Error('Unsupported Monime event type; manual review required.');
  }

  if (objectType !== expectedObjectType) {
    throw new Error('Monime event object type does not match its event name.');
  }

  return { name, objectType };
}

export function assertAdminMonimeEventSafeToProcess(event) {
  const { name } = assertSupportedAdminMonimeEvent(event);

  throw new Error(
    `Monime ${name} event is retained for manual review. Automatic wallet, payout and payment updates are disabled until the current provider object is reconciled with the exact MatMove ledger entry.`
  );
}
