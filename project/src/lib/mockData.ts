import type {
  AuditLog,
  DriverProfile,
  FraudLog,
  KycQueueItem,
  Profile,
  Wallet,
  WalletTransaction,
  WithdrawalRequest,
} from './types';

const now = Date.now();
const iso = (offsetMin: number) => new Date(now - offsetMin * 60_000).toISOString();

export const mockProfiles: Profile[] = [
  {
    id: 'p1', full_name: 'Aisha Kamara', role: 'driver', kyc_status: 'pending',
    id_card_photo: 'https://images.unsplash.com/photo-1633337555762-708e5b08f0c6?w=600',
    selfie_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600',
    phone_number: '+232 77 123 456', created_at: iso(20),
  },
  {
    id: 'p2', full_name: 'Mohamed Sesay', role: 'driver', kyc_status: 'pending',
    id_card_photo: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=600',
    selfie_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600',
    phone_number: '+232 78 998 112', created_at: iso(60),
  },
  {
    id: 'p3', full_name: 'Fatmata Conteh', role: 'rider', kyc_status: 'approved',
    id_card_photo: null, selfie_url: null,
    phone_number: '+232 76 445 778', created_at: iso(1440),
  },
  {
    id: 'p4', full_name: 'Ibrahim Koroma', role: 'vendor', kyc_status: 'pending',
    id_card_photo: 'https://images.unsplash.com/photo-1542909168-82c3e7fd2ac1?w=600',
    selfie_url: 'https://images.unsplash.com/photo-1599566150163-2916d2362b8e?w=600',
    phone_number: '+232 79 332 110', created_at: iso(90),
  },
  {
    id: 'p5', full_name: 'Hawa Bangura', role: 'ops_manager', kyc_status: 'approved',
    id_card_photo: null, selfie_url: null,
    phone_number: '+232 77 880 220', created_at: iso(2880),
  },
  {
    id: 'p6', full_name: 'Sankoh Abdul', role: 'driver', kyc_status: 'rejected',
    id_card_photo: 'https://images.unsplash.com/photo-1560250097-0b9351c8f8e3?w=600',
    selfie_url: 'https://images.unsplash.com/photo-1570295995511-6ce9c1a47f3e?w=600',
    phone_number: '+232 78 667 443', created_at: iso(180),
  },
];

export const mockDriverProfiles: DriverProfile[] = [
  { id: 'd1', profile_id: 'p1', kyc_progress: 75, license_status: 'valid', insurance_status: 'pending', inspection_status: 'valid' },
  { id: 'd2', profile_id: 'p2', kyc_progress: 50, license_status: 'pending', insurance_status: 'valid', inspection_status: 'pending' },
  { id: 'd3', profile_id: 'p6', kyc_progress: 25, license_status: 'expired', insurance_status: 'rejected', inspection_status: 'pending' },
];

export const mockKycQueue: KycQueueItem[] = mockProfiles.map((p) => ({
  ...p,
  driver: mockDriverProfiles.find((d) => d.profile_id === p.id),
}));

export const mockWallets: Wallet[] = [
  { wallet_id: 'w1', user_id: 'p1', owner_name: 'Aisha Kamara', balance: 18500, currency: 'SLE', is_active: true, created_at: iso(1500) },
  { wallet_id: 'w2', user_id: 'p2', owner_name: 'Mohamed Sesay', balance: 7250, currency: 'SLE', is_active: true, created_at: iso(1400) },
  { wallet_id: 'w3', user_id: 'p3', owner_name: 'Fatmata Conteh', balance: 1200, currency: 'SLE', is_active: true, created_at: iso(1300) },
  { wallet_id: 'w4', user_id: 'p4', owner_name: 'Ibrahim Koroma', balance: 64000, currency: 'SLE', is_active: false, created_at: iso(1200) },
  { wallet_id: 'w5', user_id: 'p5', owner_name: 'Hawa Bangura', balance: 0, currency: 'SLE', is_active: true, created_at: iso(1100) },
  { wallet_id: 'w6', user_id: 'p6', owner_name: 'Sankoh Abdul', balance: 320, currency: 'SLE', is_active: false, created_at: iso(1000) },
];

