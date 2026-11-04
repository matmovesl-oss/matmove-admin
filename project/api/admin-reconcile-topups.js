import { requireAdmin, failure } from '../server/admin-auth.js';

const VERSION = 'caph.2025-08-23';
const SESSION_ID = /^scs-[A-Za-z0-9_-]+$/;
const VALID_SESSION_STATES = new Set(['pending', 'completed', 'cancelled', 'expired']);

function amountToMinor(value) {
  const text = String(value ?? '').trim();
  if (!/^\\d+(?:\\.\\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor < 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(minor);
}

function summarizeSession(row, session) {
  const metadata = session?.metadata && typeof session.metadata === 'object' ? session.metadata : {};
  const items = session?.lineItems?.data;
  const expectedMinor = amountToMinor(row.amount);
  const metadataMinor = amountToMinor(metadata.amount);
  let lineItemsMinor = 0;
  let lineItemsCurrency = null;
  let lineItemsValid = Array.isArray(items) && items.length > 0;

  if (lineItemsValid) {
    for (const item of items) {
      const currency = item?.price?.currency;
      const value = item?.price?.value;
      const quantity = item?.quantity;
      if (typeof currency !== 'string' || !currency ||
          !Number.isSafeInteger(value) || value < 0 ||
          !Number.isSafeInteger(quantity) || quantity < 1 ||
          (lineItemsCurrency && lineItemsCurrency !== currency)) {
        lineItemsValid = false;
        break;
      }
      lineItemsCurrency = currency;
      lineItemsMinor += value * quantity;
      if (!Number.isSafeInteger(lineItemsMinor)) {
        lineItemsValid = false;
        break;
      }
    }
  }

  const identityMatches =
    metadata.payment_transaction_id === row.id &&
    metadata.wallet_id === row.wallet_id &&
    (!row.user_id || metadata.matmove_user_id === row.user_id);
  const amountMatches =
    expectedMinor !== null &&
    metadataMinor === expectedMinor &&
    metadata.currency === row.currency &&
    lineItemsValid &&
    lineItemsCurrency === row.currency &&
    lineItemsMinor === expectedMinor &&
    items.every(item => item.reference === row.id);

  const directWalletAccountId = row.walletAccountId || null;
  const settlementAccountId = typeof session?.financialAccountId === 'string'
    ? session.financialAccountId
    : null;
  const settlementTarget = !settlementAccountId
    ? 'not_supplied'
    : directWalletAccountId && settlementAccountId === directWalletAccountId
      ? 'customer_wallet'
      : 'different_from_customer_wallet';

  const status = VALID_SESSION_STATES.has(session?.status)
    ? session.status
    : 'unknown';
  const verified = identityMatches && amountMatches && session?.id === row.provider_reference;
  let finding = 'review_required';
  if (verified && status === 'completed') {
    finding = settlementTarget === 'customer_wallet'
      ? 'provider_completed_to_customer_wallet'
      : 'provider_completed_but_settlement_target_needs_review';
  } else if (verified && status === 'cancelled') {
    finding = 'provider_cancelled';
  } else if (verified && status === 'expired') {
    finding = 'provider_expired';
  } else if (verified && status === 'pending') {
    finding = 'provider_still_pending';
  }

  return {
    paymentTransactionId: row.id,
    providerReference: row.provider_reference,
    localStatus: row.status,
    providerStatus: status,
    currency: row.currency,
    amount: String(row.amount),
    initiatedAt: row.initiated_at,
    updatedAt: row.updated_at,
    identityMatches,
    amountMatches,
    settlementTarget,
    settlementAccountId,
    customerWalletAccountId: directWalletAccountId,
    finding,
    safeToAutoUpdate: false,
  };
}

async function getCheckoutSession(id, { env, fetcher }) {
  let response;
  try {
    response = await fetcher(
      'https://api.monime.io/v1/checkout-sessions/' + encodeURIComponent(id),
      {
        method: 'GET',
        redirect: 'error',
        headers: {
          Authorization: 'Bearer ' + env.MONIME_API_KEY,
          'Monime-Space-Id': env.MONIME_SPACE_ID,
          'Monime-Version': VERSION,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      }
    );
  } catch {
    return { error: 'provider_unavailable' };
  }

  if (!response.ok) return { error: response.status === 404 ? 'provider_session_not_found' : 'provider_request_failed' };
  const payload = await response.json().catch(() => null);
  if (!payload || payload.success !== true ||
      !payload.result || payload.result.id !== id) {
    return { error: 'provider_response_unverified' };
  }
  return { session: payload.result };
}

export function createHandler({
  authorize = requireAdmin,
  env = process.env,
  fetcher = fetch,
} = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Authorization');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
      const { client } = await authorize(req, ['financials', 'transactions'], { env });
      if (!env.MONIME_API_KEY || !env.MONIME_SPACE_ID) {
        throw failure(503, 'Monime server credentials are not configured.');
      }

      const requested = Number(req.query?.limit ?? 20);
      if (!Number.isInteger(requested) || requested < 1 || requested > 25) {
        throw failure(400, 'Limit must be between 1 and 25.');
      }

      const result = await client.from('payment_transactions')
        .select('id,user_id,wallet_id,provider_reference,amount,currency,status,provider,initiated_at,updated_at,provider_response')
        .eq('provider', 'monime')
        .eq('status', 'pending')
        .order('initiated_at', { ascending: true })
        .limit(requested);
      if (result.error) throw failure(503, 'Pending Monime top-ups could not be loaded.');

      const rows = result.data || [];
      const walletIds = [...new Set(rows.map(row => row.wallet_id).filter(Boolean))];
      let wallets = [];
      if (walletIds.length) {
        const walletResult = await client.from('wallets')
          .select('id,user_id,currency,monime_account_id,metadata')
          .in('id', walletIds);
        if (walletResult.error) throw failure(503, 'Customer wallet references could not be verified.');
        wallets = walletResult.data || [];
      }
      const walletMap = new Map(wallets.map(wallet => [wallet.id, wallet]));

      const findings = [];
      const concurrency = 3;
      for (let offset = 0; offset < rows.length; offset += concurrency) {
        const batch = rows.slice(offset, offset + concurrency);
        const checked = await Promise.all(batch.map(async row => {
          const ref = String(row.provider_reference || '');
          const stored = row.provider_response?.result;
          if (!SESSION_ID.test(ref) || stored?.id !== ref) {
            return {
              paymentTransactionId: row.id,
              providerReference: ref || null,
              localStatus: row.status,
              currency: row.currency,
              amount: String(row.amount),
              finding: 'invalid_or_unmatched_local_provider_reference',
              safeToAutoUpdate: false,
            };
          }

          const response = await getCheckoutSession(ref, { env, fetcher });
          if (response.error) {
            return {
              paymentTransactionId: row.id,
              providerReference: ref,
              localStatus: row.status,
              currency: row.currency,
              amount: String(row.amount),
              finding: response.error,
              safeToAutoUpdate: false,
            };
          }

          const wallet = walletMap.get(row.wallet_id);
          const walletAccountId = wallet?.monime_account_id ||
            wallet?.metadata?.monime_account_id || null;
          return summarizeSession({ ...row, walletAccountId }, response.session);
        }));
        findings.push(...checked);
      }

      return res.status(200).json({
        generatedAt: new Date().toISOString(),
        readOnly: true,
        updatesApplied: 0,
        checked: findings.length,
        limit: requested,
        findings,
        note: 'This preview never changes payment statuses, wallet balances, or ledger entries. Provider-completed sessions may still require a separate verified wallet-credit/settlement check.',
      });
    } catch (error) {
      return res.status(error.status || 500).json({
        error: error.status ? error.message : 'Top-up reconciliation preview failed.',
      });
    }
  };
}

export default createHandler();
