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
        error: 'Method Not Allowed',
      });
    }

    try {
      const token = /^Bearer\s+(\S+)$/i.exec(
        req.headers.authorization || ''
      )?.[1];

      if (!token) {
        return res.status(401).json({
          error:
            'Please sign in to the admin portal.',
        });
      }

      const projectUrl =
        env.SUPABASE_URL ||
        env.VITE_SUPABASE_URL;

      if (
        !projectUrl ||
        !env.SUPABASE_SERVICE_ROLE_KEY ||
        !env.MONIME_API_KEY ||
        !env.MONIME_SPACE_ID
      ) {
        return res.status(503).json({
          error:
            'Admin Supabase or Monime server settings are missing.',
        });
      }

      const client = clientFactory(
        projectUrl,
        env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      );

      const {
        data: authData,
        error: authError,
      } = await client.auth.getUser(token);

      if (authError || !authData?.user) {
        return res.status(401).json({
          error:
            'Session expired. Please sign in again.',
        });
      }

      const {
        data: admin,
        error: adminError,
      } = await client
        .from('admins')
        .select('id')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (adminError) {
        return res.status(502).json({
          error:
            'Unable to verify admin access.',
        });
      }

      if (!admin) {
        return res.status(403).json({
          error:
            'Admin authorization required.',
        });
      }

      const accountMap = new Map();
      const seenCursors = new Set();
      const signal =
        AbortSignal.timeout(20000);

      let cursor = null;

      for (let page = 0; page < 100; page++) {
        const url = new URL(
          'https://api.monime.io/v1/financial-accounts'
        );

        url.searchParams.set(
          'withBalance',
          'true'
        );

        url.searchParams.set('limit', '50');

        if (cursor) {
          url.searchParams.set(
            'after',
            cursor
          );
        }

        const response = await fetcher(
          url,
          {
            headers: {
              Authorization:
                `Bearer ${env.MONIME_API_KEY}`,
              'Monime-Space-Id':
                env.MONIME_SPACE_ID,
              'Monime-Version':
                'caph.2025-08-23',
              Accept:
                'application/json',
            },
            signal,
          }
        );

        if (!response.ok) {
          return res.status(502).json({
            error:
              'Monime could not return financial accounts. Check the token, Space permissions and Vercel logs.',
          });
        }

        const result =
          await response.json();

        if (
          result.success !== true ||
          (
            result.result !== null &&
            !Array.isArray(result.result)
          )
        ) {
          return res.status(502).json({
            error:
              'Unexpected Monime financial-account response.',
          });
        }

        for (
          const account of
          result.result || []
        ) {
          if (
            typeof account.id !==
              'string' ||
            typeof account.currency !==
              'string'
          ) {
            return res.status(502).json({
              error:
                'Monime returned an invalid account record.',
            });
          }

          accountMap.set(
            account.id,
            {
              id: account.id,
              currency:
                account.currency,
              balance:
                account.balance,
            }
          );
        }

        const next =
          result.pagination?.next;

        if (!next) {
          return res.status(200).json({
            accounts: [
              ...accountMap.values(),
            ],
          });
        }

        if (
          typeof next !== 'string' ||
          seenCursors.has(next)
        ) {
          return res.status(502).json({
            error:
              'Monime pagination returned an invalid cursor.',
          });
        }

        seenCursors.add(next);
        cursor = next;
      }

      return res.status(502).json({
        error:
          'Account listing exceeded the safe page limit. No partial totals were returned.',
      });
    } catch {
      return res.status(502).json({
        error:
          'Gateway balances are temporarily unavailable. Please retry.',
      });
    }
  };
}

export default createHandler();