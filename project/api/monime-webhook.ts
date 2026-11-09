import { createClient } from '@supabase/supabase-js';
import { normalizeMonimeEnvelope, readMonimeRawBody, verifyMonimeSignature } from '../server/monime-webhook-security.js';
import { assertAdminMonimeEventSafeToProcess } from '../server/monime-event-routing.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

const EVENT_ID = /^wke-[A-Za-z0-9_-]{1,120}$/;
const ACCOUNT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function claimEvent(client, event) {
  const now = new Date();
  const inserted = await client
    .from('matmove_monime_webhook_events')
    .insert({
      event_id: event.id,
      event_type: event.type,
      status: 'processing',
      attempts: 1,
      updated_at: now.toISOString(),
    })
    .select('event_id')
    .maybeSingle();

  if (!inserted.error) return { claimed: true };
  if (inserted.error.code !== '23505') throw new Error('Webhook event could not be recorded.');

  const existing = await client
    .from('matmove_monime_webhook_events')
    .select('status,attempts,updated_at')
    .eq('event_id', event.id)
    .maybeSingle();

  if (existing.error || !existing.data) throw new Error('Webhook event state could not be checked.');
  if (existing.data.status === 'processed') return { claimed: false, duplicate: true };

  const updatedAt = Date.parse(existing.data.updated_at || '');
  const stale = !Number.isFinite(updatedAt) || now.getTime() - updatedAt > 5 * 60 * 1000;
  if (existing.data.status === 'processing' && !stale) return { claimed: false, duplicate: true };

  let update = client
    .from('matmove_monime_webhook_events')
    .update({
      status: 'processing',
      attempts: Number(existing.data.attempts || 1) + 1,
      updated_at: now.toISOString(),
      last_error: null,
    })
    .eq('event_id', event.id);

  if (existing.data.status === 'failed') update = update.eq('status', 'failed');
  else update = update.eq('status', 'processing').lt('updated_at', new Date(now.getTime() - 5 * 60 * 1000).toISOString());

  const reclaimed = await update.select('event_id').maybeSingle();
  if (reclaimed.error) throw new Error('Webhook event could not be claimed.');
  return { claimed: !!reclaimed.data, duplicate: !reclaimed.data };
}

async function refreshWalletBalance(client, monimeAccountId) {
  if (!ACCOUNT_ID.test(monimeAccountId || '')) throw new Error('Invalid financial account reference.');
  const token = process.env.MONIME_API_KEY;
  const spaceId = process.env.MONIME_SPACE_ID;
  if (!token || !spaceId) throw new Error('Monime account refresh is not configured.');

  const response = await fetch(
    `https://api.monime.io/v1/financial-accounts/${encodeURIComponent(monimeAccountId)}?withBalance=true`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Monime-Space-Id': spaceId,
        'Monime-Version': 'caph.2025-08-23',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    }
  );

  if (!response.ok) throw new Error('Monime balance refresh failed.');
  const payload = await response.json();
  const account = payload?.result;
  const available = account?.balance?.available;
  if (
    account?.id !== monimeAccountId ||
    !available ||
    !['SLE', 'USD'].includes(available.currency) ||
    !Number.isSafeInteger(available.value) ||
    available.value < 0
  ) throw new Error('Monime returned an invalid financial account balance.');

  const updated = await client
    .from('wallets')
    .update({ balance: available.value / 100 })
    .eq('monime_account_id', monimeAccountId)
    .eq('currency', available.currency);

  if (updated.error) throw new Error('MatMove wallet balance refresh failed.');
}

