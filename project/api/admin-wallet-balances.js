
import { createClient } from '@supabase/supabase-js';

export function createHandler(
  clientFactory = createClient,
  fetcher = fetch,
  env = process.env
) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

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

      const url =
        env.SUPABASE_URL || env.VITE_SUPABASE_URL;

      if (
        !url ||
        !env.SUPABASE_SERVICE_ROLE_KEY ||
        !env.MONIME_API_KEY ||
        !env.MONIME_SPACE_ID
      ) {
        return res.status(503).json({
          error: 'Admin Supabase or Monime server settings are missing.'
        });
      }

      const client = clientFactory(
        url,
        env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false
          }
        }
      );

      const {
        data: authData,
        error: authError
      } = await client.auth.getUser(token);

      if (authError || !authData?.user) {
        return res.status(401).json({
          error: 'Session expired. Please sign in again.'
        });
      }

      const {
        data: admin,
        error: adminError
      } = await client
        .from('admins')
        .select('id')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (adminError) {
        return res.status(502).json({
          error: 'Unable to verify admin access.'
        });
      }

      if (!admin) {
        return res.status(403).json({
          error: 'Admin authorization required.'
        });
      }

      const accounts = new Map();
      const seen = new Set();
      const signal = AbortSignal.timeout(20000);

      let cursor = null;

      for (let page = 0; page < 100; page++) {
        const accountUrl = new URL(
          'https://api.monime.io/v1/financial-accounts'
        );

        accountUrl.searchParams.set(
          'withBalance',
          'true'
        );

        accountUrl.searchParams.set('limit', '50');

        if (cursor) {
          accountUrl.searchParams.set(
            'after',
            cursor
          );
        }

        const response = await fetcher(accountUrl, {
          headers: {
            Authorization: `Bearer ${env.MONIME_API_KEY}`,
            'Monime-Space-Id': env.MONIME_SPACE_ID,
            'Monime-Version': 'caph.2025-08-23',
            Accept: 'application/json'
          },
          signal
        });

        if (!response.ok) {
          return res.status(502).json({
            error: 'Monime could not return financial accounts. Check the token and Space permissions.'
          });
        }

        const result = await response.json();

        if (
          result.success !== true ||
          (
            result.result !== null &&
            !Array.isArray(result.result)
          )
        ) {
          return res.status(502).json({
            error: 'Unexpected Monime financial-account response.'
          });
        }

        for (const account of result.result || []) {
          if (
            typeof account.id !== 'string' ||
            typeof account.currency !== 'string'
          ) {
            return res.status(502).json({
              error: 'Monime returned an invalid account record.'
            });
          }

          accounts.set(account.id, {
            id: account.id,
            currency: account.currency,
            balance: account.balance
          });
        }

        const next = result.pagination?.next;

        if (!next) {
          return res.status(200).json({
            accounts: [...accounts.values()],
            platform: {
              spinAccountId: env.MONIME_SPIN_ACCOUNT_ID || null,
              escrowAccountId:
                env.MONIME_ESCROW_ACCOUNT_ID || null,
              feeAccountId:
                env.MONIME_PLATFORM_FEE_ACCOUNT_ID || null
            }
          });
        }

        if (
          typeof next !== 'string' ||
          seen.has(next)
        ) {
          return res.status(502).json({
            error: 'Monime pagination returned an invalid cursor.'
          });
        }

        seen.add(next);
        cursor = next;
      }

      return res.status(502).json({
        error: 'Account listing exceeded the safe page limit. No partial totals were returned.'
      });
    } catch {
      return res.status(502).json({
        error: 'Gateway balances are temporarily unavailable. Please retry.'
      });
    }
  };
}

export default createHandler();
