import { supabase } from '../lib/supabase';

export interface PendingUser {
  id: string;
  email: string;
  full_name: string;
  role: 'rider' | 'driver' | 'merchant';
  kyc_status: string;
  created_at: string;
  phone?: string;
  address?: string;
  city?: string;
  id_type?: string;
  id_number?: string;
  id_front_url?: string;
  id_back_url?: string;
  selfie_url?: string;
  vehicle_type?: string;
  license_plate?: string;
  business_name?: string;
  infrastructure?: string;
}

export async function fetchPendingSubmissions(): Promise<PendingUser[]> {
  // Fetch profiles with status 'submitted'
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('kyc_status', 'submitted');

  if (profileErr) throw profileErr;
  if (!profiles || profiles.length === 0) return [];

  // Map and attach KYC submission details
  const pendingUsers: PendingUser[] = [];

  for (const profile of profiles) {
    const { data: kyc } = await supabase
      .from('kyc_submissions')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle();

    pendingUsers.push({
      id: profile.id,
      email: profile.email || 'N/A',
      full_name: profile.full_name || 'N/A',
      role: profile.roles?.[0] || 'rider',
      kyc_status: profile.kyc_status,
      created_at: profile.created_at,
      phone: profile.phone,
      address: profile.address,
      city: profile.city,
      id_type: kyc?.id_type,
      id_number: kyc?.id_number,
      id_front_url: kyc?.id_front_url,
      id_back_url: kyc?.id_back_url,
      selfie_url: kyc?.selfie_url,
      vehicle_type: kyc?.vehicle_type,
      license_plate: kyc?.license_plate,
      business_name: kyc?.business_name,
      infrastructure: kyc?.infrastructure,
    });
  }

  return pendingUsers;
}

export async function updateKycStatus(
  userId: string, 
  status: 'approved' | 'rejected', 
  rejectionReason?: string
) {
  // 1. Update profiles table
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ kyc_status: status })
    .eq('id', userId);

  if (profileErr) throw profileErr;

  // 2. Update kyc_submissions table
  const { error: kycErr } = await supabase
    .from('kyc_submissions')
    .update({ 
      status: status, 
      rejection_reason: status === 'rejected' ? rejectionReason : null,
      reviewed_at: new Date().toISOString()
    })
    .eq('user_id', userId);

  if (kycErr) throw kycErr;
}