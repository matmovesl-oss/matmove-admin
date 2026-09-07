import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from './supabase';
import {
  mockAuditLogs,
  mockFraudLogs,
  mockKycQueue,
  mockTransactions,
  mockWallets,
  mockWithdrawals,
} from './mockData';
import type {
  AuditLog,
  FraudLog,
  KycQueueItem,
  KycStatus,
  Role,
  TxnStatus,
  Wallet,
  WalletTransaction,
  WithdrawalRequest,
  WithdrawalStatus,
} from './types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useKycQueue() {
  const [items, setItems] = useState<KycQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isSupabaseConfigured) {
        await wait(300);
        setItems(mockKycQueue);
        return;
      }
      const { data, error: err } = await supabase!
        .from('profiles')
        .select('*, driver_profiles(*)')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setItems((data || []) as KycQueueItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load KYC queue');
      setItems(mockKycQueue);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const updateStatus = useCallback(async (id: string, status: KycStatus) => {
    if (isSupabaseConfigured) {
      const { error: err } = await supabase!
        .from('profiles').update({ kyc_status: status }).eq('id', id);
      if (err) throw err;
    }
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, kyc_status: status } : p)));
  }, []);

  return { items, loading, error, refetch: fetch, updateStatus };
}

export function useWallets() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isSupabaseConfigured) {
        await wait(300);
        setWallets(mockWallets);
        setTransactions(mockTransactions);
        return;
      }
      const [wRes, tRes] = await Promise.all([
        supabase!.from('wallets').select('*').order('created_at', { ascending: false }),
        supabase!.from('wallet_transactions').select('*').order('created_at', { ascending: false }).limit(50),
      ]);
      if (wRes.error) throw wRes.error;
      if (tRes.error) throw tRes.error;
      setWallets((wRes.data || []) as Wallet[]);
      setTransactions((tRes.data || []) as WalletTransaction[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load wallets');
      setWallets(mockWallets);
      setTransactions(mockTransactions);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const toggleFreeze = useCallback(async (walletId: string, active: boolean) => {
    if (isSupabaseConfigured) {
      const { error: err } = await supabase!
        .from('wallets').update({ is_active: active }).eq('wallet_id', walletId);
      if (err) throw err;
    }
    setWallets((prev) => prev.map((w) => (w.wallet_id === walletId ? { ...w, is_active: active } : w)));
  }, []);

  return { wallets, transactions, loading, error, refetch: fetch, toggleFreeze };
}

export function useWithdrawals() {
  const [items, setItems] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isSupabaseConfigured) {
        await wait(300);
        setItems(mockWithdrawals);
        return;
      }
      const { data, error: err } = await supabase!
        .from('withdrawal_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setItems((data || []) as WithdrawalRequest[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load withdrawals');
      setItems(mockWithdrawals);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const authorize = useCallback(async (id: string) => {
    if (isSupabaseConfigured) {
      const { error: err } = await supabase!
        .from('withdrawal_requests').update({ status: 'completed' as WithdrawalStatus }).eq('id', id);
      if (err) throw err;
    }
    setItems((prev) => prev.map((w) => (w.id === id ? { ...w, status: 'completed' } : w)));
  }, []);

  const reject = useCallback(async (id: string, notes: string) => {
    if (isSupabaseConfigured) {
      const { error: err } = await supabase!
        .from('withdrawal_requests').update({ status: 'failed' as WithdrawalStatus, admin_notes: notes }).eq('id', id);
      if (err) throw err;
    }
    setItems((prev) => prev.map((w) => (w.id === id ? { ...w, status: 'failed', admin_notes: notes } : w)));
  }, []);

  return { items, loading, error, refetch: fetch, authorize, reject };
}

export function useUsers() {
  const [items, setItems] = useState<KycQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isSupabaseConfigured) {
        await wait(300);
        setItems(mockKycQueue);
        return;
      }
      const { data, error: err } = await supabase!
        .from('profiles')
        .select('id, full_name, role, phone_number, kyc_status, created_at')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setItems((data || []) as KycQueueItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
      setItems(mockKycQueue);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const changeRole = useCallback(async (id: string, role: Role) => {
    if (isSupabaseConfigured) {
      const { error: err } = await supabase!.from('profiles').update({ role }).eq('id', id);
      if (err) throw err;
    }
    setItems((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
  }, []);

  return { items, loading, error, refetch: fetch, changeRole };
}

export function useAuditLogs() {
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [fraud, setFraud] = useState<FraudLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isSupabaseConfigured) {
        await wait(300);
        setAudit(mockAuditLogs);
        setFraud(mockFraudLogs);
        return;
      }
      const [aRes, fRes] = await Promise.all([
        supabase!.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
        supabase!.from('fraud_logs').select('*').order('created_at', { ascending: false }).limit(50),
      ]);
      if (aRes.error) throw aRes.error;
      if (fRes.error) throw fRes.error;
      setAudit((aRes.data || []) as AuditLog[]);
      setFraud((fRes.data || []) as FraudLog[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit logs');
      setAudit(mockAuditLogs);
      setFraud(mockFraudLogs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    if (isSupabaseConfigured) {
      const channel = supabase!
        .channel('audit-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, (payload: { new: unknown }) => {
          setAudit((prev) => [payload.new as AuditLog, ...prev].slice(0, 100));
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fraud_logs' }, (payload: { new: unknown }) => {
          setFraud((prev) => [payload.new as FraudLog, ...prev].slice(0, 50));
        })
        .subscribe();
      return () => { supabase!.removeChannel(channel); };
    }
  }, [fetch]);

  return { audit, fraud, loading, error, refetch: fetch };
}

export function useTxnStatusUpdate() {
  return useCallback(async (id: string, status: TxnStatus) => {
    if (isSupabaseConfigured) {
      const { error: err } = await supabase!
        .from('wallet_transactions').update({ status }).eq('id', id);
      if (err) throw err;
    }
  }, []);
}
