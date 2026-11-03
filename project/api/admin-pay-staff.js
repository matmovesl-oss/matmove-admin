export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing authorization header' });

    const { amount, recipientAccountId, reason, requestKey } = req.body;
    if (!amount || !recipientAccountId) return res.status(400).json({ error: 'Missing required fields' });

    const monimeSpaceId = process.env.MONIME_SPACE_ID;
    const monimeApiKey = process.env.MONIME_API_KEY;
    // We explicitly draw from the Payroll Account ID you defined in Vercel
    const sourceAccountId = process.env.MONIME_STAFF_PAYROLE_ACCOUNT_ID; 

    if (!sourceAccountId) return res.status(500).json({ error: 'MONIME_STAFF_PAYROLE_ACCOUNT_ID is missing from Vercel config.' });

    // Format matches Monime Internal Transfer payload
    const payload = {
      amount: { currency: 'SLE', value: Math.round(Number(amount) * 100) },
      sourceFinancialAccount: { id: sourceAccountId },
      destinationFinancialAccount: { id: recipientAccountId },
      description: reason || 'Staff Administrative Payroll'
    };

    const monimeRes = await fetch('https://api.monime.io/v1/internal-transfers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${monimeApiKey}`,
        'Monime-Space-Id': monimeSpaceId,
        'Idempotency-Key': requestKey || crypto.randomUUID()
      },
      body: JSON.stringify(payload)
    });

    const data = await monimeRes.json();
    if (!monimeRes.ok) return res.status(monimeRes.status).json({ error: data.messages?.[0]?.message || 'Payroll transfer failed.' });

    return res.status(200).json({ success: true, status: data.status, transfer: data });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}