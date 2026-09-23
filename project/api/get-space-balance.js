import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const monimeRes = await fetch('https://api.monime.io/v1/financial-accounts?withBalance=true&limit=100', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.VITE_MONIME_API_KEY}`,
        'Monime-Space-Id': process.env.VITE_MONIME_SPACE_ID,
        'Monime-Version': 'caph.2025-08-23'
      }
    });

    const rawData = await monimeRes.json();
    const accounts = rawData.result?.items || rawData.result || [];

    let totalSleCents = 0;
    accounts.forEach(acc => {
      if (acc.balance?.available?.value) totalSleCents += acc.balance.available.value;
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