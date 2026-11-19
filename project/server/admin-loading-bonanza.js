import { requireAdmin, failure } from './admin-auth.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const digits = value => typeof value === 'string' && /^\d{1,19}$/.test(value);

function sourceFor(env) {
  const id = env.MONIME_REFERRAL_ACCOUNT_ID;
  if (!/^fac-[A-Za-z0-9_-]+$/.test(id || '') ||
      [env.MONIME_SPIN_ACCOUNT_ID, env.MONIME_ESCROW_ACCOUNT_ID, env.MONIME_PLATFORM_FEE_ACCOUNT_ID, env.MONIME_MAIN_ACCOUNT_ID].filter(Boolean).includes(id)) {
    throw failure(503, 'Configure a separate SLE referral treasury before enabling Loading Bonanza.');
  }
  return id;
}

async function rpc(client, name, args) {
  const result = await client.rpc(name, args);
  if (result.error) {
    const message = String(result.error.message || '');
    for (const [prefix, status] of [['FORBIDDEN:',403],['CONFLICT:',409],['INVALID:',400]]) {
      if (message.startsWith(prefix)) throw failure(status, message.slice(prefix.length).trim());
    }
    throw failure(503, 'Loading Bonanza settings are unavailable. Apply the Loading Bonanza database migration first.');
  }
  return result.data;
}

export function createLoadingBonanzaAdminHandler({ authorize = requireAdmin, env = process.env } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const view = req.query?.view || new URL(req.url || '/api/admin-staff', 'https://admin.invalid').searchParams.get('view');
      if (!['loading-bonanza-overview', 'loading-bonanza-settings'].includes(view)) throw failure(400, 'Invalid Loading Bonanza view.');
      const write = view === 'loading-bonanza-settings';
      if (req.method !== (write ? 'POST' : 'GET')) throw failure(405, 'Method not allowed.');
      const { client, user, access } = await authorize(req, ['financials'], { env });
      if (req.query?.actor !== user.id) throw failure(409, 'Your signed-in account changed. Reopen Loading Bonanza.');

      if (!write) {
        const overview = await rpc(client, 'matmove_loading_bonanza_admin_overview', { p_actor: user.id });
        if (overview?.actor !== user.id ||
            !/^\d+$/.test(overview.campaign?.revision || '') ||
            !/^\d+$/.test(overview.campaign?.minimumTopupMinor || '') ||
            !/^\d+$/.test(overview.campaign?.budgetMinor || '') ||
            overview.campaign?.cashbackBps !== 100 ||
            typeof overview.campaign?.enabled !== 'boolean' ||
            !['rewards','pendingMinor','completedMinor','reviewMinor','reservedMinor'].every(key => /^\d+$/.test(overview.totals?.[key] || ''))) {
          throw failure(503, 'Loading Bonanza overview was not confirmed.');
        }
        return res.status(200).json({ ...overview, owner: access.is_owner === true });
      }

      if (access.is_owner !== true) throw failure(403, 'Only the owner may change Loading Bonanza settings.');
      let body;
      try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
      catch { throw failure(400, 'Invalid Loading Bonanza settings request.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          Object.keys(body).some(key => !['requestId','expectedRevision','enabled','minimumTopupMinor','budgetMinor','reason','confirmed'].includes(key)) ||
          !uuid(body.requestId) || !digits(body.expectedRevision) ||
          !digits(body.minimumTopupMinor) || !digits(body.budgetMinor) ||
          BigInt(body.minimumTopupMinor) <= 0n || BigInt(body.minimumTopupMinor) > 9000000000000000n ||
          BigInt(body.budgetMinor) > 9000000000000000n ||
          typeof body.enabled !== 'boolean' ||
          typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.trim().length > 500 ||
          body.confirmed !== true) {
        throw failure(400, 'Review and confirm the minimum top-up, campaign budget and reason.');
      }
      if (body.enabled && (env.MONIME_ENVIRONMENT !== 'live' || !env.MONIME_API_KEY || !env.MONIME_SPACE_ID || !env.CRON_SECRET)) {
        throw failure(503, 'Live Monime and scheduled reconciliation settings must be configured before activating cashback.');
      }
      const source = sourceFor(env);
      const saved = await rpc(client, 'matmove_loading_bonanza_admin_save', {
        p_actor: user.id,
        p_request: body.requestId,
        p_expected: body.expectedRevision,
        p_enabled: body.enabled,
        p_minimum: body.minimumTopupMinor,
        p_budget: body.budgetMinor,
        p_source: source,
        p_reason: body.reason.trim()
      });
      if (saved?.actor !== user.id || saved.requestId !== body.requestId || saved.saved !== true ||
          saved.revision !== (BigInt(body.expectedRevision) + 1n).toString()) {
        throw failure(503, 'Loading Bonanza settings receipt was not confirmed. Reload before retrying.');
      }
      return res.status(200).json(saved);
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.status ? error.message : 'Loading Bonanza request failed.' });
    }
  };
}
