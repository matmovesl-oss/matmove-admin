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
      const view = typeof req.query?.view === 'string' ? req.query.view : '';
      if (view && view !== 'cash-collections') {
        return res.status(400).json({ error: 'Choose a supported transaction view.' });
      }
      if (view === 'cash-collections' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
      }

      const { client, user } = await requireAdminFn(
        req,
        view === 'cash-collections' ? ['financials'] : ['transactions']
      );

      if (view === 'cash-collections') {
        const settings = await client
          .from('matmove_cash_ride_settings')
          .select('enabled,provider_environment,fee_hold_account_id,fee_revenue_account_id')
          .eq('singleton', true)
          .maybeSingle();

        if (settings.error) {
          return res.status(503).json({
            available: false,
            error: 'Cash collection settings are not installed or are temporarily unavailable.'
          });
        }

        const payments = await client
          .from('matmove_cash_ride_payments')
          .select('booking_id,rider_id,driver_id,fare_minor,driver_cash_minor,matmove_fee_minor,currency,status,driver_cash_confirmed_at,rider_cash_confirmed_at,created_at,updated_at')
          .order('created_at', { ascending: false })
          .limit(100);

        if (payments.error) {
          return res.status(503).json({
            available: false,
            error: 'Cash collection records are not installed or are temporarily unavailable. Production cash collection remains disabled.'
          });
        }

        const rows = Array.isArray(payments.data) ? payments.data : [];
        const bookingIds = rows.map(row => row.booking_id);
        const profileIds = [...new Set(rows.flatMap(row => [row.rider_id, row.driver_id]).filter(Boolean))];
        let profiles = [];
        if (profileIds.length) {
          const profileResult = await client
            .from('profiles')
            .select('id,first_name,last_name,full_name,phone,phone_number,role')
            .in('id', profileIds);
          if (profileResult.error) {
            return res.status(503).json({
              available: false,
              error: 'Cash collection participant details are temporarily unavailable.'
            });
          }
          profiles = Array.isArray(profileResult.data) ? profileResult.data : [];
        }
        const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
        const person = id => {
          if (!id) return null;
          const profile = profileMap.get(id);
          if (!profile) return { id, name: 'Profile unavailable', phoneLastFour: null };
          const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
            || profile.full_name
            || 'Name unavailable';
          const phone = profile.phone || profile.phone_number || '';
          return {
            id: profile.id,
            name: String(name).slice(0, 120),
            phoneLastFour: phone ? String(phone).replace(/\D/g, '').slice(-4) || null : null
          };
        };
        let auditEvents = [];
        if (bookingIds.length) {
          const auditResult = await client
            .from('matmove_cash_ride_audit_events')
            .select('booking_id,event_type,actor_type,actor_profile_id,details,created_at')
            .in('booking_id', bookingIds)
            .order('created_at', { ascending: false })
            .limit(500);
          if (auditResult.error) {
            return res.status(503).json({
              available: false,
              error: 'Cash collection audit history is temporarily unavailable.'
            });
          }
          auditEvents = Array.isArray(auditResult.data) ? auditResult.data : [];
        }
        const auditByBooking = new Map();
        for (const event of auditEvents) {
          const list = auditByBooking.get(event.booking_id) || [];
          if (list.length < 8) {
            const details = event.details && typeof event.details === 'object' ? event.details : {};
            list.push({
              eventType: String(event.event_type || '').slice(0, 64),
              actorType: String(event.actor_type || 'system').slice(0, 16),
              actorName: event.actor_profile_id ? (person(event.actor_profile_id)?.name || 'Profile unavailable') : 'System',
              createdAt: event.created_at,
              reasonCode: typeof details.reasonCode === 'string' ? details.reasonCode.slice(0, 64) : null,
              legKind: typeof details.legKind === 'string' ? details.legKind.slice(0, 16) : null
            });
            auditByBooking.set(event.booking_id, list);
          }
        }
        let legs = [];
        if (bookingIds.length) {
          const legResult = await client
            .from('matmove_cash_ride_legs')
            .select('booking_id,leg_kind,amount_minor,currency,status,provider_transfer_id,verified_at,error_code')
            .in('booking_id', bookingIds);
          if (legResult.error) {
            return res.status(503).json({
              available: false,
              error: 'Cash transfer reconciliation records are temporarily unavailable.'
            });
          }
          legs = Array.isArray(legResult.data) ? legResult.data : [];
        }

        const legMap = new Map();
        for (const leg of legs) {
          const current = legMap.get(leg.booking_id) || {};
          current[leg.leg_kind] = leg;
          legMap.set(leg.booking_id, current);
        }

        const records = rows.map(row => {
          const paymentLegs = legMap.get(row.booking_id) || {};
          const reserve = paymentLegs.reserve || null;
          const capture = paymentLegs.capture || null;
          const refund = paymentLegs.refund || null;
          return {
            bookingReference: row.booking_id,
            rider: person(row.rider_id),
            driver: person(row.driver_id),
            auditEvents: auditByBooking.get(row.booking_id) || [],
            fareMinor: Number(row.fare_minor),
            driverCashMinor: Number(row.driver_cash_minor),
            feeMinor: Number(row.matmove_fee_minor),
            currency: row.currency,
            status: row.status,
            driverCashConfirmedAt: row.driver_cash_confirmed_at,
            riderCashConfirmedAt: row.rider_cash_confirmed_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            reserve: reserve ? {
              status: reserve.status,
              transferId: reserve.provider_transfer_id,
              verifiedAt: reserve.verified_at,
              errorCode: reserve.error_code
            } : null,
            capture: capture ? {
              status: capture.status,
              transferId: capture.provider_transfer_id,
              verifiedAt: capture.verified_at,
              errorCode: capture.error_code
            } : null,
            refund: refund ? {
              status: refund.status,
              transferId: refund.provider_transfer_id,
              verifiedAt: refund.verified_at,
              errorCode: refund.error_code
            } : null
          };
        });

        const sum = predicate => records.reduce(
          (total, row) => total + (predicate(row) ? row.feeMinor : 0),
          0
        );
        const settled = records.filter(row => row.status === 'settled');
        const summary = {
          recordCount: records.length,
          settledCount: settled.length,
          reviewCount: records.filter(row => row.status === 'review_required' ||
            [row.reserve,row.capture,row.refund].some(leg => leg?.status === 'review_required')).length,
          settledFareMinor: settled.reduce((total,row) => total + row.fareMinor,0),
          confirmedDriverCashMinor: settled.reduce((total,row) => total + row.driverCashMinor,0),
          reservedFeeMinor: records.reduce((total,row) =>
            total + (row.reserve?.status === 'completed' &&
              row.capture?.status !== 'completed' &&
              row.refund?.status !== 'completed' ? row.feeMinor : 0),0),
          capturedFeeMinor: sum(row => row.capture?.status === 'completed'),
          refundedFeeMinor: sum(row => row.refund?.status === 'completed')
        };

        const holdAccountId = settings.data?.fee_hold_account_id;
        const revenueAccountId = settings.data?.fee_revenue_account_id;
        const deploymentEscrowAccountId = env.MONIME_ESCROW_ACCOUNT_ID;
        const deploymentFeeAccountId = env.MONIME_PLATFORM_FEE_ACCOUNT_ID;
        const validAccountId = value => typeof value === 'string' && /^fac-[A-Za-z0-9_-]+$/.test(value);
        const escrowMatchesDeployment = validAccountId(holdAccountId) &&
          validAccountId(deploymentEscrowAccountId) &&
          holdAccountId === deploymentEscrowAccountId;
        const revenueMatchesDeployment = validAccountId(revenueAccountId) &&
          validAccountId(deploymentFeeAccountId) &&
          revenueAccountId === deploymentFeeAccountId &&
          validAccountId(holdAccountId) &&
          holdAccountId !== revenueAccountId;
        const maskAccountId = value => validAccountId(value)
          ? value.slice(0, 6) + '…' + value.slice(-4)
          : null;

        return res.status(200).json({
          available: true,
          // Report cash as operational only when the Admin deployment agrees
          // with the shared Supabase revenue destination and separate hold account.
          cashEnabled: settings.data?.enabled === true && escrowMatchesDeployment && revenueMatchesDeployment,
          configuredEnabled: settings.data?.enabled === true,
          providerEnvironment: settings.data?.provider_environment || null,
          feeAccounts: {
            holdingAccount: maskAccountId(holdAccountId),
            revenueAccount: maskAccountId(revenueAccountId),
            escrowMatchesDeployment,
            revenueMatchesDeployment
          },
          source: 'matmove_cash_ride_payments',
          limit: 100,
          records,
          summary
        });
      }

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
