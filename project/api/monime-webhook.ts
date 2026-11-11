import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import {
  normalizeMonimeEnvelope,
  readMonimeRawBody,
  verifyMonimeSignature
} from '../server/monime-webhook-security.js';
import { processAdminMonimeWebhookBatch } from '../server/monime-webhook-worker.js';

export const config = {
  api: { bodyParser: false },
  maxDuration: 60
};

function hasValidCronAuthorization(req) {
  const secret = process.env.CRON_SECRET;
  if (typeof secret !== 'string' || secret.length < 32 || secret.length > 256) return false;

  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  const actual = Buffer.from(String(req.headers?.authorization || ''), 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function runWorker(req, res) {
  if (!hasValidCronAuthorization(req)) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    const result = await processAdminMonimeWebhookBatch({ limit: 3 });
    // Failed items are durably quarantined for manual review. The scheduler
    // should see a successful worker invocation, while the response exposes
    // the failed count for alerting.
    return res.status(200).json(result);
  } catch (error) {
    console.error('Monime webhook worker failed', { failure: 'worker_unavailable' });
    return res.status(503).json({ error: 'Webhook worker unavailable.' });
  }
}

async function receiveWebhook(req, res) {
  const secret = process.env.MONIME_WEBHOOK_SECRET;
  const projectUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret || secret.length < 32 || secret.length > 256 || !projectUrl || !serviceKey) {
    return res.status(503).json({ error: 'Webhook endpoint is not configured.' });
  }

  let rawBody;
  try {
    rawBody = await readMonimeRawBody(req);
  } catch {
    return res.status(413).json({ error: 'Invalid webhook body.' });
  }

  if (!verifyMonimeSignature(rawBody, req.headers?.['monime-signature'], secret)) {
    return res.status(401).json({ error: 'Unauthorized webhook.' });
  }

  let envelope;
  let event;
  try {
    envelope = JSON.parse(rawBody.toString('utf8'));
    event = normalizeMonimeEnvelope(envelope);
  } catch {
    return res.status(400).json({ error: 'Invalid webhook event.' });
  }

  const eventTimestamp = typeof event.timestamp === 'string' && Number.isFinite(Date.parse(event.timestamp))
    ? new Date(event.timestamp).toISOString()
    : null;

  try {
    const supabase = createClient(projectUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    const { error } = await supabase
      .from('matmove_admin_monime_webhook_events')
      .upsert({
        event_id: event.id,
        event_type: event.type,
        object_id: event.object.id,
        object_type: event.object.type,
        event_timestamp: eventTimestamp,
        payload: envelope,
        signature_verified: true,
        status: 'pending',
        // The existing database constraint requires attempts > 0.
        // The worker counts this first queued attempt as attempt 1.
        attempts: 1,
        received_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null
      }, {
        onConflict: 'event_id',
        ignoreDuplicates: true
      });

    if (error) {
      console.error('Monime webhook inbox insert failed', { code: error.code });
      return res.status(503).json({ error: 'Webhook storage unavailable.' });
    }

    // No provider lookup, wallet update or payout settlement runs here.
    // Acknowledge only after the signed event is durably stored.
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Monime webhook inbox unavailable', { failure: 'inbox_unavailable' });
    return res.status(503).json({ error: 'Webhook storage unavailable.' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'POST') return receiveWebhook(req, res);
  if (req.method === 'GET') return runWorker(req, res);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method Not Allowed' });
}
