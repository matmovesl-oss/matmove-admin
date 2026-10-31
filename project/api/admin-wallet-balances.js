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

      const {access} = await requireAdmin(req, ['financials', 'games.settings'], {client, env});
      const financial = canAdminAccess(access, 'financials');

      let savedReferral = null;
      if (financial) {
        const campaign = await client.from('matmove_referral_campaign')
          .select('treasury_account').eq('singleton', true).maybeSingle();
        if (campaign.data && typeof campaign.data.treasury_account === 'string' && /^fac-[A-Za-z0-9_-]+$/.test(campaign.data.treasury_account)) {
          savedReferral = campaign.data.treasury_account;
        }
      }

      const travelId = env.MONIME_TRAVEL_ACCOUNT_ID || env.VITE_MONIME_TRAVEL_ACCOUNT_ID;
      const eventId = env.MONIME_EVENT_ACCOUNT_ID || env.VITE_MONIME_EVENT_ACCOUNT_ID;

      const configured = [
        env.MONIME_ESCROW_ACCOUNT_ID,
        env.MONIME_PLATFORM_FEE_ACCOUNT_ID,
        env.MONIME_SPIN_ACCOUNT_ID,
        env.MONIME_MAIN_ACCOUNT_ID,
        env.MONIME_REFERRAL_ACCOUNT_ID,
        travelId,
        eventId,
        savedReferral
      ].filter(Boolean);

      if (financial && configured.some(id => typeof id !== 'string' || !/^fac-[A-Za-z0-9_-]+$/.test(id))) {
        return res.status(503).json({error: 'Platform account configuration is invalid.'});
      }

      const businessAccountIds = [...new Set(configured)];
      const referralAccountIds = [...new Set([env.MONIME_REFERRAL_ACCOUNT_ID, savedReferral].filter(Boolean))];
      const accounts = new Map();
      const seen = new Set();
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
        for (const account of result.result || []) {
          accounts.set(account.id, {
            id: account.id,
            currency: account.currency,
            balance: account.balance
          });
        }

        const next = result.pagination?.next;
        if (!next) {
          return res.status(200).json({
            accounts: [...accounts.values()].filter(a => financial || a.id === env.MONIME_SPIN_ACCOUNT_ID),
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
            }
          });
        }

        seen.add(next);
        cursor = next;
      }
    } catch (error) {
      return res.status(502).json({
        error: error.message || 'Gateway balances are temporarily unavailable.'
      });
    }
  };
}

export default createHandler();