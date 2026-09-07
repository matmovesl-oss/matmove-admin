export type KycStatus = 'pending' | 'approved' | 'rejected';
export type LicenseStatus = 'valid' | 'expired' | 'pending' | 'rejected';
export type Role = 'rider' | 'driver' | 'vendor' | 'ops_manager' | 'super_admin';
export type TxnType = 'credit' | 'debit' | 'fee' | 'payout' | 'refund';
export type TxnDirection = 'in' | 'out';
export type TxnStatus = 'completed' | 'pending' | 'failed';
export type WithdrawalStatus = 'pending' | 'completed' | 'failed';
export type RiskLevel = 'high' | 'medium' | 'low';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  kyc_status: KycStatus;
  id_card_photo: string | null;
  selfie_url: string | null;
  phone_number: string | null;
  created_at: string;
}

export interface DriverProfile {
  id: string;
  profile_id: string;
  kyc_progress: number;
  license_status: LicenseStatus;
  insurance_status: LicenseStatus;
  inspection_status: LicenseStatus;
}

export interface KycQueueItem extends Profile {
  driver?: DriverProfile;
}

export interface Wallet {
  wallet_id: string;
  user_id: string;
  owner_name: string;
  balance: number;
  currency: string;
  is_active: boolean;
  created_at: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  owner_name: string;
  transaction_type: TxnType;
  direction: TxnDirection;
  amount: number;
  status: TxnStatus;
  created_at: string;
}

export interface WithdrawalRequest {
  id: string;
  user_id: string;
  requester_name: string;
  amount: number;
  provider: string;
  vult_reference: string | null;
  status: WithdrawalStatus;
  admin_notes: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_name: string;
  action: string;
  table_name: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface FraudLog {
  id: string;
  actor_name: string;
  activity_type: string;
  risk_level: RiskLevel;
  description: string;
  created_at: string;
}
