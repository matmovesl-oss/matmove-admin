import { requireAdmin } from '../server/admin-auth.js';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const env = process.env;
    const { client } = await requireAdmin(req, ['financials', 'special'], { env });

    const { amount, recipientAccountId, reason } = req.body || {};
    const refundAmount = Number(amount);

    if (!refundAmount || refundAmount <= 0) {
      return res.status(400).json({ error: 'Enter a valid refund amount.' });
    }

    if (!recipientAccountId || !/^fac-[A-Za-z0-9_-]+$/.test(recipientAccountId)) {
      return res.status(400).json({ error: 'Recipient Monime account ID is invalid.' });
    }

    const refundSourceId = env.MONIME_REFUND_ACCOUNT_ID || env.VITE_MONIME_REFUND_ACCOUNT_ID;
    if (!refundSourceId) {
      return res.status(500).json({ error: 'MONIME_REFUND_ACCOUNT_ID is not configured in environment variables.' });
    }

    // 1. Verify Refund Account live balance from Monime
    const balRes = await fetch(`https://api.monime.io/v1/financial-accounts/${refundSourceId}`, {
      headers: {
        Authorization: `Bearer ${env.MONIME_API_KEY}`,
        'Monime-Space-Id': env.MONIME_SPACE_ID,
        'Monime-Version': 'caph.2025-08-23',
        Accept: 'application/json'
      }
    });

    if (!balRes.ok) {
      return res.status(502).json({ error: 'Unable to verify Refund Account balance from Monime.' });
    }

    const balData = await balRes.json();
    const availableCents = balData.result?.balance?.available?.value || 0;
    const requestedCents = Math.round(refundAmount * 100);

    if (availableCents < requestedCents) {
      const availFormatted = (availableCents / 100).toFixed(2);
      return res.status(400).json({
        error: `Refund account balance is SLE ${availFormatted} (insufficient). Please fund your Monime Refund Account to issue reversals.`
      });
    }

    // 2. Execute Internal Transfer from Refund Account to User
    const transferRes = await fetch('https://api.monime.io/v1/internal-transfers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.MONIME_API_KEY}`,
        'Monime-Space-Id': env.MONIME_SPACE_ID,
        'Monime-Version': 'caph.2025-08-23',
        'Content-Type': 'application/json',
        'Idempotency-Key': `ref-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      },
      body: JSON.stringify({
        amount: { currency: 'SLE', value: requestedCents },
        sourceFinancialAccount: { id: refundSourceId },
        destinationFinancialAccount: { id: recipientAccountId },
        description: `Admin Reversal: ${String(reason || 'Refund').trim()}`,
        metadata: { initiatedBy: 'admin', reason }
      })
    });

    const transferResult = await transferRes.json();
    if (!transferRes.ok || transferResult.status === 'failed') {
      return res.status(400).json({
        error: transferResult.error || 'Monime gateway rejected the transfer. Verify recipient wallet status.'
      });
    }

    return res.status(200).json({ success: true, result: transferResult });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Refund processing failed.' });
  }
}
