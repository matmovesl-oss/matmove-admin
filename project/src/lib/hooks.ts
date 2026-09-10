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

/*
 * --------------------------------------------------------------------------
 * KYC
 * --------------------------------------------------------------------------
 */

export function useKycQueue() {
  const [items, setItems] = useState<KycQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!isSupabaseConfigured || !supabase) {
        await wait(300);
        setItems(mockKycQueue);
        return;
      }

      const { data, error: err } = await supabase
        .from('profiles')
        .select('*, driver_profiles(*)')
        .order('created_at', { ascending: false });

      if (err) throw err;

      setItems((data || []) as KycQueueItem[]);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to load KYC queue'
      );

      if (!isSupabaseConfigured) {
        setItems(mockKycQueue);
      } else {
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const updateStatus = useCallback(
    async (id: string, status: KycStatus) => {
      if (isSupabaseConfigured && supabase) {
        const { error: err } = await supabase
          .from('profiles')
          .update({ kyc_status: status })
          .eq('id', id);

        if (err) throw err;
      }

      setItems((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, kyc_status: status } : p
        )
      );
    },
    []
  );

  return {
    items,
    loading,
    error,
    refetch: fetch,
    updateStatus,
  };
}

/*
 * --------------------------------------------------------------------------
 * WALLETS
 * --------------------------------------------------------------------------
 *
 * Wallet data is loaded from Supabase and enriched with customer profile
 * information.
 *
 * Financial values are never generated in the browser.
 *
 * When Supabase is configured, a live-data failure results in an explicit
 * error and empty financial datasets rather than mock balances.
 */

type WalletRow = {
  wallet_id: string;
  user_id: string;
  currency: 'SLE' | 'USD';
  balance: number;
  reserved_balance?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
};

type ProfileRow = {
  id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  phone_number?: string | null;
  role?: string | null;
  kyc_status?: string | null;
};

type TransactionRow = {
  id: string;
  wallet_id?: string | null;
  user_id?: string | null;
  amount: number;
  status: TxnStatus;
  transaction_type: string;
  direction: 'in' | 'out';
  created_at: string;
  currency?: 'SLE' | 'USD' | null;
  description?: string | null;
  reference_code?: string | null;
};

type AdminWalletControlResult = {
  success?: boolean;
  changed?: boolean;
  wallet_id?: string;
  user_id?: string;
  currency?: 'SLE' | 'USD';
  is_active?: boolean;
  balance?: number;
  reserved_balance?: number;
  available_balance?: number;
  action?: string;
};

