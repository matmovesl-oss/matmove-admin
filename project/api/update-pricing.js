import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const { vehicle_type, min_fare, per_km_rate } = req.body;
    
    const { error } = await supabase.from('pricing_settings').upsert({
      vehicle_type, min_fare, per_km_rate
    }, { onConflict: 'vehicle_type' });

    if (error) throw error;
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}