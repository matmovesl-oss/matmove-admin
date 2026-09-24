import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { AuditLog, FraudLog, KycQueueItem, TxnStatus, Wallet, WalletTransaction, WithdrawalRequest } from './types';

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

// --- SUPABASE-ONLY WALLETS HOOK ---
export function useWallets() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLedger = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [walletRes, txnRes, profileRes] = await Promise.all([
        supabase.from('wallets').select('id, user_id, currency, balance, reserved_balance, is_frozen, created_at, metadata').order('created_at', { ascending: false }),
        supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('profiles').select('id, full_name, first_name, last_name, phone, phone_number, role, kyc_status').order('created_at', { ascending: false }),
      ]);

      if (walletRes.error) throw walletRes.error;
      const profileMap = new Map((profileRes.data || []).map((p: any) => [p.id, p]));

      const enrichedWallets = (walletRes.data || []).map((w: any) => {
        const p = profileMap.get(w.user_id);
        const balance = Number(w.balance || 0); // Directly from Supabase (updated by Webhook)
        const reserved = Number(w.reserved_balance || 0);
        
        return {
          ...w,
          wallet_id: w.id, 
          is_active: !w.is_frozen,
          monime_account_id: w.metadata?.monime_account_id || null,
          owner_name: buildOwnerName(p),
          phone: p?.phone || p?.phone_number || '',
          role: p?.role || '',
          kyc_status: p?.kyc_status || 'not_started',
          balance: balance,
          available_balance: Math.max(0, balance - reserved)
        };
      });

      const enrichedTxns = (txnRes.data || []).map((t: any) => ({
        ...t, owner_name: buildOwnerName(profileMap.get(t.user_id))
      }));

      setWallets(enrichedWallets as Wallet[]);
      setTransactions(enrichedTxns as WalletTransaction[]);
    } catch (e: any) {
      setError(e.message || 'Failed to load wallet data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchLedger();
    const channel = supabase.channel('admin-wallets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, fetchLedger)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchLedger]);

  const toggleFreeze = useCallback(async (walletId: string, active: boolean) => {
    const { error: err } = await supabase.from('wallets').update({ is_frozen: !active }).eq('id', walletId);
    if (err) throw new Error(err.message);
    await fetchLedger();
  }, [fetchLedger]);

  return { wallets, transactions, loading, error, refetch: fetchLedger, toggleFreeze };
}

// --- SUPABASE-ONLY WITHDRAWALS HOOK ---
export function useWithdrawals() {
  const [items, setItems] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPayouts = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase
        .from('withdrawal_requests')
        .select('*, profiles:user_id(full_name, first_name, last_name, phone)')
        .order('created_at', { ascending: false });
      if (err) throw err;

      const enriched = (data || []).map((w: any) => ({
        ...w,
        requester_name: buildOwnerName(w.profiles),
        phone: w.destination_phone || w.profiles?.phone || 'Phone on file'
        // Status is read directly from Supabase (updated by Webhook)
      }));

      setItems(enriched as WithdrawalRequest[]);
    } catch (e: any) { setError(e.message); setItems([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchPayouts();
    const channel = supabase.channel('admin-withdrawals').on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_requests' }, fetchPayouts).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchPayouts]);

  const authorize = useCallback(async (id: string, reason = 'Authorized by admin') => {
    const { error: rpcError } = await supabase.rpc('admin_authorize_withdrawal', { p_withdrawal_id: id, p_reason: reason });
    if (rpcError) throw new Error(rpcError.message);
    await fetchPayouts();
  }, [fetchPayouts]);

  const reject = useCallback(async (id: string, notes: string) => {
    const { error: rpcError } = await supabase.rpc('admin_reject_withdrawal', { p_withdrawal_id: id, p_reason: notes });
    if (rpcError) throw new Error(rpcError.message);
    await fetchPayouts();
  }, [fetchPayouts]);

  return { items, loading, error, refetch: fetchPayouts, authorize, reject };
}

export function useAuditLogs() {
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [fraud, setFraud] = useState<FraudLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
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

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  return { audit, fraud, loading, error, refetch: fetchLogs };
}