import { requireAdmin } from '../server/admin-auth.js';
import { createClient } from '@supabase/supabase-js';

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

async function monimeRequest(path, { method = 'GET', body, requestKey, env, fetcher = fetch }) {
  let response;
  try {
    response = await fetcher(`https://api.monime.io/v1/${path}`, {
      method,
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${env.MONIME_API_KEY}`,
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
    const error = new Error('Monime could not be reached. Retry this same refund request; do not start a second refund.');
    error.status = 503;
    error.uncertain = true;
    throw error;
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || payload?.message || 'Monime rejected the refund request.');
    error.status = response.status >= 500 ? 502 : 400;
    throw error;
  }
  return payload?.result || payload;
}

async function getAccount(id, env, fetcher) {
  const account = await monimeRequest(`financial-accounts/${encodeURIComponent(id)}?withBalance=true`, { env, fetcher });
  if (!account || account.id !== id || account.currency !== 'SLE') {
    const error = new Error('Both the refund source and customer destination must be verified SLE Monime accounts.');
    error.status = 409;
    throw error;
  }
  return account;
}

function responseTransferMatches(transfer, { request, sourceId, destinationId, amountMinor }) {
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

export function createHandler({ authorize = requireAdmin, env = process.env, fetcher = fetch } = {}) {
  return async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  let ledgerRow = null;
  let client = null;
  try {
    const admin = await authorize(req, ['financials', 'special'], { env });
    client = admin.client;
    const actor = admin.user;
    const { amount, recipientAccountId, recipientUserId, reason, requestKey } = req.body || {};
    const amountMinor = amountToMinor(amount);
    if (!amountMinor) return res.status(400).json({ error: 'Enter a valid SLE refund amount with up to two decimal places.' });
    if (!UUID.test(String(requestKey || ''))) return res.status(400).json({ error: 'A valid refund request key is required. Reopen the confirmation and try again.' });
    if (!UUID.test(String(recipientUserId || ''))) return res.status(400).json({ error: 'The selected customer could not be verified.' });
    if (!ACCOUNT_ID.test(String(recipientAccountId || ''))) return res.status(400).json({ error: 'Recipient Monime account ID is invalid.' });

    const sourceId = String(env.MONIME_REFUND_ACCOUNT_ID || '').trim();
    if (!ACCOUNT_ID.test(sourceId)) return res.status(503).json({ error: 'Configure MONIME_REFUND_ACCOUNT_ID in the Admin Vercel project. Keep it server-side.' });
    if (!env.MONIME_API_KEY || !env.MONIME_SPACE_ID) return res.status(503).json({ error: 'Monime server credentials are not configured.' });
    if (sourceId === recipientAccountId) return res.status(409).json({ error: 'The refund account cannot be the recipient wallet.' });

    // Confirm the destination is the selected customer's SLE wallet, not an arbitrary account ID.
    const { data: wallets, error: walletError } = await client
      .from('wallets')
      .select('id,user_id,currency,monime_account_id,metadata')
      .eq('user_id', recipientUserId)
      .eq('currency', 'SLE');
    if (walletError) return res.status(503).json({ error: 'Unable to verify the customer SLE wallet.' });
    const linked = (wallets || []).filter(wallet =>
      (wallet.monime_account_id || wallet.metadata?.monime_account_id) === recipientAccountId
    );
    if (linked.length !== 1) return res.status(409).json({ error: 'The selected account is not uniquely linked to this customer’s SLE wallet.' });

    const reasonText = String(reason || '').trim().slice(0, 300);
    if (!reasonText) return res.status(400).json({ error: 'Enter a refund reason or case reference.' });

    const { data: existing, error: existingError } = await client
      .from('matmove_admin_refunds').select('*').eq('request_key', requestKey).maybeSingle();
    if (existingError) return res.status(503).json({ error: 'Refund audit storage is not ready. Apply the Admin refund migration before processing refunds.' });
    if (existing) {
      if (existing.initiated_by !== actor.id || existing.recipient_user_id !== recipientUserId || existing.recipient_account_id !== recipientAccountId || Number(existing.amount_minor) !== amountMinor || existing.source_account_id !== sourceId) {
        return res.status(409).json({ error: 'This refund request key is already attached to a different refund. Do not reuse it.' });
      }
      ledgerRow = existing;
      if (existing.state === 'completed') {
        return res.status(200).json({ success: true, status: 'completed', refundId: existing.id, providerTransferId: existing.provider_transfer_id, replayed: true });
      }
    } else {
      // Verify source balance only before the first attempt. Rechecks of a pending request
      // must not fail just because its earlier attempt has already reserved/debited funds.
      const source = await getAccount(sourceId, env, fetcher);
      const destination = await getAccount(recipientAccountId, env, fetcher);
      const available = source.balance?.available;
      if (!available || available.currency !== 'SLE' || !Number.isSafeInteger(available.value) || available.value < amountMinor) {
        return res.status(400).json({ error: `Insufficient confirmed funds in the SLE Refund Account. Available: SLE ${Number(available?.value || 0) / 100}.` });
      }
      if (destination.id !== recipientAccountId) return res.status(409).json({ error: 'Recipient account could not be confirmed.' });
      const { data: inserted, error: insertError } = await client.from('matmove_admin_refunds').insert({
        request_key: requestKey,
        initiated_by: actor.id,
        recipient_user_id: recipientUserId,
        recipient_account_id: recipientAccountId,
        source_account_id: sourceId,
        amount_minor: amountMinor,
        currency: 'SLE',
        reason: reasonText,
        provider_status: 'initiating',
        state: 'initiating',
      }).select('*').single();
      if (insertError) {
        const { data: raced } = await client.from('matmove_admin_refunds').select('*').eq('request_key', requestKey).maybeSingle();
        if (!raced) return res.status(503).json({ error: 'Could not create the refund audit record. No transfer was submitted.' });
        if (raced.initiated_by !== actor.id || raced.recipient_user_id !== recipientUserId || raced.recipient_account_id !== recipientAccountId || Number(raced.amount_minor) !== amountMinor || raced.source_account_id !== sourceId) return res.status(409).json({ error: 'This refund request key is already attached to a different refund.' });
        ledgerRow = raced;
      } else ledgerRow = inserted;
    }

    let transfer;
    if (ledgerRow.provider_transfer_id) {
      transfer = await monimeRequest(`internal-transfers/${encodeURIComponent(ledgerRow.provider_transfer_id)}`, { env, fetcher });
    } else {
      // Reusing the exact same key recovers an uncertain POST without creating a second debit.
      transfer = await monimeRequest('internal-transfers', {
        method: 'POST',
        requestKey,
        env,
        fetcher,
        body: {
          amount: { currency: 'SLE', value: amountMinor },
          sourceFinancialAccount: { id: sourceId },
          destinationFinancialAccount: { id: recipientAccountId },
          description: `MatMove customer refund: ${reasonText}`,
          metadata: { matmoveRefundRequestKey: requestKey, recipientUserId, initiatedBy: actor.id },
        },
      });
    }

    if (!responseTransferMatches(transfer, { request: requestKey, sourceId, destinationId: recipientAccountId, amountMinor })) {
      await client.from('matmove_admin_refunds').update({ state: 'review_required', provider_status: 'review_required', failure_detail: 'Monime response did not match the recorded amount or account pair.', updated_at: new Date().toISOString() }).eq('id', ledgerRow.id);
      return res.status(502).json({ error: 'Monime returned a transfer that does not match this refund. It has been placed in review; do not retry with a new request.' });
    }

    const status = String(transfer.status).toLowerCase();
    const nextState = status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : status;
    const { error: updateError } = await client.from('matmove_admin_refunds').update({
      provider_transfer_id: transfer.id,
      provider_status: status,
      state: nextState,
      failure_detail: transfer.failureDetail?.message || null,
      completed_at: status === 'completed' ? (transfer.updateTime || new Date().toISOString()) : null,
      updated_at: new Date().toISOString(),
    }).eq('id', ledgerRow.id);
    if (updateError) return res.status(503).json({ error: 'Monime transfer was received, but its refund audit record could not be updated. Check the refund ledger before retrying.' });

    if (status === 'completed') return res.status(200).json({ success: true, status, refundId: ledgerRow.id, providerTransferId: transfer.id });
    if (status === 'failed') return res.status(409).json({ success: false, status, refundId: ledgerRow.id, error: transfer.failureDetail?.message || 'Monime marked this refund transfer as failed.' });
    return res.status(202).json({ success: false, pending: true, status, refundId: ledgerRow.id, providerTransferId: transfer.id, message: `Refund is ${status}. Check this same request again; do not create another refund.` });
  } catch (error) {
    if (ledgerRow && client) {
      // Keep the same request key and record for recovery; an uncertain provider response
      // must never be converted into a fresh refund attempt.
      await client.from('matmove_admin_refunds').update({ state: 'review_required', provider_status: 'review_required', failure_detail: String(error?.message || 'Unknown refund error').slice(0, 500), updated_at: new Date().toISOString() }).eq('id', ledgerRow.id);
    }
    return res.status(error.status || 502).json({ error: error.message || 'Refund processing failed. Check the refund ledger before retrying.' });
  }
  };
}

export default createHandler();
