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

// --- SMART MONIME GATEWAY ---
export function useWallets() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLedger = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [walletRes, txnRes, profileRes] = await Promise.all([
        supabase.from('wallets').select('*').order('created_at', { ascending: false }),
        supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      ]);

      if (walletRes.error) throw walletRes.error;
      const profileMap = new Map((profileRes.data || []).map((p: any) => [p.id, p]));

      // FETCH ALL LIVE ACCOUNTS FROM MONIME
      let monimeAccounts: any[] = [];
      try {
        const apiRes = await fetch('/api/get-space-balance');
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          monimeAccounts = apiData.accounts || [];
        }
      } catch (e) { console.error("Monime API Sync Failed", e); }

      const enrichedWallets = (walletRes.data || []).map((w: any) => {
        const p = profileMap.get(w.user_id);
        const ownerName = buildOwnerName(p);
        const phone = p?.phone || p?.phone_number || '';
        
        let trueBalance = Number(w.balance || 0);
        let matchedMonimeId = w.metadata?.monime_account_id || null;

        // SMART FUZZY MATCHING: Check Monime API by ID, UVAN, Name, or Phone
        if (monimeAccounts.length > 0) {
          const match = monimeAccounts.find(acc => {
            const accName = String(acc.name || '').toLowerCase();
            const accId = String(acc.id || '').trim();
            return (
              accId === matchedMonimeId || 
              (phone && accName.includes(phone.toLowerCase())) || 
              (ownerName !== 'Unknown customer' && accName.includes(ownerName.toLowerCase()))
            );
          });

          if (match) {
             matchedMonimeId = match.id;
             const rawBal = match.balance?.available?.value ?? match.balance?.value ?? 0;
             trueBalance = Number(rawBal) / 100;
          }
        }
        
        const reserved = Number(w.reserved_balance || 0);
        
        return {
          ...w,
          wallet_id: w.id, 
          is_active: !w.is_frozen,
          monime_account_id: matchedMonimeId,
          owner_name: ownerName,
          phone: phone,
          role: p?.role || '',
          kyc_status: p?.kyc_status || 'not_started',
          balance: trueBalance, // FORCES TRUE BALANCE
          available_balance: Math.max(0, trueBalance - reserved)
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
    const channel = supabase.channel('admin-wallets').on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, fetchLedger).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchLedger]);

  const toggleFreeze = useCallback(async (walletId: string, active: boolean) => {
    await supabase.from('wallets').update({ is_frozen: !active }).eq('id', walletId);
    await fetchLedger();
  }, [fetchLedger]);

  return { wallets, transactions, loading, error, refetch: fetchLedger, toggleFreeze };
}

// --- WITHDRAWALS HOOK ---
export function useWithdrawals() {
  const [items, setItems] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPayouts = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase.from('withdrawal_requests').select('*, profiles:user_id(full_name, first_name, last_name, phone)').order('created_at', { ascending: false });
      if (err) throw err;

      const enriched = (data || []).map((w: any) => ({
        ...w,
        requester_name: buildOwnerName(w.profiles),
        phone: w.destination_phone || w.profiles?.phone || 'Phone on file'
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
    await supabase.rpc('admin_authorize_withdrawal', { p_withdrawal_id: id, p_reason: reason });
    await fetchPayouts();
  }, [fetchPayouts]);

  const reject = useCallback(async (id: string, notes: string) => {
    await supabase.rpc('admin_reject_withdrawal', { p_withdrawal_id: id, p_reason: notes });
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