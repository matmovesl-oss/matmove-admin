const PAYMENT_STATUSES = new Set([
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'expired',
]);

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
