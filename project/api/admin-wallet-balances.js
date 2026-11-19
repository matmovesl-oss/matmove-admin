import {requireAdmin} from '../server/admin-auth.js';
import {canAdminAccess} from '../shared/admin-permissions.js';
import { createClient } from '@supabase/supabase-js';


export function monimeAccountDisplayName(profile, roles, currency) {
  const labels = { rider: 'Rider', driver: 'Driver', merchant: 'Merchant' };
  const roleList = [...new Set([
    ...(Array.isArray(roles) ? roles : []),
    profile?.role
  ].map(value => String(value || '').toLowerCase()).filter(role => labels[role]))]
    .sort((a, b) => ['rider', 'driver', 'merchant'].indexOf(a) - ['rider', 'driver', 'merchant'].indexOf(b));
  if (!roleList.length) return null;
  const fullName = String(profile?.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'MatMove User').trim().replace(/\\s+/g, ' ');
  const suffix = ' · ' + roleList.map(role => labels[role]).join('/') + ' · ' + currency;
  return fullName.slice(0, Math.max(1, 100 - suffix.length)).trim() + suffix;
}

async function syncAccountLabels({ req, res, client, fetcher, env }) {
  const offset = Number.isSafeInteger(req.body?.offset) && req.body.offset >= 0 ? req.body.offset : 0;
  const limit = Number.isSafeInteger(req.body?.limit) ? Math.min(25, Math.max(1, req.body.limit)) : 25;
  const { data: wallets, count, error: walletError } = await client.from('wallets')
    .select('id,user_id,currency,monime_account_id,metadata,created_at', { count: 'exact' })
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);
  if (walletError || !Array.isArray(wallets)) {
    return res.status(503).json({ error: 'Customer wallet links could not be loaded. No Monime account names were changed.' });
  }
  const total = Number.isSafeInteger(count) ? count : offset + wallets.length;
  const userIds = [...new Set(wallets.map(wallet => wallet.user_id).filter(id => typeof id === 'string'))];
  if (!userIds.length) {
    const nextOffset = offset + wallets.length;
    return res.status(200).json({ offset, nextOffset, total, complete: nextOffset >= total || wallets.length < limit, updated: 0, unchanged: 0, skipped: 0, failed: 0 });
  }
  const [profileResult, roleResult] = await Promise.all([
    client.from('profiles').select('id,full_name,first_name,last_name,role').in('id', userIds),
    client.from('user_roles').select('profile_id,role').in('profile_id', userIds)
  ]);
  if (profileResult.error || roleResult.error || !Array.isArray(profileResult.data) || !Array.isArray(roleResult.data)) {
    return res.status(503).json({ error: 'Customer names and roles could not be verified. No Monime account names were changed.' });
  }
  const profiles = new Map(profileResult.data.map(profile => [profile.id, profile]));
  const roles = new Map();
  for (const row of roleResult.data) {
    if (!roles.has(row.profile_id)) roles.set(row.profile_id, []);
    roles.get(row.profile_id).push(row.role);
  }
  const accountIds = [...new Set(wallets.map(wallet => wallet.monime_account_id || wallet.metadata?.monime_account_id).filter(id => typeof id === 'string' && /^fac-[A-Za-z0-9_-]+$/.test(id)))];
  const linkedWallets = new Map();
  if (accountIds.length) {
    const [directLinks, metadataLinks] = await Promise.all([
      client.from('wallets').select('id,user_id,monime_account_id,metadata').in('monime_account_id', accountIds),
      client.from('wallets').select('id,user_id,monime_account_id,metadata').in('metadata->>monime_account_id', accountIds)
    ]);
    if (directLinks.error || metadataLinks.error || !Array.isArray(directLinks.data) || !Array.isArray(metadataLinks.data)) {
      return res.status(503).json({ error: 'Monime account ownership links could not be verified. No account names were changed.' });
    }
    for (const wallet of [...directLinks.data, ...metadataLinks.data]) {
      const id = wallet.monime_account_id || wallet.metadata?.monime_account_id;
      if (!id || !accountIds.includes(id)) continue;
      if (!linkedWallets.has(id)) linkedWallets.set(id, new Map());
      linkedWallets.get(id).set(wallet.id, wallet);
    }
  }
  const headers = {
    Authorization: `Bearer ${env.MONIME_API_KEY}`,
    'Monime-Space-Id': env.MONIME_SPACE_ID,
    'Monime-Version': 'caph.2025-08-23',
    Accept: 'application/json'
  };
  const counts = { updated: 0, unchanged: 0, skipped: 0, failed: 0 };
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, wallets.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= wallets.length) return;
      const wallet = wallets[index];
      const currency = String(wallet.currency || '').toUpperCase();
      const directId = wallet.monime_account_id || null;
      const metadataId = wallet.metadata?.monime_account_id || null;
      if (!['SLE', 'USD'].includes(currency) || (directId && metadataId && directId !== metadataId)) {
        counts.skipped++;
        continue;
      }
      const accountId = directId || metadataId;
      const owners = linkedWallets.get(accountId);
      if (!owners || owners.size !== 1 || !owners.has(wallet.id) || owners.get(wallet.id)?.user_id !== wallet.user_id) {
        counts.skipped++;
        continue;
      }
      const profile = profiles.get(wallet.user_id);
      const displayName = monimeAccountDisplayName(profile, roles.get(wallet.user_id) || [], currency);
      if (!accountId || !/^fac-[A-Za-z0-9_-]+$/.test(accountId) || !displayName) {
        counts.skipped++;
        continue;
      }
      try {
        const url = `https://api.monime.io/v1/financial-accounts/${encodeURIComponent(accountId)}`;
        const accountResponse = await fetcher(url, { headers, signal: AbortSignal.timeout(12000) });
        if (!accountResponse.ok) { counts.failed++; continue; }
        const accountPayload = await accountResponse.json();
        const account = accountPayload?.result || accountPayload;
        if (account?.id !== accountId || String(account.currency || '').toUpperCase() !== currency) {
          counts.failed++;
          continue;
        }
        if (account.name === displayName) { counts.unchanged++; continue; }
        const updateResponse = await fetcher(url, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: displayName }),
          signal: AbortSignal.timeout(12000)
        });
        if (!updateResponse.ok) { counts.failed++; continue; }
        const updatePayload = await updateResponse.json();
        const updatedAccount = updatePayload?.result || updatePayload;
        if (updatedAccount?.id !== accountId || String(updatedAccount.currency || '').toUpperCase() !== currency || updatedAccount.name !== displayName) {
          counts.failed++;
          continue;
        }
        counts.updated++;
      } catch {
        counts.failed++;
      }
    }
  });
  await Promise.all(workers);
  const nextOffset = offset + wallets.length;
  return res.status(200).json({
    offset, nextOffset, total,
    complete: nextOffset >= total || wallets.length < limit,
    ...counts
  });
}

export function createHandler(
  clientFactory = createClient,
  fetcher = fetch,
  env = process.env
) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Authorization');

    if (!['GET', 'POST'].includes(req.method)) {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
    if (req.method === 'POST' && req.body?.action !== 'sync_account_labels') {
      return res.status(400).json({ error: 'Unsupported financial account action.' });
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

      if (req.method === 'POST') {
        if (!financial) return res.status(403).json({ error: 'Financial administration permission is required.' });
        return await syncAccountLabels({ req, res, client, fetcher, env });
      }

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
