import { createClient } from '@supabase/supabase-js';
import {
  assertAdminMonimeEventSafeToProcess,
  assertSupportedAdminMonimeEvent
} from './monime-event-routing.js';

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

async function processAdminEvent(row) {
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
  ) {
    throw new ManualReviewError('Stored webhook payload failed its inbox identity check.');
  }

  const event = {
    id: envelope.event.id,
    type: envelope.event.name,
    object: envelope.object,
    data: envelope.data
  };

  try {
    assertSupportedAdminMonimeEvent(event);
    assertAdminMonimeEventSafeToProcess(event);
  } catch (error) {
    throw new ManualReviewError(error?.message || 'Monime event requires manual review.');
  }

  // Deliberately unreachable: no webhook event is allowed to update local
  // wallet balances or payout/payment records without a separately verified,
  // idempotent ledger-posting path.
  throw new ManualReviewError('Monime event requires manual review.');
}

function isFirstPendingAttempt(row) {
  return row.status === 'pending' && !row.last_error && Number(row.attempts) === 1;
}

export async function processAdminMonimeWebhookBatch({ db = createWorkerClient(), limit = 3 } = {}) {
  const batchLimit = Math.max(1, Math.min(25, Number(limit) || 3));
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
      await processAdminEvent(row);
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