const buildOwnerName = (profile?: ProfileRow) => {
  if (!profile) return 'Unknown customer';

  if (profile.full_name?.trim()) {
    return profile.full_name.trim();
  }

  const fullName = [
    profile.first_name,
    profile.last_name,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return fullName || 'Unnamed customer';
};

const normalizeTransactionType = (
  value: string
): WalletTransaction['transaction_type'] => {
  const normalized = value.toLowerCase();

  if (
    normalized === 'credit' ||
    normalized === 'refund' ||
    normalized === 'fee' ||
    normalized === 'payout' ||
    normalized === 'debit'
  ) {
    return normalized as WalletTransaction['transaction_type'];
  }

  return value as WalletTransaction['transaction_type'];
};

export function useWallets() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!isSupabaseConfigured || !supabase) {
        await wait(300);
        setWallets(mockWallets);
        setTransactions(mockTransactions);
        return;
      }

      const [
        walletResponse,
        transactionResponse,
        profileResponse,
      ] = await Promise.all([
        supabase
          .from('wallets')
          .select(
            'wallet_id, user_id, currency, balance, reserved_balance, is_active, created_at, updated_at'
          )
          .order('created_at', { ascending: false }),

        supabase
          .from('wallet_transactions')
          .select(
            'id, wallet_id, user_id, amount, status, transaction_type, direction, created_at, currency, description, reference_code'
          )
          .order('created_at', { ascending: false })
          .limit(100),

        supabase
          .from('profiles')
          .select(
            'id, full_name, first_name, last_name, phone, phone_number, role, kyc_status'
          )
          .order('created_at', { ascending: false }),
      ]);

      if (walletResponse.error) {
        throw walletResponse.error;
      }

      if (transactionResponse.error) {
        throw transactionResponse.error;
      }

      if (profileResponse.error) {
        throw profileResponse.error;
      }

      const walletRows =
        (walletResponse.data || []) as WalletRow[];

      const transactionRows =
        (transactionResponse.data || []) as TransactionRow[];

      const profileRows =
        (profileResponse.data || []) as ProfileRow[];

      const profilesById = new Map(
        profileRows.map((profile) => [
          profile.id,
          profile,
        ])
      );

      const walletById = new Map(
        walletRows.map((wallet) => [
          wallet.wallet_id,
          wallet,
        ])
      );

      const enrichedWallets = walletRows.map(
        (wallet) => {
          const profile =
            profilesById.get(wallet.user_id);

          const balance =
            Number(wallet.balance || 0);

          const reserved =
            Number(wallet.reserved_balance || 0);

          return {
            ...wallet,
            owner_name:
              buildOwnerName(profile),
            phone:
              profile?.phone ||
              profile?.phone_number ||
              '',
            role: profile?.role || '',
            kyc_status:
              profile?.kyc_status ||
              'not_started',
            reserved_balance: reserved,
            available_balance:
              Math.max(
                0,
                balance - reserved
              ),
          } as Wallet;
        }
      );

      const enrichedTransactions =
        transactionRows.map(
          (transaction) => {
            const wallet =
              transaction.wallet_id
                ? walletById.get(
                    transaction.wallet_id
                  )
                : undefined;

            const profileId =
              transaction.user_id ||
              wallet?.user_id ||
              '';

            const profile =
              profilesById.get(profileId);

            return {
              ...transaction,
              transaction_type:
                normalizeTransactionType(
                  transaction.transaction_type
                ),
              owner_name:
                buildOwnerName(profile),
              currency:
                transaction.currency ||
                wallet?.currency ||
                'SLE',
            } as WalletTransaction;
          }
        );

      setWallets(enrichedWallets);
      setTransactions(enrichedTransactions);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : 'Failed to load live wallet data';

      setError(message);

      /*
       * Never display mock financial data when the real backend is configured
       * but unavailable.
       */
      if (!isSupabaseConfigured) {
        setWallets(mockWallets);
        setTransactions(mockTransactions);
      } else {
        setWallets([]);
        setTransactions([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();

    if (!isSupabaseConfigured || !supabase) {
      return;
    }

    const channel = supabase
      .channel('admin-wallets-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallets',
        },
        () => {
          void fetch();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallet_transactions',
        },
        () => {
          void fetch();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          void fetch();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetch]);

  /*
   * ------------------------------------------------------------------------
   * SECURE ADMIN WALLET CONTROL
   * ------------------------------------------------------------------------
   */

  const toggleFreeze = useCallback(
    async (
      walletId: string,
      active: boolean,
      reason = 'Admin wallet status change'
    ) => {
      if (!isSupabaseConfigured || !supabase) {
        setWallets((prev) =>
          prev.map((wallet) =>
            wallet.wallet_id === walletId
              ? {
                  ...wallet,
                  is_active: active,
                }
              : wallet
          )
        );

        return;
      }

      const { data, error: rpcError } =
        await supabase.rpc(
          'admin_set_wallet_active',
          {
            p_wallet_id: walletId,
            p_is_active: active,
            p_reason: reason,
          }
        );

      if (rpcError) {
        throw new Error(
          rpcError.message ||
            'Failed to update wallet status.'
        );
      }

      const result =
        data as AdminWalletControlResult | null;

      if (!result?.success) {
        throw new Error(
          'The wallet control operation was not completed.'
        );
      }

      setWallets((prev) =>
        prev.map((wallet) =>
          wallet.wallet_id === walletId
            ? {
                ...wallet,
                is_active:
                  result.is_active ??
                  active,
                balance:
                  result.balance ??
                  wallet.balance,
                reserved_balance:
                  result.reserved_balance ??
                  wallet.reserved_balance,
                available_balance:
                  result.available_balance ??
                  Math.max(
                    0,
                    Number(
                      wallet.balance || 0
                    ) -
                      Number(
                        wallet.reserved_balance ||
                          0
                      )
                  ),
                updated_at:
                  new Date().toISOString(),
              }
            : wallet
        )
      );

      await fetch();
    },
    [fetch]
  );

  return {
    wallets,
    transactions,
    loading,
    error,
    refetch: fetch,
    toggleFreeze,
  };
}

/*
 * --------------------------------------------------------------------------
 * WITHDRAWALS
 * --------------------------------------------------------------------------
 *
 * All Admin withdrawal state changes go through SECURITY DEFINER RPCs.
 *
 * The browser NEVER directly changes withdrawal_requests.
 *
 * Workflow:
 *
 *   pending
 *      |
 *      +---- Admin rejects ----> failed
 *      |
 *      +---- Admin authorizes -> processing
 *                                  |
 *                                  +-- Provider success -> completed
 *                                  |
 *                                  +-- Provider failure -> failed
 *
 * Wallet funds remain reserved while a withdrawal is processing.
 */

type AdminWithdrawalActionResult = {
  success?: boolean;
  action?: string;
  withdrawal_id?: string;
  status?: string;
  user_id?: string;
  amount?: number;
  currency?: 'SLE' | 'USD';
  provider?: string;
  payment_transaction_id?: string | null;
  failure_code?: string | null;
  reserved_balance?: number;
  available_balance?: number;
};

export function useWithdrawals() {
  const [items, setItems] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!isSupabaseConfigured || !supabase) {
        await wait(300);
        setItems(mockWithdrawals);
        return;
      }

      const { data, error: err } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .order('created_at', {
          ascending: false,
        });

      if (err) throw err;

      setItems(
        (data || []) as WithdrawalRequest[]
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Failed to load withdrawals'
      );

      if (!isSupabaseConfigured) {
        setItems(mockWithdrawals);
      } else {
        /*
         * Financial data must never fall back to fabricated values
         * when Supabase is configured but unavailable.
         */
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();

    if (!isSupabaseConfigured || !supabase) {
      return;
    }

    /*
     * Keep the withdrawal queue synchronized with authoritative database
     * changes, including provider settlement events.
     */
    const channel = supabase
      .channel('admin-withdrawals-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'withdrawal_requests',
        },
        () => {
          void fetch();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetch]);

  /*
   * ------------------------------------------------------------------------
   * SECURE ADMIN AUTHORIZATION
   * ------------------------------------------------------------------------
   *
   * Migration 012:
   *
   *   admin_authorize_withdrawal(uuid, text)
   *
   * The database performs:
   * - authentication
   * - Admin authorization
   * - row locking
   * - pending-state validation
   * - wallet validation
   * - reservation validation
   * - payment transaction synchronization
   * - processing-state transition
   * - audit logging
   *
   * It does NOT debit the wallet. Settlement happens only after the
   * payout provider gives an authoritative result.
   */

  const authorize = useCallback(
    async (
      id: string,
      reason = 'Withdrawal authorized by admin'
    ) => {
      if (!id) {
        throw new Error(
          'Withdrawal ID is required.'
        );
      }

      if (!isSupabaseConfigured || !supabase) {
        setItems((prev) =>
          prev.map((w) =>
            w.id === id
              ? {
                  ...w,
                  status:
                    'completed' as WithdrawalStatus,
                }
              : w
          )
        );

        return;
      }

      const { data, error: rpcError } =
        await supabase.rpc(
          'admin_authorize_withdrawal',
          {
            p_withdrawal_id: id,
            p_reason: reason,
          }
        );

      if (rpcError) {
        throw new Error(
          rpcError.message ||
            'Failed to authorize withdrawal.'
        );
      }

      const result =
        data as AdminWithdrawalActionResult | null;

      if (
        !result?.success ||
        result.withdrawal_id !== id
      ) {
        throw new Error(
          'The withdrawal authorization was not completed.'
        );
      }

      /*
       * Refresh from the database rather than trusting a client-side
       * reconstruction of the financial state.
       */
      await fetch();
    },
    [fetch]
  );

  /*
   * ------------------------------------------------------------------------
   * SECURE ADMIN REJECTION
   * ------------------------------------------------------------------------
   *
   * Migration 012:
   *
   *   admin_reject_withdrawal(uuid, text)
   *
   * The database performs:
   * - authentication
   * - Admin authorization
   * - row locking
   * - pending-state validation
   * - wallet locking
   * - reservation validation
   * - reservation release
   * - failed-state transition
   * - payment transaction synchronization
   * - audit logging
   */

  const reject = useCallback(
    async (
      id: string,
      notes: string
    ) => {
      if (!id) {
        throw new Error(
          'Withdrawal ID is required.'
        );
      }

      const reason = notes.trim();

      if (!reason) {
        throw new Error(
          'A rejection reason is required.'
        );
      }

      if (!isSupabaseConfigured || !supabase) {
        setItems((prev) =>
          prev.map((w) =>
            w.id === id
              ? {
                  ...w,
                  status:
                    'failed' as WithdrawalStatus,
                  admin_notes: reason,
                }
              : w
          )
        );

        return;
      }

      const { data, error: rpcError } =
        await supabase.rpc(
          'admin_reject_withdrawal',
          {
            p_withdrawal_id: id,
            p_reason: reason,
          }
        );

      if (rpcError) {
        throw new Error(
          rpcError.message ||
            'Failed to reject withdrawal.'
        );
      }

      const result =
        data as AdminWithdrawalActionResult | null;

      if (
        !result?.success ||
        result.withdrawal_id !== id
      ) {
        throw new Error(
          'The withdrawal rejection was not completed.'
        );
      }

      /*
       * Refresh from the authoritative database state.
       */
      await fetch();
    },
    [fetch]
  );

  return {
    items,
    loading,
    error,
    refetch: fetch,
    authorize,
    reject,
  };
}

