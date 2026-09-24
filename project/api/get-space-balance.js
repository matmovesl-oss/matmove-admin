export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const apiKey = process.env.MONIME_API_KEY || process.env.VITE_MONIME_API_KEY;
    const spaceId = process.env.MONIME_SPACE_ID || process.env.VITE_MONIME_SPACE_ID;

    if (!apiKey || !spaceId) {
      return res.status(500).json({ error: 'Monime API key or Space ID missing in environment variables.' });
    }

    const monimeRes = await fetch('https://api.monime.io/v1/financial-accounts?withBalance=true&limit=100', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Monime-Space-Id': spaceId,
        'Monime-Version': 'caph.2025-08-23'
      }
    });

    const rawData = await monimeRes.json();
    if (!monimeRes.ok) {
      return res.status(monimeRes.status).json({ error: rawData.message || 'Failed to fetch Monime accounts' });
    }

    const accounts = rawData.result || rawData.data || (Array.isArray(rawData) ? rawData : []);
    return res.status(200).json({ accounts });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}