import { createClient } from '@supabase/supabase-js';
import { assertAdminMonimeEventSafeToProcess } from './monime-event-routing.js';

const MAX_ATTEMPTS = 12;

class ManualReviewError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ManualReviewError';
    this.permanent = true;
  }
}

function createWorkerClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase worker configuration missing.');
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

async function getCurrentFinancialAccount(accountId) {
  const token = process.env.MONIME_API_KEY;
  const spaceId = process.env.MONIME_SPACE_ID;
  if (!token || !spaceId) throw new Error('Monime account refresh is not configured.');

  const response = await fetch(
    `https://api.monime.io/v1/financial-accounts/${encodeURIComponent(accountId)}?withBalance=true`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Monime-Space-Id': spaceId,
        'Monime-Version': 'caph.2025-08-23',
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(12000)
    }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.result) {
    throw new Error(`Monime financial-account lookup failed (HTTP ${response.status}).`);
  }

  const account = payload.result;
  const balance = account?.balance?.available;
  if (
    account.id !== accountId ||
    !balance ||
    !['SLE', 'USD'].includes(balance.currency) ||
    !Number.isSafeInteger(balance.value) ||
    balance.value < 0
  ) throw new ManualReviewError('Monime returned a financial account with invalid balance details.');

  return { currency: balance.currency, balance: balance.value / 100 };
}

async function processAdminEvent(db, row) {
  if (row.signature_verified !== true) {
    throw new ManualReviewError('Webhook event was not verified at ingress; manual review required.');
  }

  const envelope = row.payload;
  if (
    !envelope ||
    envelope.event?.id !== row.event_id ||
    envelope.event?.name !== row.event_type ||
    envelope.object?.id !== row.object_id ||
    envelope.object?.type !== row.object_type
  ) throw new ManualReviewError('Stored webhook payload failed its inbox identity check.');

  const event = {
    id: envelope.event.id,
    type: envelope.event.name,
    object: envelope.object,
    data: envelope.data
  };

  try {
    assertAdminMonimeEventSafeToProcess(event);
  } catch (error) {
    throw new ManualReviewError(error?.message || 'Monime event requires manual review.');
  }

  // At present the only event family safe to process automatically is a
  // financial-account credit/debit notification, because we re-read the
  // current provider balance before updating MatMove's cached wallet value.
  // Payouts, payins, and raw financial transactions remain quarantined until
  // their current provider objects can be fetched and fully reconciled.
  if (
    event.type !== 'financial_account.credited' &&
    event.type !== 'financial_account.debited'
  ) throw new ManualReviewError('Monime event is not enabled for automatic processing.');

  const accountId = event.object.id;
  if (typeof accountId !== 'string' || accountId.length < 3 || accountId.length > 128) {
    throw new ManualReviewError('Financial-account event has an invalid account identifier.');
  }

  const current = await getCurrentFinancialAccount(accountId);
  const lookup = await db
    .from('wallets')
    .select('id,monime_account_id,currency')
    .eq('monime_account_id', accountId)
    .eq('currency', current.currency);

  if (lookup.error) throw new Error('MatMove wallet lookup failed.');
  if (!Array.isArray(lookup.data) || lookup.data.length !== 1) {
    throw new ManualReviewError(
      'Monime financial account does not map to exactly one MatMove wallet.'
    );
  }

  const wallet = lookup.data[0];
  if (wallet.monime_account_id !== accountId || wallet.currency !== current.currency) {
    throw new ManualReviewError('MatMove wallet account mapping does not match the provider account.');
  }

  const updated = await db
    .from('wallets')
    .update({ balance: current.balance })
    .eq('id', wallet.id)
    .eq('monime_account_id', accountId)
    .eq('currency', current.currency)
    .select('id')
    .maybeSingle();

  if (updated.error || !updated.data?.id) {
    throw new Error('MatMove wallet balance refresh could not be confirmed.');
  }
}

function isFirstPendingAttempt(row) {
  return row.status === 'pending' && !row.last_error && Number(row.attempts) === 1;
}

export async function processAdminMonimeWebhookBatch({ db = createWorkerClient(), limit = 10 } = {}) {
  const batchLimit = Math.max(1, Math.min(25, Number(limit) || 10));
  const staleCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const [pendingResult, staleResult] = await Promise.all([
    db.from('matmove_admin_monime_webhook_events')
      .select('event_id,event_type,status,attempts,updated_at,received_at,last_error,payload,object_id,object_type,signature_verified')
      .eq('status', 'pending')
      .order('received_at', { ascending: true })
      .limit(batchLimit),
    db.from('matmove_admin_monime_webhook_events')
      .select('event_id,event_type,status,attempts,updated_at,received_at,last_error,payload,object_id,object_type,signature_verified')
      .eq('status', 'processing')
      .lt('updated_at', staleCutoff)
      .order('updated_at', { ascending: true })
      .limit(batchLimit)
  ]);

  if (pendingResult.error || staleResult.error) {
    throw new Error('Could not read the Monime webhook inbox.');
  }

  const queue = [...(pendingResult.data || []), ...(staleResult.data || [])]
    .sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime())
    .slice(0, batchLimit);

  let processed = 0;
  let retrying = 0;
  let failed = 0;

  for (const row of queue) {
    const now = new Date().toISOString();
    const attempts = Math.max(1, Number(row.attempts) || 1);
    const nextAttempt = isFirstPendingAttempt(row) ? attempts : attempts + 1;

    let claim = db.from('matmove_admin_monime_webhook_events')
      .update({
        status: 'processing',
        attempts: nextAttempt,
        updated_at: now,
        last_error: null
      })
      .eq('event_id', row.event_id)
      .eq('status', row.status);

    if (row.status === 'processing') {
      claim = claim.lt('updated_at', staleCutoff);
    }

    const { data: claimed, error: claimError } = await claim
      .select('event_id')
      .maybeSingle();

    if (claimError) throw new Error('Could not claim a Monime webhook event.');
    if (!claimed) continue;

    try {
      await processAdminEvent(db, row);
      const { error } = await db.from('matmove_admin_monime_webhook_events')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: null
        })
        .eq('event_id', row.event_id)
        .eq('status', 'processing');

      if (error) throw new Error('Could not persist Monime event completion.');
      processed++;
    } catch (error) {
      const permanent = error?.permanent === true;
      const exhausted = nextAttempt >= MAX_ATTEMPTS;
      const nextStatus = permanent || exhausted ? 'failed' : 'pending';
      const safeMessage = String(error?.message || 'Monime event processing failed.').slice(0, 900);
      const { error: persistError } = await db.from('matmove_admin_monime_webhook_events')
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
          last_error: safeMessage
        })
        .eq('event_id', row.event_id)
        .eq('status', 'processing');

      if (persistError) throw new Error('Could not persist Monime event retry or review state.');
      if (nextStatus === 'failed') failed++;
      else retrying++;
    }
  }

  return { checked: queue.length, processed, retrying, failed };
}
