export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const { amount, recipientAccountId, reason } = req.body;

    if (!amount || !recipientAccountId) {
      return res.status(400).json({ error: 'Missing required fields: amount and recipientAccountId' });
    }

    const monimeSpaceId = process.env.MONIME_SPACE_ID;
    const monimeApiKey = process.env.MONIME_API_KEY;
    const sourceAccountId = process.env.MONIME_REFUND_ACCOUNT_ID; // Using refund account as the operational float

    if (!sourceAccountId || !monimeApiKey || !monimeSpaceId) {
      return res.status(500).json({ error: 'Monime environment variables are missing.' });
    }

    // Payload formatted for Monime Internal Transfers API
    const payload = {
      amount: {
        currency: 'SLE',
        value: Math.round(Number(amount) * 100) // Convert to minor units (cents)
      },
      sourceFinancialAccount: {
        id: sourceAccountId
      },
      destinationFinancialAccount: {
        id: recipientAccountId
      },
      description: reason || 'Staff Payment'
    };

    const monimeRes = await fetch('https://api.monime.io/v1/internal-transfers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${monimeApiKey}`,
        'Monime-Space-Id': monimeSpaceId
      },
      body: JSON.stringify(payload)
    });

    const data = await monimeRes.json();

    if (!monimeRes.ok || data.status === 'failed') {
      console.error('Transfer failed:', data);
      return res.status(monimeRes.status || 400).json({ 
        error: data.failureDetail?.message || data.messages?.[0]?.message || 'Transfer failed at gateway' 
      });
    }

    return res.status(200).json({ success: true, transfer: data });
  } catch (err) {
    console.error('Pay Staff Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}