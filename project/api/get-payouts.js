export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const apiKey = process.env.VITE_MONIME_API_KEY || process.env.MONIME_API_KEY;
    const spaceId = process.env.VITE_MONIME_SPACE_ID || process.env.MONIME_SPACE_ID;

    const monimeRes = await fetch('https://api.monime.io/v1/payouts?limit=100', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Monime-Space-Id': spaceId,
        'Accept': '*/*'
      }
    });

    const rawData = await monimeRes.json();
    if (!monimeRes.ok) throw new Error(rawData.message || "Failed to fetch payouts from Monime");

    const payouts = rawData.result || rawData.data || [];
    return res.status(200).json({ payouts });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}