/*
 * --------------------------------------------------------------------------
 * USERS
 * --------------------------------------------------------------------------
 */

export function useUsers() {
  const [items, setItems] = useState<KycQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!isSupabaseConfigured || !supabase) {
        await wait(300);
        setItems(mockKycQueue);
        return;
      }

      const { data, error: err } =
        await supabase
          .from('profiles')
          .select(
            'id, full_name, role, phone_number, kyc_status, created_at'
          )
          .order('created_at', {
            ascending: false,
          });

      if (err) throw err;

      setItems(
        (data || []) as KycQueueItem[]
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Failed to load users'
      );

      if (!isSupabaseConfigured) {
        setItems(mockKycQueue);
      } else {
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const changeRole = useCallback(
    async (
      id: string,
      role: Role
    ) => {
      if (isSupabaseConfigured && supabase) {
        const { error: err } =
          await supabase
            .from('profiles')
            .update({ role })
            .eq('id', id);

        if (err) throw err;
      }

      setItems((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                role,
              }
            : u
        )
      );
    },
    []
  );

  return {
    items,
    loading,
    error,
    refetch: fetch,
    changeRole,
  };
}

/*
 * --------------------------------------------------------------------------
 * AUDIT / FRAUD
 * --------------------------------------------------------------------------
 */

