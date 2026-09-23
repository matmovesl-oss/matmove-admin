export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { accountId } = req.body || {};
    const url = accountId 
      ? `https://api.monime.io/v1/financial-transactions?financialAccountId=${accountId}&limit=100`
      : `https://api.monime.io/v1/financial-transactions?limit=100`;

    const monimeRes = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.VITE_MONIME_API_KEY}`,
        'Monime-Space-Id': process.env.VITE_MONIME_SPACE_ID,
        'Monime-Version': 'caph.2025-08-23'
      }
    });

    const rawData = await monimeRes.json();
    const txList = rawData.result?.items || rawData.result || [];
    return res.status(200).json({ transactions: Array.isArray(txList) ? txList : [] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}