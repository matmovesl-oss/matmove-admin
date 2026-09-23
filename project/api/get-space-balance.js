import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 1. Fetch live accounts from Monime with balances
    const monimeRes = await fetch('https://api.monime.io/v1/financial-accounts?withBalance=true&limit=50', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.MONIME_API_KEY}`,
        'Monime-Space-Id': process.env.MONIME_SPACE_ID,
        'Monime-Version': 'caph.2025-08-23'
      }
    });

    const rawData = await monimeRes.json();
    const accounts = rawData.result?.items || rawData.result || [];

    let totalSleCents = 0;

    accounts.forEach(acc => {
      if (acc.balance?.available?.value) {
        totalSleCents += acc.balance.available.value;
      }
    });

    const masterSleBalance = totalSleCents / 100;

    // 2. Fetch frozen count from Supabase
    const { count: frozenCount } = await supabase
      .from('wallets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'frozen');

    return res.status(200).json({
      masterSleBalance,
      activeWalletsCount: accounts.length,
      frozenWalletsCount: frozenCount || 0,
      accounts
    });
  } catch (error) {
    console.error('Master Balance Sync Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}