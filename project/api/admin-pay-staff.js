import { requireAdmin, failure } from '../server/admin-auth.js';

const ACCOUNT_ID = /^fac-[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = 'caph.2025-08-23';

function amountToMinor(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor <= 0n || minor > 1000000000000n) return null;
  return Number(minor);
}

async function monimeRequest(path, { method = 'GET', body, requestKey, env, fetcher }) {
  let response;
  try {
    response = await fetcher('https://api.monime.io/v1/' + path, {
      method,
      redirect: 'error',
      headers: {
        Authorization: 'Bearer ' + env.MONIME_API_KEY,
        'Monime-Space-Id': env.MONIME_SPACE_ID,
        'Monime-Version': VERSION,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(requestKey ? { 'Idempotency-Key': requestKey } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    const error = failure(503, 'Monime could not be reached. Retry this same payroll request; do not start another payment.');
    error.uncertain = true;
    throw error;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = failure(response.status >= 500 ? 502 : 400,
      payload?.error?.message || payload?.message || 'Monime rejected the payroll transfer.');
    error.uncertain = response.status >= 500;
    throw error;
  }
  return payload?.result || payload;
}

async function getFinancialAccount(id, env, fetcher) {
  const account = await monimeRequest(
    'financial-accounts/' + encodeURIComponent(id) + '?withBalance=true',
    { env, fetcher }
  );
  if (!account || account.id !== id || account.currency !== 'SLE') {
    throw failure(409, 'The payroll source and staff destination must both be verified SLE Monime accounts.');
  }
  return account;
}

function matchesTransfer(transfer, { sourceId, destinationId, amountMinor }) {
  return Boolean(
    transfer &&
    typeof transfer.id === 'string' && transfer.id &&
    transfer.amount?.currency === 'SLE' &&
    Number(transfer.amount?.value) === amountMinor &&
    transfer.sourceFinancialAccount?.id === sourceId &&
    transfer.destinationFinancialAccount?.id === destinationId &&
    ['pending', 'processing', 'completed', 'failed'].includes(String(transfer.status || '').toLowerCase())
  );
}

function parseBody(body) {
  if (typeof body !== 'string') return body || {};
  try { return JSON.parse(body); }
  catch { throw failure(400, 'Invalid payroll request body.'); }
}

export function createHandler({
  authorize = requireAdmin,
  env = process.env,
  fetcher = fetch,
} = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Authorization');

    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    let client = null;
    let ledgerRow = null;
    try {
      const admin = await authorize(req, ['special'], { env });
      client = admin.client;
      const actor = admin.user;
      const payrollAccountId = String(
        env.MONIME_STAFF_PAYROLL_ACCOUNT_ID ||
        env.MONIME_STAFF_PAYROLE_ACCOUNT_ID ||
        ''
      ).trim();

      if (!ACCOUNT_ID.test(payrollAccountId) || !env.MONIME_API_KEY || !env.MONIME_SPACE_ID) {
        throw failure(503, 'Configure the SLE payroll account ID, Monime API key, and Monime Space ID in the Admin server environment.');
      }

      if (req.method === 'GET') {
        const source = await getFinancialAccount(payrollAccountId, env, fetcher);
        const balance = source.balance?.available;
        if (!balance || balance.currency !== 'SLE' || !Number.isSafeInteger(balance.value) || balance.value < 0) {
          throw failure(502, 'Monime returned an invalid SLE payroll balance.');
        }
        return res.status(200).json({
          accountId: payrollAccountId,
          currency: 'SLE',
          balance,
        });
      }

      const body = parseBody(req.body);
      const allowed = new Set(['amount', 'staffUserId', 'reason', 'requestKey']);
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          Object.keys(body).some(key => !allowed.has(key))) {
        throw failure(400, 'Invalid payroll request fields.');
      }

      const amountMinor = amountToMinor(body.amount);
      if (!amountMinor) throw failure(400, 'Enter a valid positive SLE amount with up to two decimal places.');
      if (!UUID.test(String(body.staffUserId || ''))) throw failure(400, 'Select a valid staff member.');
      if (!UUID.test(String(body.requestKey || ''))) throw failure(400, 'A valid payroll request key is required. Reopen the confirmation and try again.');
      const reason = String(body.reason || '').trim().slice(0, 140);
      if (!reason) throw failure(400, 'Enter a payroll memo or reason.');

      const { data: staff, error: staffError } = await client
        .from('profiles')
        .select('id,role,full_name,email,is_wallet_frozen')
        .eq('id', body.staffUserId)
        .maybeSingle();
      if (staffError) throw failure(503, 'Unable to verify the selected staff profile.');
      if (!staff || staff.role !== 'staff') throw failure(409, 'The selected account is not an active MatMove staff profile.');
      if (staff.is_wallet_frozen === true) throw failure(409, 'This staff account is frozen and cannot receive payroll.');

      const { data: wallets, error: walletError } = await client
        .from('wallets')
        .select('id,user_id,currency,monime_account_id,metadata,is_frozen')
        .eq('user_id', staff.id)
        .eq('currency', 'SLE');
      if (walletError) throw failure(503, 'Unable to verify the staff SLE wallet.');
      const linkedWallets = (wallets || []).filter(wallet =>
        typeof (wallet.monime_account_id || wallet.metadata?.monime_account_id) === 'string' &&
        ACCOUNT_ID.test(wallet.monime_account_id || wallet.metadata?.monime_account_id)
      );
      if (linkedWallets.length !== 1) throw failure(409, 'The staff member must have exactly one SLE wallet linked to a valid Monime account.');
      const wallet = linkedWallets[0];
      if (wallet.is_frozen === true) throw failure(409, 'The selected staff wallet is frozen.');
      const recipientAccountId = wallet.monime_account_id || wallet.metadata?.monime_account_id;
      if (recipientAccountId === payrollAccountId) throw failure(409, 'The payroll account cannot be its own recipient.');

      const requestKey = body.requestKey;
      const { data: existing, error: existingError } = await client
        .from('matmove_admin_payroll')
        .select('*')
        .eq('request_key', requestKey)
        .maybeSingle();
      if (existingError) throw failure(503, 'Payroll audit storage is not ready. Apply the Admin money-ledger migration before processing payments.');

      if (existing) {
        if (existing.initiated_by !== actor.id ||
            existing.staff_user_id !== staff.id ||
            existing.wallet_id !== wallet.id ||
            existing.recipient_account_id !== recipientAccountId ||
            existing.source_account_id !== payrollAccountId ||
            Number(existing.amount_minor) !== amountMinor) {
          throw failure(409, 'This payroll request key belongs to a different payment. Do not reuse it.');
        }
        ledgerRow = existing;
        if (existing.state === 'completed') {
          return res.status(200).json({
            success: true, status: 'completed', payrollId: existing.id,
            providerTransferId: existing.provider_transfer_id, replayed: true,
          });
        }
      } else {
        const source = await getFinancialAccount(payrollAccountId, env, fetcher);
        const destination = await getFinancialAccount(recipientAccountId, env, fetcher);
        const available = source.balance?.available;
        if (!available || available.currency !== 'SLE' ||
            !Number.isSafeInteger(available.value) || available.value < amountMinor) {
          throw failure(400, 'Insufficient confirmed funds in the SLE Payroll Account.');
        }
        if (destination.id !== recipientAccountId) {
          throw failure(409, 'The staff recipient account could not be confirmed.');
        }

        const { data: inserted, error: insertError } = await client
          .from('matmove_admin_payroll')
          .insert({
            request_key: requestKey,
            initiated_by: actor.id,
            staff_user_id: staff.id,
            wallet_id: wallet.id,
            source_account_id: payrollAccountId,
            recipient_account_id: recipientAccountId,
            amount_minor: amountMinor,
            currency: 'SLE',
            reason,
            provider_status: 'initiating',
            state: 'initiating',
          })
          .select('*')
          .single();

        if (insertError) {
          const { data: raced, error: raceError } = await client
            .from('matmove_admin_payroll')
            .select('*')
            .eq('request_key', requestKey)
            .maybeSingle();
          if (raceError || !raced) throw failure(503, 'Could not create the payroll audit record. No transfer was submitted.');
          if (raced.initiated_by !== actor.id ||
              raced.staff_user_id !== staff.id ||
              raced.wallet_id !== wallet.id ||
              raced.recipient_account_id !== recipientAccountId ||
              raced.source_account_id !== payrollAccountId ||
              Number(raced.amount_minor) !== amountMinor) {
            throw failure(409, 'This payroll request key is already attached to a different payment.');
          }
          ledgerRow = raced;
        } else {
          ledgerRow = inserted;
        }
      }

      let transfer;
      if (ledgerRow.provider_transfer_id) {
        transfer = await monimeRequest(
          'internal-transfers/' + encodeURIComponent(ledgerRow.provider_transfer_id),
          { env, fetcher }
        );
      } else {
        transfer = await monimeRequest('internal-transfers', {
          method: 'POST',
          requestKey,
          env,
          fetcher,
          body: {
            amount: { currency: 'SLE', value: amountMinor },
            sourceFinancialAccount: { id: payrollAccountId },
            destinationFinancialAccount: { id: recipientAccountId },
            description: 'MatMove staff payroll: ' + reason,
            metadata: {
              matmovePayrollRequestKey: requestKey,
              staffUserId: staff.id,
              walletId: wallet.id,
              initiatedBy: actor.id,
            },
          },
        });
      }

      if (!matchesTransfer(transfer, {
        sourceId: payrollAccountId,
        destinationId: recipientAccountId,
        amountMinor,
      })) {
        await client.from('matmove_admin_payroll').update({
          state: 'review_required',
          provider_status: 'review_required',
          failure_detail: 'Monime response did not match the recorded amount or account pair.',
          updated_at: new Date().toISOString(),
        }).eq('id', ledgerRow.id);
        return res.status(502).json({
          error: 'Monime returned a transfer that does not match this payroll request. It is in review; do not submit another payment.',
        });
      }

      const status = String(transfer.status).toLowerCase();
      const nextState = status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : status;
      const { error: updateError } = await client.from('matmove_admin_payroll').update({
        provider_transfer_id: transfer.id,
        provider_status: status,
        state: nextState,
        failure_detail: transfer.failureDetail?.message || null,
        completed_at: status === 'completed' ? (transfer.updateTime || new Date().toISOString()) : null,
        updated_at: new Date().toISOString(),
      }).eq('id', ledgerRow.id);

      if (updateError) {
        throw failure(503, 'Monime received the payroll transfer, but the ledger update failed. Check the payroll ledger before retrying.');
      }

      if (status === 'completed') {
        return res.status(200).json({
          success: true, status, payrollId: ledgerRow.id, providerTransferId: transfer.id,
        });
      }
      if (status === 'failed') {
        return res.status(409).json({
          success: false, status, payrollId: ledgerRow.id,
          error: transfer.failureDetail?.message || 'Monime marked this payroll transfer as failed.',
        });
      }
      return res.status(202).json({
        success: false, pending: true, status, payrollId: ledgerRow.id,
        providerTransferId: transfer.id,
        message: 'Payroll is ' + status + '. Check this same request again; do not create a new payment.',
      });
    } catch (error) {
      if (ledgerRow && client) {
        const state = error?.uncertain || (error.status || 0) >= 500 ? 'review_required' : 'failed';
        await client.from('matmove_admin_payroll').update({
          state,
          provider_status: state,
          failure_detail: String(error?.message || 'Unknown payroll error').slice(0, 500),
          updated_at: new Date().toISOString(),
        }).eq('id', ledgerRow.id);
      }
      return res.status(error.status || 502).json({
        error: error.status ? error.message : 'Payroll processing failed. Check the payroll ledger before retrying.',
      });
    }
  };
}

export default createHandler();