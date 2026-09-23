import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const monimeRes = await fetch('https://api.monime.io/v1/financial-accounts?withBalance=true&limit=50', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.MONIME_API_KEY || process.env.VITE_MONIME_API_KEY}`,
        'Monime-Space-Id': process.env.MONIME_SPACE_ID || process.env.VITE_MONIME_SPACE_ID,
        'Monime-Version': 'caph.2025-08-23'
      }
    });

    const rawData = await monimeRes.json();
    if (!monimeRes.ok) throw new Error(rawData.message || "Failed to fetch accounts from Monime");

    // Monime Schema: result is an array of FinancialAccount objects
    const accounts = rawData.result || [];
    let totalSleCents = 0;

    accounts.forEach(acc => {
      // Monime Schema: balance.available.value
      if (acc.balance && acc.balance.available && acc.balance.available.value) {
        totalSleCents += acc.balance.available.value;
      }
    });

    const { count: frozenCount } = await supabase.from('wallets').select('*', { count: 'exact', head: true }).eq('status', 'frozen');

    return res.status(200).json({
      masterSleBalance: totalSleCents / 100,
      activeWalletsCount: accounts.length,
      frozenWalletsCount: frozenCount || 0,
      accounts
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}