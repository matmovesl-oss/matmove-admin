export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const { accountId } = req.query;

  try {
    const apiKey = process.env.MONIME_API_KEY;
    const spaceId = process.env.MONIME_SPACE_ID;

    let url = 'https://api.monime.io/v1/financial-transactions?limit=50';
    if (accountId && accountId !== 'Pending Setup') {
      url += `&financialAccountId=${accountId}`;
    }

    const monimeRes = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Monime-Space-Id': spaceId,
        'Monime-Version': 'caph.2025-08-23'
      }
    });

    const rawData = await monimeRes.json();
    let txns = [];
    if (Array.isArray(rawData.result)) txns = rawData.result;
    else if (rawData.result?.items && Array.isArray(rawData.result.items)) txns = rawData.result.items;

    return res.status(200).json({ transactions: txns });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}