import { createClient } from '@supabase/supabase-js';

// Initializes Supabase with the SERVICE ROLE KEY so it bypasses all RLS
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const event = req.body;
    const eventType = event.type; 
    const data = event.data;

    console.log(`[Monime Webhook Received] Type: ${eventType}`);

    // 1. HANDLE PAYOUTS (WITHDRAWALS)
    if (eventType === 'payout.completed' || eventType === 'payout.failed') {
      const status = eventType === 'payout.completed' ? 'completed' : 'failed';
      const withdrawalId = data.metadata?.withdrawal_id; 

      if (withdrawalId) {
        await supabase
          .from('withdrawal_requests')
          .update({ status: status, updated_at: new Date().toISOString() })
          .eq('id', withdrawalId);
      }
    }

    // 2. HANDLE WALLET BALANCES (SINGLE SOURCE OF TRUTH)
    if (eventType === 'financial_account.credited' || eventType === 'financial_account.debited') {
      const monimeId = String(data.id).trim();
      const rawBalance = data.balance?.available?.value ?? data.balance?.value ?? 0;
      const trueBalance = Number(rawBalance) / 100; // Convert cents to SLE/USD

      await supabase
        .from('wallets')
        .update({ balance: trueBalance })
        .contains('metadata', { monime_account_id: monimeId });
    }

    // 3. HANDLE PAYMENTS (PAY-INS)
    if (eventType.startsWith('payment.')) {
      const paymentId = data.id;
      const status = eventType.split('.')[1]; // 'created', 'processing_started', 'processing_completed'
      
      // Upsert into payment_transactions table tracking
      await supabase
        .from('payment_transactions')
        .update({ status: status, updated_at: new Date().toISOString() })
        .eq('provider_reference', paymentId);
    }

    // 4. HANDLE TRANSACTIONS
    if (eventType === 'financial_transaction.created') {
      // Automatically log to your wallet_transactions ledger
      const monimeId = data.financialAccountId;
      
      // Optional: find the wallet_id linked to this monimeId
      const { data: walletData } = await supabase.from('wallets').select('id, user_id').contains('metadata', { monime_account_id: monimeId }).single();
      
      if (walletData) {
         await supabase.from('wallet_transactions').insert({
            wallet_id: walletData.id,
            user_id: walletData.user_id,
            amount: Number(data.amount?.value || 0) / 100,
            type: data.direction === 'in' ? 'credit' : 'debit',
            status: 'completed',
            reference_code: data.id,
            description: data.description || 'Monime Webhook Transaction'
         });
      }
    }

    return res.status(200).json({ received: true, event: eventType });
    
  } catch (error: any) {
    console.error('Webhook processing failed:', error.message);
    return res.status(500).json({ error: error.message });
  }
}