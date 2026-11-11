import { requireAdmin } from '../server/admin-auth.js';

const EVENT_ID = /^wke-[A-Za-z0-9_-]{1,120}$/;

function missingReviewQueue(error) {
  const message = String(error?.message || '');
  return error?.code === '42P01' ||
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    error?.code === 'PGRST205' ||
    error?.status === 404 ||
    /matmove_admin_monime_webhook_events.*(not found|does not exist)/i.test(message) ||
    /(?:column|field).*review_state.*(?:not found|does not exist|schema cache)/i.test(message);
}

export function createHandler({
  requireAdminFn = requireAdmin,
  fetcher = fetch,
  env = process.env
} = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Authorization');

    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
      const { client, user } = await requireAdminFn(req, ['transactions']);

      if (req.method === 'POST') {
        const action = req.body?.action;
        const eventId = req.body?.eventId;
        const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';

        if (
          action !== 'mark-webhook-reviewed' ||
          typeof eventId !== 'string' ||
          !EVENT_ID.test(eventId) ||
          note.length < 3 ||
          note.length > 1000
        ) {
          return res.status(400).json({
            error: 'Provide a valid event ID and a review note between 3 and 1000 characters.'
          });
        }

        const result = await client.rpc('matmove_admin_monime_webhook_mark_reviewed', {
          p_event_id: eventId,
          p_actor_id: user.id,
          p_note: note
        });

        if (result.error) {
          const status = /NOT_FOUND:/i.test(result.error.message || '') ? 404 :
            /FORBIDDEN:/i.test(result.error.message || '') ? 403 : 503;
          return res.status(status).json({
            error: status === 404
              ? 'This event is no longer awaiting manual review. Refresh the queue.'
              : status === 403
                ? 'Your Transactions assignment is not active.'
                : 'The review note could not be saved. Apply the manual-review migration and retry.'
          });
        }

        if (
          result.data?.reviewed !== true ||
          result.data?.eventId !== eventId ||
          result.data?.reviewState !== 'reviewed'
        ) {
          return res.status(503).json({ error: 'The review state was not confirmed.' });
        }

        return res.status(200).json({
          success: true,
          reviewed: true,
          eventId,
          reviewState: 'reviewed'
        });
      }

      // Monime credentials must remain server-only. Never fall back to VITE_ keys.
      const apiKey = env.MONIME_API_KEY;
      const spaceId = env.MONIME_SPACE_ID;
      if (!apiKey || !spaceId) {
        return res.status(503).json({ error: 'Monime server configuration is missing.' });
      }

      const monimeRes = await fetcher('https://api.monime.io/v1/financial-transactions?limit=50', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Monime-Space-Id': spaceId,
          'Monime-Version': 'caph.2025-08-23',
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(15000)
      });

      const rawData = await monimeRes.json().catch(() => null);
      if (!monimeRes.ok || !rawData || !Array.isArray(rawData.result)) {
        return res.status(502).json({ error: 'Monime transactions are temporarily unavailable.' });
      }

      const review = await client
        .from('matmove_admin_monime_webhook_events')
        .select('event_id,event_type,object_id,object_type,status,attempts,received_at,updated_at,last_error')
        .eq('status', 'failed')
        .eq('review_state', 'unreviewed')
        .order('received_at', { ascending: true })
        .limit(100);

      if (review.error && !missingReviewQueue(review.error)) {
        return res.status(503).json({
          error: 'The private Monime manual-review queue is temporarily unavailable.',
          transactions: rawData.result,
          webhookReviewAvailable: false
        });
      }

      return res.status(200).json({
        transactions: rawData.result,
        webhookReviewAvailable: !review.error,
        webhookReviewEvents: review.error ? [] : (Array.isArray(review.data) ? review.data : []),
        webhookReviewError: review.error
          ? 'The manual-review migration is not installed in this database yet.'
          : null
      });
    } catch (error) {
      return res.status(error.status || 502).json({
        error: error.status ? error.message : 'Admin provider data unavailable.'
      });
    }
  };
}

export default createHandler();
