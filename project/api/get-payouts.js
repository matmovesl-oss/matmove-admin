export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const monimeRes = await fetch('https://api.monime.io/v1/payouts?limit=100', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.VITE_MONIME_API_KEY}`,
        'Monime-Space-Id': process.env.VITE_MONIME_SPACE_ID,
        'Monime-Version': 'caph.2025-08-23'
      }
    });

    const rawData = await monimeRes.json();
    const payouts = rawData.result?.items || rawData.result || [];
    return res.status(200).json({ payouts });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}