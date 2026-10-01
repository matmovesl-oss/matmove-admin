export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const apiKey = process.env.MONIME_API_KEY;
    const spaceId = process.env.MONIME_SPACE_ID;

    if (!apiKey || !spaceId) {
      return res.status(500).json({ error: 'Admin API Key or Space ID is missing in Vercel.' });
    }

    const monimeRes = await fetch('https://api.monime.io/v1/financial-accounts?withBalance=true&limit=100', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Monime-Space-Id': spaceId,
        'Monime-Version': 'caph.2025-08-23',
        'Accept': 'application/json'
      }
    });

    const rawData = await monimeRes.json();
    if (!monimeRes.ok) {
      return res.status(monimeRes.status).json({ error: rawData.message || 'Failed to fetch accounts' });
    }

    // Safely extract the array whether it's wrapped in 'items' or not
    let accounts = [];
    if (Array.isArray(rawData.result)) accounts = rawData.result;
    else if (rawData.result?.items && Array.isArray(rawData.result.items)) accounts = rawData.result.items;
    else if (Array.isArray(rawData.data)) accounts = rawData.data;
    else if (rawData.data?.items && Array.isArray(rawData.data.items)) accounts = rawData.data.items;

    return res.status(200).json({ accounts });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}