export function useAuditLogs() {
  const [audit, setAudit] =
    useState<AuditLog[]>([]);

  const [fraud, setFraud] =
    useState<FraudLog[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!isSupabaseConfigured || !supabase) {
        await wait(300);
        setAudit(mockAuditLogs);
        setFraud(mockFraudLogs);
        return;
      }

      const [aRes, fRes] =
        await Promise.all([
          supabase
            .from('audit_logs')
            .select('*')
            .order('created_at', {
              ascending: false,
            })
            .limit(100),

          supabase
            .from('fraud_logs')
            .select('*')
            .order('created_at', {
              ascending: false,
            })
            .limit(50),
        ]);

      if (aRes.error) throw aRes.error;
      if (fRes.error) throw fRes.error;

      setAudit(
        (aRes.data || []) as AuditLog[]
      );

      setFraud(
        (fRes.data || []) as FraudLog[]
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Failed to load audit logs'
      );

      if (!isSupabaseConfigured) {
        setAudit(mockAuditLogs);
        setFraud(mockFraudLogs);
      } else {
        setAudit([]);
        setFraud([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();

    if (!isSupabaseConfigured || !supabase) {
      return;
    }

    const channel = supabase
      .channel('audit-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_logs',
        },
        (payload: { new: unknown }) => {
          setAudit((prev) =>
            [
              payload.new as AuditLog,
              ...prev,
            ].slice(0, 100)
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'fraud_logs',
        },
        (payload: { new: unknown }) => {
          setFraud((prev) =>
            [
              payload.new as FraudLog,
              ...prev,
            ].slice(0, 50)
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(
        channel
      );
    };
  }, [fetch]);

  return {
    audit,
    fraud,
    loading,
    error,
    refetch: fetch,
  };
}

/*
 * --------------------------------------------------------------------------
 * LEGACY TRANSACTION STATUS HELPER
 * --------------------------------------------------------------------------
 *
 * Kept for compatibility with existing pages.
 *
 * Financial transaction status changes should ultimately move to secure
 * backend RPCs rather than direct browser writes.
 */

export function useTxnStatusUpdate() {
  return useCallback(
    async (
      id: string,
      status: TxnStatus
    ) => {
      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        return;
      }

      const { error: err } =
        await supabase
          .from('wallet_transactions')
          .update({ status })
          .eq('id', id);

      if (err) throw err;
    },
    []
  );
}