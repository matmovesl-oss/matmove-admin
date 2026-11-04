import { requireAdmin, failure } from '../server/admin-auth.js';

const ACCOUNT_ID = /^fac-[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONIME_VERSION = 'caph.2025-08-23';
const TRANSFER_STATES = new Set(['pending', 'processing', 'completed', 'failed']);

function amountToMinor(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor <= 0n || minor > 1_000_000_000_000n) return null;
  return Number(minor);
}

function accountIdFromEnv(env) {
  // The corrected spelling is preferred; retain the existing Vercel variable as a fallback.
  return String(env.MONIME_STAFF_PAYROLL_ACCOUNT_ID || env.MONIME_STAFF_PAYROLE_ACCOUNT_ID || '').trim();
}

function monimeHeaders(env, extra = {}) {
  return {
    Authorization: `Bearer ${env.MONIME_API_KEY}`,
    'Monime-Space-Id': env.MONIME_SPACE_ID,
    'Monime-Version': MONIME_VERSION,
    Accept: 'application/json',
    ...extra,
  };
}

async function monimeRequest(path, { env, fetcher, method = 'GET', body, requestKey } = {}) {
  let response;
  try {
    response = await fetcher(`https://api.monime.io/v1/${path}`, {
      method,
      redirect: 'error',
      headers: monimeHeaders(env, {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(requestKey ? { 'Idempotency-Key': requestKey } : {}),
      }),
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    const error = failure(503, 'Monime could not be reached. Keep this same payroll request key and check its status before starting another payment.');
    error.uncertain = true;
    throw error;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = failure(response.status >= 500 ? 502 : response.status, payload?.error?.message || payload?.message || 'Monime rejected the payroll request.');
    error.uncertain = response.status >= 500;
    throw error;
  }
  return payload?.result ?? payload;
}

async function getAccount(accountId, { env, fetcher }) {
  const account = await monimeRequest(
    `financial-accounts/${encodeURIComponent(accountId)}?withBalance=true`,
    { env, fetcher },
  );
  if (!account || account.id !== accountId || account.currency !== 'SLE') {
    throw failure(502, 'Monime did not confirm the requested SLE financial account.');
  }
  return account;
}

function transferMatches(transfer, { sourceId, destinationId, amountMinor }) {
  return Boolean(
    transfer &&
    typeof transfer.id === 'string' && transfer.id &&
    transfer.amount?.currency === 'SLE' &&
    Number(transfer.amount?.value) === amountMinor &&
    transfer.sourceFinancialAccount?.id === sourceId &&
    transfer.destinationFinancialAccount?.id === destinationId &&
    TRANSFER_STATES.has(String(transfer.status || '').toLowerCase()),
  );
}

function samePayment(row, { actorId, staffUserId, walletId, sourceId, destinationId, amountMinor, reason }) {
  return row.initiated_by === actorId &&
    row.staff_user_id === staffUserId &&
    row.wallet_id === walletId &&
    row.source_account_id === sourceId &&
    row.recipient_account_id === destinationId &&
    Number(row.amount_minor) === amountMinor &&
    row.reason === reason;
}

function availableBalance(account) {
  const value = account?.balance?.available;
  if (!value || value.currency !== 'SLE' || !Number.isSafeInteger(value.value) || value.value < 0) return null;
  return value;
}

export function createHandler({ authorize = requireAdmin, fetcher = fetch, env = process.env } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Authorization');

    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    let client;
    let ledgerRow;
    try {
      const admin = await authorize(req, ['special'], { env });
      client = admin.client;
      const actor = admin.user;
      const payrollAccountId = accountIdFromEnv(env);

      if (!ACCOUNT_ID.test(payrollAccountId) || !env.MONIME_API_KEY || !/^spc-[A-Za-z0-9_-]+$/.test(String(env.MONIME_SPACE_ID || ''))) {
        return res.status(503).json({ error: 'Configure a valid payroll account ID, Monime API key, and Monime Space ID in the Admin production environment.' });
      }

      if (req.method === 'GET') {
        const account = await getAccount(payrollAccountId, { env, fetcher });
        const balance = availableBalance(account);
        if (!balance) return res.status(502).json({ error: 'Monime did not return a valid available SLE payroll balance.' });
        return res.status(200).json({
          accountId: account.id,
          accountName: account.name || 'Staff Payroll Account',
          currency: 'SLE',
          balance,
        });
      }

      let body;
      try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
      catch { throw failure(400, 'Invalid payroll request body.'); }
      const staffUserId = String(body.staffUserId || '').trim();
      const requestKey = String(body.requestKey || '').trim();
      const amountMinor = amountToMinor(body.amount);
      const reason = String(body.reason || '').trim().slice(0, 140);

      if (!UUID.test(staffUserId)) throw failure(400, 'Select a valid staff member.');
      if (!UUID.test(requestKey)) throw failure(400, 'A valid payroll request key is required.');
      if (!amountMinor) throw failure(400, 'Enter a valid positive SLE amount with up to two decimal places.');
      if (!reason) throw failure(400, 'Enter a payroll memo or period.');

      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('id,role,full_name')
        .eq('id', staffUserId)
        .maybeSingle();
      if (profileError) throw failure(503, 'Unable to verify the selected staff profile.');
      if (!profile || profile.role !== 'staff') throw failure(403, 'The selected profile is not an eligible MatMove staff member.');

      const { data: wallets, error: walletError } = await client
        .from('wallets')
        .select('id,user_id,currency,monime_account_id,metadata')
        .eq('user_id', staffUserId)
        .eq('currency', 'SLE');
      if (walletError) throw failure(503, 'Unable to verify the staff member’s SLE wallet.');
      if (!Array.isArray(wallets) || wallets.length !== 1) throw failure(409, 'The staff member must have exactly one SLE wallet before payroll can be sent.');

      const wallet = wallets[0];
      const recipientAccountId = String(wallet.monime_account_id || wallet.metadata?.monime_account_id || '').trim();
      if (!UUID.test(wallet.id) || !ACCOUNT_ID.test(recipientAccountId)) throw failure(409, 'The staff member’s SLE wallet is not linked to a valid Monime account.');
      if (recipientAccountId === payrollAccountId) throw failure(409, 'The payroll source account cannot be the staff recipient account.');

      const queryExisting = async () => client
        .from('matmove_admin_payroll')
        .select('*')
        .eq('request_key', requestKey)
        .maybeSingle();

      const existingResult = await queryExisting();
      if (existingResult.error) throw failure(503, 'Payroll audit storage is not ready. Apply the Admin payroll migration before processing payments.');

      if (existingResult.data) {
        if (!samePayment(existingResult.data, {
          actorId: actor.id,
          staffUserId,
          walletId: wallet.id,
          sourceId: payrollAccountId,
          destinationId: recipientAccountId,
          amountMinor,
          reason,
        })) throw failure(409, 'This payroll request key is already attached to a different payment. Do not reuse it.');
        ledgerRow = existingResult.data;
        if (ledgerRow.state === 'completed' || ledgerRow.state === 'failed') {
          return res.status(200).json({ success: ledgerRow.state === 'completed', status: ledgerRow.state, payrollId: ledgerRow.id, providerTransferId: ledgerRow.provider_transfer_id, replayed: true });
        }
      } else {
        const [source, destination] = await Promise.all([
          getAccount(payrollAccountId, { env, fetcher }),
          getAccount(recipientAccountId, { env, fetcher }),
        ]);
        const available = availableBalance(source);
        if (!available) throw failure(502, 'Monime did not return a valid available SLE payroll balance.');
        if (destination.id !== recipientAccountId) throw failure(409, 'Monime did not confirm the staff recipient account.');
        if (available.value < amountMinor) throw failure(400, `Insufficient funds in the SLE Payroll Account. Available: SLE ${(available.value / 100).toFixed(2)}.`);

        const inserted = await client.from('matmove_admin_payroll').insert({
          request_key: requestKey,
          initiated_by: actor.id,
          staff_user_id: staffUserId,
          wallet_id: wallet.id,
          source_account_id: payrollAccountId,
          recipient_account_id: recipientAccountId,
          amount_minor: amountMinor,
          currency: 'SLE',
          reason,
          provider_status: 'initiating',
          state: 'initiating',
        }).select('*').single();

        if (inserted.error) {
          const raced = await queryExisting();
          if (raced.error || !raced.data) throw failure(503, 'Could not create the payroll audit record. No transfer was submitted.');
          if (!samePayment(raced.data, { actorId: actor.id, staffUserId, walletId: wallet.id, sourceId: payrollAccountId, destinationId: recipientAccountId, amountMinor, reason })) {
            throw failure(409, 'This payroll request key is already attached to a different payment.');
          }
          ledgerRow = raced.data;
        } else {
          ledgerRow = inserted.data;
        }
      }

      let transfer;
      if (ledgerRow.provider_transfer_id) {
        transfer = await monimeRequest(`internal-transfers/${encodeURIComponent(ledgerRow.provider_transfer_id)}`, { env, fetcher });
      } else {
        transfer = await monimeRequest('internal-transfers', {
          env,
          fetcher,
          method: 'POST',
          requestKey,
          body: {
            amount: { currency: 'SLE', value: amountMinor },
            sourceFinancialAccount: { id: payrollAccountId },
            destinationFinancialAccount: { id: recipientAccountId },
            description: `MatMove staff payroll: ${reason}`.slice(0, 150),
            metadata: {
              matmovePayrollRequestKey: requestKey,
              staffUserId,
              initiatedBy: actor.id,
              payrollRecordId: ledgerRow.id,
            },
          },
        });
      }

      if (!transferMatches(transfer, { sourceId: payrollAccountId, destinationId: recipientAccountId, amountMinor })) {
        await client.from('matmove_admin_payroll').update({
          state: 'review_required',
          provider_status: 'review_required',
          provider_transfer_id: typeof transfer?.id === 'string' ? transfer.id : null,
          failure_detail: 'Monime response did not match the recorded payroll amount or account pair.',
          updated_at: new Date().toISOString(),
        }).eq('id', ledgerRow.id);
        return res.status(502).json({ error: 'Monime returned a transfer that does not match this payroll request. It is in review; do not create a new request key.', status: 'review_required', payrollId: ledgerRow.id });
      }

      const providerStatus = String(transfer.status).toLowerCase();
      const update = await client.from('matmove_admin_payroll').update({
        provider_transfer_id: transfer.id,
        provider_status: providerStatus,
        state: providerStatus,
        failure_detail: transfer.failureDetail?.message || null,
        completed_at: providerStatus === 'completed' ? (transfer.updateTime || new Date().toISOString()) : null,
        updated_at: new Date().toISOString(),
      }).eq('id', ledgerRow.id);
      if (update.error) throw failure(503, 'Monime returned a transfer, but the payroll audit record could not be updated. Check the payroll ledger before retrying.');

      const statusCode = ['pending', 'processing'].includes(providerStatus) ? 202 : 200;
      return res.status(statusCode).json({
        success: providerStatus === 'completed',
        status: providerStatus,
        payrollId: ledgerRow.id,
        providerTransferId: transfer.id,
        staffUserId,
        amount: { currency: 'SLE', value: amountMinor },
      });
    } catch (error) {
      if (ledgerRow && client && (error?.uncertain || error?.status)) {
        const uncertain = Boolean(error?.uncertain) || error.status >= 500 || error.status === 409;
        const state = uncertain ? 'review_required' : 'failed';
        await client.from('matmove_admin_payroll').update({
          state,
          provider_status: state,
          failure_detail: String(error.message || 'Payroll request failed').slice(0, 500),
          updated_at: new Date().toISOString(),
        }).eq('id', ledgerRow.id);
      }
      return res.status(error.status || 500).json({ error: error.status ? error.message : 'Payroll request failed. Check the payroll ledger before retrying.' });
    }
  };
}

export default async function handler(req, res) {
  return createHandler()(req, res);
}
