export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing authorization header' });

  const monimeSpaceId = process.env.MONIME_SPACE_ID;
  const monimeApiKey = process.env.MONIME_API_KEY;
  const payrollAccountId = process.env.MONIME_STAFF_PAYROLE_ACCOUNT_ID;

  if (!payrollAccountId || !monimeApiKey || !monimeSpaceId) {
    return res.status(500).json({ error: 'Monime environment variables or Payroll Account ID are missing in Vercel.' });
  }

  // --- GET: Fetch Payroll Balance ---
  if (req.method === 'GET') {
    try {
      const response = await fetch(`https://api.monime.io/v1/financial-accounts/${payrollAccountId}`, {
        headers: {
          'Authorization': `Bearer ${monimeApiKey}`,
          'Monime-Space-Id': monimeSpaceId
        }
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json({ error: data.messages?.[0]?.message || 'Failed to fetch payroll balance' });
      }

      return res.status(200).json({ balance: data.balance?.available });
    } catch (err) {
      console.error('Payroll Balance Error:', err);
      return res.status(500).json({ error: 'Internal server error while fetching balance' });
    }
  }

  // --- POST: Process Payroll Transfer ---
  if (req.method === 'POST') {
    try {
      const { amount, recipientAccountId, reason, requestKey } = req.body;
      if (!amount || !recipientAccountId) return res.status(400).json({ error: 'Missing required fields' });

      const payload = {
        amount: { currency: 'SLE', value: Math.round(Number(amount) * 100) },
        sourceFinancialAccount: { id: payrollAccountId },
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
      console.error('Pay Staff Error:', err);
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}