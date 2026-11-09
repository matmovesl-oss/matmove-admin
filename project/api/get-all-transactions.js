import { requireAdmin } from '../server/admin-auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    await requireAdmin(req, ['transactions']);

    // Monime credentials must remain server-only. Never fall back to VITE_ keys.
    const apiKey = process.env.MONIME_API_KEY;
    const spaceId = process.env.MONIME_SPACE_ID;
    if (!apiKey || !spaceId) {
      return res.status(503).json({ error: 'Monime server configuration is missing.' });
    }

    const monimeRes = await fetch('https://api.monime.io/v1/financial-transactions?limit=50', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Monime-Space-Id': spaceId,
        'Monime-Version': 'caph.2025-08-23',
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(15000)
    });

    const rawData = await monimeRes.json().catch(() => null);
    if (!monimeRes.ok || !rawData || !Array.isArray(rawData.result)) {
      return res.status(502).json({ error: 'Monime transactions are temporarily unavailable.' });
    }

    return res.status(200).json({ transactions: rawData.result });
  } catch (error) {
    return res.status(error.status || 502).json({
      error: error.status ? error.message : 'Admin provider data unavailable.'
    });
  }
}
