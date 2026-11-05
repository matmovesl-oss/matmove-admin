import {requireAdmin} from '../server/admin-auth.js';
import {canAdminAccess} from '../shared/admin-permissions.js';
import { createClient } from '@supabase/supabase-js';

export function createHandler(
  clientFactory = createClient,
  fetcher = fetch,
  env = process.env
) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Authorization');

    if (req.method !== 'GET') {
      return res.status(405).json({
        error: 'Method Not Allowed'
      });
    }

    try {
      const token = /^Bearer\s+(\S+)$/i.exec(
        req.headers.authorization || ''
      )?.[1];

      if (!token) {
        return res.status(401).json({
          error: 'Please sign in to the admin portal.'
        });
      }

      const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;

      if (!url || !env.SUPABASE_SERVICE_ROLE_KEY || !env.MONIME_API_KEY || !env.MONIME_SPACE_ID) {
        return res.status(503).json({
          error: 'Admin Supabase or Monime server settings are missing.'
        });
      }

      const client = clientFactory(url, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });

      const { data: authData, error: authError } = await client.auth.getUser(token);
      if (authError || !authData?.user) {
        return res.status(401).json({
          error: 'Session expired. Please sign in again.'
        });
      }

      const {access} = await requireAdmin(req, ['financials', 'games.settings', 'special'], {client, env});
      const financial = canAdminAccess(access, 'financials');
      const special = canAdminAccess(access, 'special');

      let savedReferral = null;
      if (financial) {
        const campaign = await client.from('matmove_referral_campaign')
          .select('treasury_account').eq('singleton', true).maybeSingle();

        // Financial totals depend on an authoritative campaign classification.
        // A missing row, failed read or malformed value must not be treated as
        // an empty/zero treasury classification.
        if (
          campaign.error ||
          !campaign.data ||
          !Object.prototype.hasOwnProperty.call(campaign.data, 'treasury_account')
        ) {
          return res.status(503).json({
            error: 'Referral account classification is unavailable. Refresh after the campaign setup is verified.'
          });
        }

        const campaignReferral = campaign.data.treasury_account;
        if (
          campaignReferral !== null &&
          (typeof campaignReferral !== 'string' || !/^fac-[A-Za-z0-9_-]+$/.test(campaignReferral))
        ) {
          return res.status(503).json({
            error: 'Referral account classification is invalid. No treasury totals were returned.'
          });
        }
        if (typeof campaignReferral === 'string') savedReferral = campaignReferral;
      }

      const travelId = env.MONIME_TRAVEL_ACCOUNT_ID || env.VITE_MONIME_TRAVEL_ACCOUNT_ID;
      const eventId = env.MONIME_EVENT_ACCOUNT_ID || env.VITE_MONIME_EVENT_ACCOUNT_ID;
      // Return only the account identifier and live balance; never expose credentials.
      const refundId = env.MONIME_REFUND_ACCOUNT_ID;

      const configured = [
        env.MONIME_ESCROW_ACCOUNT_ID,
        env.MONIME_PLATFORM_FEE_ACCOUNT_ID,
        env.MONIME_SPIN_ACCOUNT_ID,
        env.MONIME_MAIN_ACCOUNT_ID,
        env.MONIME_REFERRAL_ACCOUNT_ID,
        travelId,
        eventId,
        refundId,
        savedReferral
      ].filter(Boolean);

      if (financial && configured.some(id => typeof id !== 'string' || !/^fac-[A-Za-z0-9_-]+$/.test(id))) {
        return res.status(503).json({error: 'Platform account configuration is invalid.'});
      }

      if (special && refundId && (typeof refundId !== 'string' || !/^fac-[A-Za-z0-9_-]+$/.test(refundId))) {
        return res.status(503).json({error: 'Refund account configuration is invalid.'});
      }

      const businessAccountIds = [...new Set(configured)];
      const referralAccountIds = [...new Set([env.MONIME_REFERRAL_ACCOUNT_ID, savedReferral].filter(Boolean))];
      const accounts = new Map();
      const seenCursors = new Set();
      let cursor = null;

      for (let page = 0; page < 100; page++) {
        const accountUrl = new URL('https://api.monime.io/v1/financial-accounts');
        accountUrl.searchParams.set('withBalance', 'true');
        accountUrl.searchParams.set('limit', '50');
        if (cursor) accountUrl.searchParams.set('after', cursor);

        const response = await fetcher(accountUrl, {
          headers: {
            Authorization: `Bearer ${env.MONIME_API_KEY}`,
            'Monime-Space-Id': env.MONIME_SPACE_ID,
            'Monime-Version': 'caph.2025-08-23',
            Accept: 'application/json'
          },
          signal: AbortSignal.timeout(20000)
        });

        if (!response.ok) {
          return res.status(502).json({
            error: 'Monime could not return financial accounts. Check the token and Space permissions.'
          });
        }

        const result = await response.json();
        if (!result || !Array.isArray(result.result)) {
          return res.status(502).json({
            error: 'Monime returned an invalid financial-account page. No partial balances were returned.'
          });
        }

        for (const account of result.result) {
          if (
            !account ||
            typeof account.id !== 'string' ||
            !/^fac-[A-Za-z0-9_-]+$/.test(account.id) ||
            typeof account.currency !== 'string' ||
            account.currency.length < 3 ||
            accounts.has(account.id)
          ) {
            return res.status(502).json({
              error: 'Monime returned duplicate or invalid financial accounts. No partial balances were returned.'
            });
          }
          accounts.set(account.id, {
            id: account.id,
            currency: account.currency,
            balance: account.balance
          });
        }

        const next = result.pagination?.next;
        if (next !== undefined && next !== null && (typeof next !== 'string' || !next.trim())) {
          return res.status(502).json({
            error: 'Monime returned an invalid account pagination cursor.'
          });
        }
        if (!next) {
          return res.status(200).json({
            accounts: [...accounts.values()].filter(a => financial || (special && a.id === refundId) || a.id === env.MONIME_SPIN_ACCOUNT_ID),
            businessAccountIds: financial ? businessAccountIds : [],
            platform: {
              mainAccountId: financial ? (env.MONIME_MAIN_ACCOUNT_ID || null) : null,
              referralAccountId: financial ? (env.MONIME_REFERRAL_ACCOUNT_ID || savedReferral || null) : null,
              referralAccountIds: financial ? referralAccountIds : [],
              spinAccountId: env.MONIME_SPIN_ACCOUNT_ID || null,
              escrowAccountId: financial ? (env.MONIME_ESCROW_ACCOUNT_ID || null) : null,
              feeAccountId: financial ? (env.MONIME_PLATFORM_FEE_ACCOUNT_ID || null) : null,
              travelAccountId: financial ? (travelId || null) : null,
              eventAccountId: financial ? (eventId || null) : null,
              refundAccountId: (financial || special) ? (refundId || null) : null,
            }
          });
        }

        if (seenCursors.has(next)) {
          return res.status(502).json({ error: 'Monime account pagination repeated a cursor. Retry the balance refresh.' });
        }
        seenCursors.add(next);
        cursor = next;
      }

      return res.status(502).json({
        error: 'Monime account pagination exceeded the safety limit. No partial balances were returned.'
      });
    } catch (error) {
      // requireAdmin deliberately throws typed 401/403/503 failures. Preserve
      // those statuses so authorization failures are never mislabeled as 502.
      if ([401, 403, 503].includes(error?.status)) {
        return res.status(error.status).json({
          error: error.message || 'Admin access could not be verified.'
        });
      }
      return res.status(502).json({
        error: 'Gateway balances are temporarily unavailable.'
      });
    }
  };
}

export default createHandler();
