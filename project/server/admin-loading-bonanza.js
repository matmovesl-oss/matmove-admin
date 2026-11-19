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
      if (!['loading-bonanza-overview', 'loading-bonanza-settings', 'loading-bonanza-fund'].includes(view)) throw failure(400, 'Invalid Loading Bonanza view.');
      const write = view !== 'loading-bonanza-overview';
      if (req.method !== (write ? 'POST' : 'GET')) throw failure(405, 'Method not allowed.');
      const { client, user, access } = await authorize(req, ['financials'], { env });
      if (req.query?.actor !== user.id) throw failure(409, 'Your signed-in account changed. Reopen Loading Bonanza.');


      if (view === 'loading-bonanza-fund') {
        if (access.is_owner !== true) throw failure(403, 'Only the owner may fund the referral treasury.');
        let body;
        try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
        catch { throw failure(400, 'Invalid treasury funding request.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body) ||
            Object.keys(body).some(key => !['requestId','amountMinor','confirmed'].includes(key)) ||
            !uuid(body.requestId) || !digits(body.amountMinor) || BigInt(body.amountMinor) <= 0n ||
            BigInt(body.amountMinor) > 9000000000000000n || body.confirmed !== true) {
          throw failure(400, 'Review and confirm the exact referral treasury funding amount.');
        }
        const mode = env.MONIME_ENVIRONMENT || (env.VERCEL_ENV === 'production' ? 'live' : null);
        const tokenMode = String(env.MONIME_API_KEY || '').startsWith('mon_test_') ? 'test' : String(env.MONIME_API_KEY || '').startsWith('mon_') ? 'live' : 'unknown';
        if (mode !== 'live' || tokenMode !== 'live' || !env.MONIME_SPACE_ID) {
          throw failure(503, 'Live Monime settings must be configured before funding the referral treasury.');
        }
        const source = env.MONIME_MAIN_ACCOUNT_ID;
        const destination = sourceFor(env);
        if (!/^fac-[A-Za-z0-9_-]+$/.test(source || '') || source === destination) {
          throw failure(503, 'Configure distinct MatMove main and referral financial accounts.');
        }
        const claim = await rpc(client, 'matmove_loading_bonanza_funding_claim', {
          p_actor: user.id, p_request: body.requestId, p_amount: body.amountMinor,
          p_source: source, p_destination: destination
        });
        if (claim?.id !== body.requestId || claim.actor_id !== user.id && claim.actor_id !== undefined) {
          throw failure(503, 'Referral treasury funding authorization was not confirmed.');
        }
        const provider = async (path, options = {}) => {
          if (options.method && options.method !== 'POST') throw failure(400, 'Invalid Monime funding operation.');
          if (options.method === 'POST' && path !== 'internal-transfers') throw failure(400, 'Invalid Monime funding operation.');
          if (!options.method && !/^internal-transfers\/trn-[A-Za-z0-9_-]+$/.test(path)) throw failure(400, 'Invalid Monime receipt path.');
          const response = await fetch(`https://api.monime.io/v1/${path}`, {
            ...options, redirect: 'error', signal: AbortSignal.timeout(12000),
            headers: { Authorization: `Bearer ${env.MONIME_API_KEY}`, 'Monime-Space-Id': env.MONIME_SPACE_ID,
              'Monime-Version': 'caph.2025-08-23', 'Content-Type': 'application/json', ...options.headers }
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.result) throw failure(503, 'Monime could not confirm the original treasury funding transfer.');
          return payload.result;
        };
        if (claim.provider_id) {
          const receipt = await provider(`internal-transfers/${encodeURIComponent(claim.provider_id)}`);
          const matches = receipt?.id === claim.provider_id && receipt.amount?.currency === 'SLE' &&
            receipt.amount.value === Number(body.amountMinor) &&
            receipt.sourceFinancialAccount?.id === source && receipt.destinationFinancialAccount?.id === destination &&
            receipt.metadata?.matmoveLoadingBonanzaFundingId === body.requestId &&
            receipt.metadata?.matmoveRequestKey === body.requestId &&
            ['pending','processing','completed','failed'].includes(receipt.status);
          const saved = await rpc(client, 'matmove_loading_bonanza_funding_record', {
            p_actor: user.id, p_request: body.requestId, p_receipt: matches ? receipt : null
          });
          return res.status(200).json({ ...saved, actor: user.id, recovered: true });
        }
        if (claim.can_create !== true) throw failure(409, 'This funding request is already processing or needs receipt review. Do not start another transfer.');
        let receipt;
        try {
          receipt = await provider('internal-transfers', {
            method: 'POST',
            headers: { 'Idempotency-Key': `matmove-loading-bonanza-funding:${body.requestId}` },
            body: JSON.stringify({
              amount: { currency: 'SLE', value: Number(body.amountMinor) },
              sourceFinancialAccount: { id: source },
              destinationFinancialAccount: { id: destination },
              description: 'MatMove Loading Bonanza treasury funding',
              metadata: { matmoveLoadingBonanzaFundingId: body.requestId, matmoveRequestKey: body.requestId }
            })
          });
        } catch (error) {
          await rpc(client, 'matmove_loading_bonanza_funding_record', { p_actor: user.id, p_request: body.requestId, p_receipt: null }).catch(() => {});
          throw error;
        }
        const matches = typeof receipt?.id === 'string' && /^trn-[A-Za-z0-9_-]+$/.test(receipt.id) &&
          receipt.amount?.currency === 'SLE' && receipt.amount.value === Number(body.amountMinor) &&
          receipt.sourceFinancialAccount?.id === source && receipt.destinationFinancialAccount?.id === destination &&
          receipt.metadata?.matmoveLoadingBonanzaFundingId === body.requestId &&
          receipt.metadata?.matmoveRequestKey === body.requestId &&
          ['pending','processing','completed','failed'].includes(receipt.status);
        const saved = await rpc(client, 'matmove_loading_bonanza_funding_record', {
          p_actor: user.id, p_request: body.requestId, p_receipt: matches ? receipt : null
        });
        if (saved?.id !== body.requestId || !['processing','completed','failed','review_required'].includes(saved.state)) {
          throw failure(503, 'Treasury funding receipt was not confirmed.');
        }
        return res.status(200).json({ ...saved, actor: user.id });
      }

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
          (body.enabled === true && BigInt(body.budgetMinor) === 0n) ||
          typeof body.enabled !== 'boolean' ||
          typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.trim().length > 500 ||
          body.confirmed !== true) {
        throw failure(400, 'Review and confirm the minimum top-up, campaign budget and reason.');
      }
      if (body.enabled && (env.MONIME_ENVIRONMENT !== 'live' || !String(env.MONIME_API_KEY || '').startsWith('mon_') || String(env.MONIME_API_KEY || '').startsWith('mon_test_') || !env.MONIME_SPACE_ID || !env.CRON_SECRET)) {
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