async function processEvent(client, event) {
  assertAdminMonimeEventSafeToProcess(event);
  const { type: eventType, data } = event;

  if (eventType === 'payout.completed' || eventType === 'payout.failed') {
    const withdrawalId = data.metadata?.withdrawal_id || event.object?.metadata?.withdrawal_id;
    if (typeof withdrawalId !== 'string' || !UUID.test(withdrawalId)) {
      throw new Error('Monime payout event is missing a valid MatMove withdrawal reference.');
    }

    // Bind the provider event to a MatMove Monime withdrawal before calling
    // the privileged settlement RPC. Never settle another provider's request.
    const withdrawal = await client
      .from('withdrawal_requests')
      .select('id,provider,status,payment_transaction_id')
      .eq('id', withdrawalId)
      .maybeSingle();

    if (withdrawal.error || !withdrawal.data || withdrawal.data.provider !== 'monime') {
      throw new Error('Monime payout does not match a MatMove Monime withdrawal.');
    }

    const providerTransactionId =
      typeof event.object?.id === 'string' ? event.object.id :
      (typeof data.id === 'string' ? data.id : null);
    const succeeded = eventType === 'payout.completed';

    if (succeeded && !providerTransactionId) {
      throw new Error('Successful Monime payout is missing its provider transaction ID.');
    }

    const failureCode = !succeeded
      ? (typeof data.failure?.code === 'string' ? data.failure.code :
        (typeof data.failureCode === 'string' ? data.failureCode : null))
      : null;
    const failureMessage = !succeeded
      ? (typeof data.failure?.message === 'string' ? data.failure.message.slice(0, 500) :
        (typeof data.failureMessage === 'string' ? data.failureMessage.slice(0, 500) : 'Monime payout failed.'))
      : null;

    const settlement = await client.rpc('settle_wallet_withdrawal', {
      p_withdrawal_id: withdrawalId,
      p_success: succeeded,
      p_provider_transaction_id: providerTransactionId,
      p_provider_response: {
        event_id: event.id,
        event_type: eventType,
        object_id: event.object?.id || null,
        object_type: event.object?.type || null,
      },
      p_failure_code: failureCode,
      p_failure_message: failureMessage,
    });

    if (settlement.error || settlement.data?.success !== true) {
      throw new Error('MatMove withdrawal settlement failed.');
    }
    return;
  }

  if (eventType === 'financial_account.credited' || eventType === 'financial_account.debited') {
    const accountId = event.object?.id;
    if (typeof accountId !== 'string') throw new Error('Financial account event is missing its account ID.');
    // Never apply a potentially stale balance snapshot from an event. Read the
    // account's current authoritative balance from Monime instead.
    await refreshWalletBalance(client, accountId);
    return;
  }

  if (eventType.startsWith('payment.')) {
    const paymentId = event.object?.id;
    if (typeof paymentId !== 'string' || !paymentId) throw new Error('Payment event is missing its provider reference.');
    const status = eventType.slice('payment.'.length);
    const update = await client
      .from('payment_transactions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('provider', 'monime')
      .eq('provider_reference', paymentId);
    if (update.error) throw new Error('Payment status update failed.');
    return;
  }

  if (eventType === 'financial_transaction.created') {
    const accountId = data.financialAccount?.id || data.financialAccountId;
    const transactionId = event.object?.id || data.id;
    const amount = data.amount;
    const currency = amount?.currency;
    const minor = amount?.value;
    const direction = data.type || data.direction;

    if (
      typeof accountId !== 'string' ||
      !ACCOUNT_ID.test(accountId) ||
      typeof transactionId !== 'string' ||
      !['SLE', 'USD'].includes(currency) ||
      !Number.isSafeInteger(minor) ||
      minor <= 0
    ) throw new Error('Financial transaction event is invalid.');

    const transactionType =
      direction === 'in' || direction === 'credit' ? 'credit' :
      direction === 'out' || direction === 'debit' ? 'debit' : null;
    if (!transactionType) throw new Error('Financial transaction direction is invalid.');

    const wallet = await client
      .from('wallets')
      .select('id')
      .eq('monime_account_id', accountId)
      .eq('currency', currency)
      .maybeSingle();
    if (wallet.error) throw new Error('Wallet lookup failed.');

    if (wallet.data) {
      const existing = await client
        .from('wallet_transactions')
        .select('id')
        .eq('reference_code', transactionId)
        .maybeSingle();
      if (existing.error) throw new Error('Wallet transaction lookup failed.');

      if (!existing.data) {
        const inserted = await client.from('wallet_transactions').insert({
          wallet_id: wallet.data.id,
          amount: minor / 100,
          transaction_type: transactionType,
          status: 'completed',
          currency,
          reference_code: transactionId,
          description: typeof data.description === 'string'
            ? data.description.slice(0, 500)
            : 'Monime Financial Transaction',
        });
        if (inserted.error) throw new Error('Wallet transaction record failed.');
      }
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  const webhookSecret = process.env.MONIME_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(503).json({ error: 'Webhook verification is not configured.' });

  let eventId = null;
  let claimed = false;
  let supabase = null;

  try {
    const rawBody = await readMonimeRawBody(req);
    const signature = req.headers?.['monime-signature'];
    if (!verifyMonimeSignature(rawBody, signature, webhookSecret)) {
      return res.status(401).json({ error: 'Unauthorized webhook.' });
    }

    let envelope;
    try {
      envelope = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid webhook payload.' });
    }

    let event;
    try {
      // Monime's signed envelope contains event.id / event.name,
      // object.id / object.type, and a top-level data object.
      event = normalizeMonimeEnvelope(envelope);
    } catch {
      return res.status(400).json({ error: 'Invalid webhook event.' });
    }

    eventId = event.id;
    const projectUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!projectUrl || !serviceKey) return res.status(503).json({ error: 'Webhook storage is not configured.' });

    supabase = createClient(projectUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const claim = await claimEvent(supabase, event);
    if (!claim.claimed) {
      return res.status(200).json({ received: true, duplicate: true, event: event.type });
    }
    claimed = true;

    await processEvent(supabase, event);

    const completed = await supabase
      .from('matmove_monime_webhook_events')
      .update({
        status: 'processed',
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('event_id', eventId)
      .eq('status', 'processing');

    if (completed.error) throw new Error('Webhook completion could not be recorded.');
    return res.status(200).json({ received: true, event: event.type });
  } catch (error) {
    if (claimed && supabase && eventId) {
      try {
        await supabase
          .from('matmove_monime_webhook_events')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString(),
            last_error: 'Processing failed; retry required.',
          })
          .eq('event_id', eventId)
          .eq('status', 'processing');
      } catch {
        // The provider retry remains the recovery path if the failure record is unavailable.
      }
    }

    console.error('Monime webhook rejected or failed.', eventId || 'unidentified');
    return res.status(500).json({ error: 'Webhook processing failed.' });
  }
}
