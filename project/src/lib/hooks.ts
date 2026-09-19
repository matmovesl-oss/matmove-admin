import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { AuditLog, FraudLog, KycQueueItem, KycStatus, Role, TxnStatus, Wallet, WalletTransaction, WithdrawalRequest, WithdrawalStatus } from './types';

export function useKycQueue() {
  const [items, setItems] = useState<KycQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase.from('profiles').select('*, driver_profiles(*)').order('created_at', { ascending: false });
      if (err) throw err;
      setItems((data || []) as KycQueueItem[]);
    } catch (e: any) { setError(e.message); setItems([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { items, loading, error, refetch: fetch };
}

const buildOwnerName = (profile?: any) => {
  if (!profile) return 'Unknown customer';
  if (profile.full_name?.trim()) return profile.full_name.trim();
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
  return fullName || 'Unnamed customer';
};

// --- UNIFIED WALLETS HOOK ---
export function useWallets() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Explicitly select exact columns based on your schema
      const [walletRes, txnRes, profileRes] = await Promise.all([
        supabase.from('wallets').select('id, user_id, currency, balance, reserved_balance, is_frozen, created_at, metadata').order('created_at', { ascending: false }),
        supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('profiles').select('id, full_name, first_name, last_name, phone, phone_number, role, kyc_status').order('created_at', { ascending: false }),
      ]);

      if (walletRes.error) throw walletRes.error;
      if (txnRes.error) throw txnRes.error;
      if (profileRes.error) throw profileRes.error;

      const profileMap = new Map((profileRes.data || []).map((p: any) => [p.id, p]));

      const enrichedWallets = (walletRes.data || []).map((w: any) => {
        const p = profileMap.get(w.user_id);
        const balance = Number(w.balance || 0);
        const reserved = Number(w.reserved_balance || 0);
        
        return {
          ...w,
          wallet_id: w.id, 
          is_active: !w.is_frozen, // Map is_frozen to is_active for UI compatibility
          monime_account_id: w.metadata?.monime_account_id || null, // Extract virtual account
          owner_name: buildOwnerName(p),
          phone: p?.phone || p?.phone_number || '',
          role: p?.role || '',
          kyc_status: p?.kyc_status || 'not_started',
          available_balance: Math.max(0, balance - reserved)
        };
      });

      const enrichedTxns = (txnRes.data || []).map((t: any) => ({
        ...t,
        owner_name: buildOwnerName(profileMap.get(t.user_id))
      }));

      setWallets(enrichedWallets as Wallet[]);
      setTransactions(enrichedTxns as WalletTransaction[]);
    } catch (e: any) {
      setError(e.message || 'Failed to load wallet data. Check RLS policies.');
      setWallets([]); setTransactions([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch();
    const channel = supabase.channel('admin-wallets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, fetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions' }, fetch)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetch]);

  const toggleFreeze = useCallback(async (walletId: string, active: boolean) => {
    // Inverse active to is_frozen for DB update
    const { error: err } = await supabase.from('wallets').update({ is_frozen: !active }).eq('id', walletId);
    if (err) throw new Error(err.message);
    await fetch();
  }, [fetch]);

  return { wallets, transactions, loading, error, refetch: fetch, toggleFreeze };
}

// --- WITHDRAWALS HOOK ---
export function useWithdrawals() {
  const [items, setItems] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase.from('withdrawal_requests').select('*').order('created_at', { ascending: false });
      if (err) throw err;
      setItems((data || []) as WithdrawalRequest[]);
    } catch (e: any) { setError(e.message); setItems([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch();
    const channel = supabase.channel('admin-withdrawals').on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_requests' }, fetch).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetch]);

  const authorize = useCallback(async (id: string, reason = 'Authorized by admin') => {
    const { error: rpcError } = await supabase.rpc('admin_authorize_withdrawal', { p_withdrawal_id: id, p_reason: reason });
    if (rpcError) throw new Error(rpcError.message);
    await fetch();
  }, [fetch]);

  const reject = useCallback(async (id: string, notes: string) => {
    const { error: rpcError } = await supabase.rpc('admin_reject_withdrawal', { p_withdrawal_id: id, p_reason: notes });
    if (rpcError) throw new Error(rpcError.message);
    await fetch();
  }, [fetch]);

  return { items, loading, error, refetch: fetch, authorize, reject };
}

// --- AUDIT / FRAUD LOGS HOOK ---
export function useAuditLogs() {
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [fraud, setFraud] = useState<FraudLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [aRes, fRes] = await Promise.all([
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('fraud_logs').select('*').order('created_at', { ascending: false }).limit(50),
      ]);
      setAudit((aRes.data || []) as AuditLog[]);
      setFraud((fRes.data || []) as FraudLog[]);
    } catch (e: any) { setAudit([]); setFraud([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { audit, fraud, loading, error, refetch: fetch };
}

export function useTxnStatusUpdate() {
  return useCallback(async (id: string, status: TxnStatus) => {
    const { error: err } = await supabase.from('wallet_transactions').update({ status }).eq('id', id);
    if (err) throw err;
  }, []);
}