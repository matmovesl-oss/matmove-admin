import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const monimeKey = process.env.MONIME_API_KEY || process.env.VITE_MONIME_API_KEY;
    const monimeSpace = process.env.MONIME_SPACE_ID || process.env.VITE_MONIME_SPACE_ID;

    if (!monimeKey || !monimeSpace) {
      return res.status(400).json({ error: "Missing Monime API Keys in Vercel Environment." });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const monimeRes = await fetch('https://api.monime.io/v1/financial-accounts?withBalance=true&limit=100', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${monimeKey}`,
        'Monime-Space-Id': monimeSpace,
        'Monime-Version': 'caph.2025-08-23'
      }
    });

    const rawData = await monimeRes.json();
    if (!monimeRes.ok) throw new Error(rawData.message || "Failed to fetch from Monime");

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