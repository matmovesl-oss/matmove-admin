export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const monimeKey = process.env.MONIME_API_KEY || process.env.VITE_MONIME_API_KEY;
    const monimeSpace = process.env.MONIME_SPACE_ID || process.env.VITE_MONIME_SPACE_ID;

    if (!monimeKey) return res.status(400).json({ error: "Missing Monime API Keys" });

    const monimeRes = await fetch('https://api.monime.io/v1/payouts?limit=100', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${monimeKey}`,
        'Monime-Space-Id': monimeSpace,
        'Monime-Version': 'caph.2025-08-23'
      }
    });

    const rawData = await monimeRes.json();
    if (!monimeRes.ok) throw new Error(rawData.message || "Failed to fetch payouts");

    const payouts = rawData.result?.items || rawData.result || [];
    return res.status(200).json({ payouts });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}