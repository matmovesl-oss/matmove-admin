import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { path, userId } = req.body;
    if (!path) return res.status(400).json({ error: 'File path is required' });

    const cleanPath = path.replace(/^kyc-documents\//, '').replace(/^\//, '');
    const filenameOnly = cleanPath.split('/').pop() || cleanPath;

    // Create a 5-minute (300 seconds) signed URL for both possible storage locations
    const url1 = await supabase.storage.from('kyc-documents').createSignedUrl(filenameOnly, 300);
    const url2 = await supabase.storage.from('kyc-documents').createSignedUrl(`${userId}/${filenameOnly}`, 300);

    return res.status(200).json({
      signedUrl1: url1.data?.signedUrl || null,
      signedUrl2: url2.data?.signedUrl || null
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}