export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { accountId } = req.body;
    
    // If accountId is provided, filter by it. Otherwise fetch space-wide transactions.
    const url = accountId 
      ? `https://api.monime.io/v1/financial-transactions?financialAccountId=${accountId}&limit=50`
      : `https://api.monime.io/v1/financial-transactions?limit=50`;

    const monimeRes = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.MONIME_API_KEY}`,
        'Monime-Space-Id': process.env.MONIME_SPACE_ID,
        'Monime-Version': 'caph.2025-08-23'
      }
    });

    const rawData = await monimeRes.json();

    if (!monimeRes.ok || rawData.success === false) {
      throw new Error(rawData.message || 'Failed to fetch transactions');
    }

    const txList = rawData.result?.items || rawData.result || [];
    return res.status(200).json({ transactions: Array.isArray(txList) ? txList : [] });
  } catch (error) {
    console.error('Fetch Transactions Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}