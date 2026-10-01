export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const apiKey = process.env.VITE_MONIME_API_KEY || process.env.MONIME_API_KEY;
    const spaceId = process.env.VITE_MONIME_SPACE_ID || process.env.MONIME_SPACE_ID;

    const monimeRes = await fetch('https://api.monime.io/v1/financial-accounts?withBalance=true&limit=100', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Monime-Space-Id': spaceId,
        'Accept': '*/*'
      }
    });

    const rawData = await monimeRes.json();
    if (!monimeRes.ok) {
      return res.status(monimeRes.status).json({ error: rawData.message || 'Failed to fetch Monime accounts' });
    }

    const accounts = rawData.result || rawData.data || [];
    return res.status(200).json({ accounts });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}