export const mockTransactions: WalletTransaction[] = [
  { id: 't1', wallet_id: 'w1', owner_name: 'Aisha Kamara', transaction_type: 'credit', direction: 'in', amount: 4500, status: 'completed', created_at: iso(15) },
  { id: 't2', wallet_id: 'w2', owner_name: 'Mohamed Sesay', transaction_type: 'payout', direction: 'out', amount: 2000, status: 'pending', created_at: iso(40) },
  { id: 't3', wallet_id: 'w4', owner_name: 'Ibrahim Koroma', transaction_type: 'debit', direction: 'out', amount: 12000, status: 'failed', created_at: iso(75) },
  { id: 't4', wallet_id: 'w3', owner_name: 'Fatmata Conteh', transaction_type: 'credit', direction: 'in', amount: 600, status: 'completed', created_at: iso(120) },
  { id: 't5', wallet_id: 'w1', owner_name: 'Aisha Kamara', transaction_type: 'fee', direction: 'out', amount: 150, status: 'completed', created_at: iso(200) },
  { id: 't6', wallet_id: 'w4', owner_name: 'Ibrahim Koroma', transaction_type: 'refund', direction: 'in', amount: 3200, status: 'completed', created_at: iso(260) },
  { id: 't7', wallet_id: 'w2', owner_name: 'Mohamed Sesay', transaction_type: 'credit', direction: 'in', amount: 2750, status: 'completed', created_at: iso(320) },
  { id: 't8', wallet_id: 'w5', owner_name: 'Hawa Bangura', transaction_type: 'debit', direction: 'out', amount: 980, status: 'pending', created_at: iso(400) },
];

export const mockWithdrawals: WithdrawalRequest[] = [
  { id: 'wr1', user_id: 'p1', requester_name: 'Aisha Kamara', amount: 5000, provider: 'vult', vult_reference: 'VULT-7F3A-91', status: 'pending', admin_notes: null, created_at: iso(10) },
  { id: 'wr2', user_id: 'p4', requester_name: 'Ibrahim Koroma', amount: 12000, provider: 'vult', vult_reference: 'VULT-2B8C-44', status: 'pending', admin_notes: null, created_at: iso(35) },
  { id: 'wr3', user_id: 'p2', requester_name: 'Mohamed Sesay', amount: 2000, provider: 'vult', vult_reference: 'VULT-9D1E-07', status: 'pending', admin_notes: null, created_at: iso(55) },
  { id: 'wr4', user_id: 'p6', requester_name: 'Sankoh Abdul', amount: 320, provider: 'vult', vult_reference: 'VULT-5K2M-33', status: 'failed', admin_notes: 'Flagged for duplicate vult reference.', created_at: iso(180) },
  { id: 'wr5', user_id: 'p3', requester_name: 'Fatmata Conteh', amount: 600, provider: 'vult', vult_reference: 'VULT-1A7B-58', status: 'completed', admin_notes: null, created_at: iso(500) },
];

export const mockAuditLogs: AuditLog[] = [
  { id: 'a1', actor_name: 'Hawa Bangura', action: 'UPDATE', table_name: 'wallets', metadata: { field: 'is_active', value: false }, created_at: iso(5) },
  { id: 'a2', actor_name: 'System', action: 'INSERT', table_name: 'fraud_logs', metadata: { activity_type: 'multiple_accounts', risk: 'high' }, created_at: iso(12) },
  { id: 'a3', actor_name: 'Hawa Bangura', action: 'UPDATE', table_name: 'profiles', metadata: { field: 'kyc_status', value: 'approved' }, created_at: iso(25) },
  { id: 'a4', actor_name: 'System', action: 'INSERT', table_name: 'withdrawal_requests', metadata: { amount: 5000, provider: 'vult' }, created_at: iso(40) },
  { id: 'a5', actor_name: 'Sankoh Abdul', action: 'LOGIN', table_name: 'auth', metadata: { ip: '102.22.45.11' }, created_at: iso(60) },
  { id: 'a6', actor_name: 'Hawa Bangura', action: 'DELETE', table_name: 'wallet_transactions', metadata: { id: 't9' }, created_at: iso(90) },
  { id: 'a7', actor_name: 'System', action: 'INSERT', table_name: 'fraud_logs', metadata: { activity_type: 'unusual_payout', risk: 'medium' }, created_at: iso(110) },
];

export const mockFraudLogs: FraudLog[] = [
  { id: 'f1', actor_name: 'Ibrahim Koroma', activity_type: 'Multiple accounts detected', risk_level: 'high', description: 'Same device fingerprint registered to 3 wallets.', created_at: iso(8) },
  { id: 'f2', actor_name: 'Sankoh Abdul', activity_type: 'Duplicate vult reference', risk_level: 'high', description: 'Withdrawal request reused a prior vult_reference.', created_at: iso(30) },
  { id: 'f3', actor_name: 'Mohamed Sesay', activity_type: 'Unusual payout volume', risk_level: 'medium', description: '3 payout requests within 24h, above 90th percentile.', created_at: iso(70) },
  { id: 'f4', actor_name: 'Aisha Kamara', activity_type: 'Rapid top-ups', risk_level: 'medium', description: '5 wallet credits in 10 minutes.', created_at: iso(95) },
  { id: 'f5', actor_name: 'Fatmata Conteh', activity_type: 'Location mismatch', risk_level: 'low', description: 'Login from new city; no other anomalies.', created_at: iso(130) },
  { id: 'f6', actor_name: 'Hawa Bangura', activity_type: 'Role escalation attempt', risk_level: 'low', description: 'Ops manager attempted super_admin endpoint; blocked by policy.', created_at: iso(160) },
];
