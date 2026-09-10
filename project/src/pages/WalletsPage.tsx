import { useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import Spinner from '@/components/Spinner';
import EmptyState from '@/components/EmptyState';
import { useWallets } from '@/lib/hooks';
import { formatSLE, formatDate } from '@/lib/format';
import type { TxnStatus, TxnType } from '@/lib/types';
import {
  Wallet,
  Lock,
  Unlock,
  TrendingUp,
  Snowflake,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  RefreshCw,
  ShieldCheck,
  Clock3,
  CircleDollarSign,
  Banknote,
  AlertTriangle,
} from 'lucide-react';

type Currency = 'SLE' | 'USD';

const txnTone: Record<
  TxnStatus,
  'emerald' | 'amber' | 'red'
> = {
  completed: 'emerald',
  pending: 'amber',
  failed: 'red',
};

const typeTone: Partial<
  Record<
    TxnType,
    'emerald' | 'amber' | 'red' | 'blue' | 'indigo'
  >
> = {
  credit: 'emerald',
  refund: 'emerald',
  fee: 'amber',
  payout: 'indigo',
  debit: 'blue',
};

function formatCurrency(
  amount: number,
  currency: Currency,
) {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));
  }

  return formatSLE(Number(amount || 0));
}

function formatNumber(amount: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

function normalizeCurrency(value: unknown): Currency {
  return value === 'USD' ? 'USD' : 'SLE';
}

function normalizeKycStatus(value: unknown) {
  const status = String(value || '').toLowerCase();

  if (status === 'approved') return 'Approved';
  if (status === 'rejected' || status === 'declined') {
    return 'Declined';
  }

  return 'Pending';
}

function getKycTone(
  value: unknown,
): 'emerald' | 'amber' | 'red' {
  const status = String(value || '').toLowerCase();

  if (status === 'approved') return 'emerald';

  if (
    status === 'rejected' ||
    status === 'declined'
  ) {
    return 'red';
  }

  return 'amber';
}

function getTypeTone(value: unknown) {
  return (
    typeTone[value as TxnType] ||
    'blue'
  );
}

export default function WalletsPage() {
  const {
    wallets,
    transactions,
    loading,
    error,
    refetch,
    toggleFreeze,
  } = useWallets();

  const [busyId, setBusyId] =
    useState<string | null>(null);

  const [err, setErr] =
    useState<string | null>(null);

  const [walletSearch, setWalletSearch] =
    useState('');

  const [currencyFilter, setCurrencyFilter] =
    useState<'all' | Currency>('all');

  const [walletStatusFilter, setWalletStatusFilter] =
    useState<'all' | 'active' | 'frozen'>('all');

  const [txFilter, setTxFilter] =
    useState<'all' | TxnStatus>('all');

  const [txCurrencyFilter, setTxCurrencyFilter] =
    useState<'all' | Currency>('all');

  const [refreshing, setRefreshing] =
    useState(false);

  const totalSleBalance = useMemo(
    () =>
      wallets
        .filter(
          (wallet) =>
            normalizeCurrency(wallet.currency) ===
            'SLE',
        )
        .reduce(
          (sum, wallet) =>
            sum + Number(wallet.balance || 0),
          0,
        ),
    [wallets],
  );

  const totalUsdBalance = useMemo(
    () =>
      wallets
        .filter(
          (wallet) =>
            normalizeCurrency(wallet.currency) ===
            'USD',
        )
        .reduce(
          (sum, wallet) =>
            sum + Number(wallet.balance || 0),
          0,
        ),
    [wallets],
  );

  const totalSleReserved = useMemo(
    () =>
      wallets
        .filter(
          (wallet) =>
            normalizeCurrency(wallet.currency) ===
            'SLE',
        )
        .reduce(
          (sum, wallet) =>
            sum + Number(wallet.reserved_balance || 0),
          0,
        ),
    [wallets],
  );

  const totalUsdReserved = useMemo(
    () =>
      wallets
        .filter(
          (wallet) =>
            normalizeCurrency(wallet.currency) ===
            'USD',
        )
        .reduce(
          (sum, wallet) =>
            sum + Number(wallet.reserved_balance || 0),
          0,
        ),
    [wallets],
  );

  const totalSleAvailable = useMemo(
    () =>
      wallets
        .filter(
          (wallet) =>
            normalizeCurrency(wallet.currency) ===
            'SLE',
        )
        .reduce(
          (sum, wallet) =>
            sum +
            Math.max(
              0,
              Number(wallet.balance || 0) -
                Number(wallet.reserved_balance || 0),
            ),
          0,
        ),
    [wallets],
  );

  const totalUsdAvailable = useMemo(
    () =>
      wallets
        .filter(
          (wallet) =>
            normalizeCurrency(wallet.currency) ===
            'USD',
        )
        .reduce(
          (sum, wallet) =>
            sum +
            Math.max(
              0,
              Number(wallet.balance || 0) -
                Number(wallet.reserved_balance || 0),
            ),
          0,
        ),
    [wallets],
  );

  const activeCount = wallets.filter(
    (wallet) => wallet.is_active,
  ).length;

  const frozenCount =
    wallets.length - activeCount;

  const reservedWalletCount = wallets.filter(
    (wallet) =>
      Number(wallet.reserved_balance || 0) > 0,
  ).length;

  const filteredWallets = useMemo(() => {
    const query = walletSearch
      .trim()
      .toLowerCase();

    return wallets.filter((wallet) => {
      const currency =
        normalizeCurrency(wallet.currency);

      const matchesCurrency =
        currencyFilter === 'all' ||
        currency === currencyFilter;

      const matchesStatus =
        walletStatusFilter === 'all' ||
        (walletStatusFilter === 'active' &&
          wallet.is_active) ||
        (walletStatusFilter === 'frozen' &&
          !wallet.is_active);

      const searchable = [
        wallet.owner_name,
        wallet.phone,
        wallet.role,
        wallet.wallet_id,
        wallet.user_id,
        wallet.kyc_status,
        currency,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        !query || searchable.includes(query);

      return (
        matchesCurrency &&
        matchesStatus &&
        matchesSearch
      );
    });
  }, [
    wallets,
    walletSearch,
    currencyFilter,
    walletStatusFilter,
  ]);

  const filteredTx = useMemo(() => {
    return transactions.filter((transaction) => {
      const currency = normalizeCurrency(
        transaction.currency,
      );

      const matchesStatus =
        txFilter === 'all' ||
        transaction.status === txFilter;

      const matchesCurrency =
        txCurrencyFilter === 'all' ||
        currency === txCurrencyFilter;

      return (
        matchesStatus &&
        matchesCurrency
      );
    });
  }, [
    transactions,
    txFilter,
    txCurrencyFilter,
  ]);

  const handleRefresh = async () => {
    setErr(null);
    setRefreshing(true);

    try {
      await refetch();
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : 'Failed to refresh wallet data.',
      );
    } finally {
      setRefreshing(false);
    }
  };

  const handleFreeze = async (
    walletId: string,
    currentlyActive: boolean,
  ) => {
    setErr(null);
    setBusyId(walletId);

    try {
      await toggleFreeze(
        walletId,
        !currentlyActive,
      );
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : 'Failed to update wallet status.',
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminLayout
      title="Financial & Wallet Control Center"
      subtitle="Live customer wallets, balances, reserves and transaction activity"
    >
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div>
          <p className="text-sm text-slate-500">
            Financial data is read from the live MatMove
            backend.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            className={`w-4 h-4 ${
              refreshing
                ? 'animate-spin'
                : ''
            }`}
          />
          Refresh
        </button>
      </div>

      {(error || err) && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{err || error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <StatCard
          label="SLE Wallet Balance"
          value={formatCurrency(
            totalSleBalance,
            'SLE',
          )}
          icon={Banknote}
          tone="indigo"
        />

        <StatCard
          label="USD Wallet Balance"
          value={formatCurrency(
            totalUsdBalance,
            'USD',
          )}
          icon={CircleDollarSign}
          tone="emerald"
        />

        <StatCard
          label="Available SLE"
          value={formatCurrency(
            totalSleAvailable,
            'SLE',
          )}
          icon={TrendingUp}
          tone="emerald"
        />

        <StatCard
          label="Available USD"
          value={formatCurrency(
            totalUsdAvailable,
            'USD',
          )}
          icon={TrendingUp}
          tone="blue"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Reserved SLE"
          value={formatCurrency(
            totalSleReserved,
            'SLE',
          )}
          icon={Clock3}
          tone="amber"
        />

        <StatCard
          label="Reserved USD"
          value={formatCurrency(
            totalUsdReserved,
            'USD',
          )}
          icon={Clock3}
          tone="amber"
        />

        <StatCard
          label="Active Wallets"
          value={String(activeCount)}
          icon={TrendingUp}
          tone="emerald"
        />

        <StatCard
          label="Frozen Wallets"
          value={String(frozenCount)}
          icon={Snowflake}
          tone="amber"
        />
      </div>

      <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />

          <div>
            <p className="text-sm font-semibold text-indigo-900">
              Wallet control is backend-authorized
            </p>

            <p className="text-sm text-indigo-700 mt-1">
              Freeze and unfreeze operations are sent
              through the secure Admin wallet-control
              operation. Financial balances are not edited
              directly from this browser interface.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold text-slate-900">
                  Customer Wallets
                </h3>

                <p className="text-xs text-slate-500 mt-1">
                  {filteredWallets.length} of{' '}
                  {wallets.length} wallets
                  {reservedWalletCount > 0 &&
                    ` • ${reservedWalletCount} with reserved funds`}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                <input
                  value={walletSearch}
                  onChange={(event) =>
                    setWalletSearch(
                      event.target.value,
                    )
                  }
                  placeholder="Search customer, phone or wallet..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                />
              </div>

              <div className="flex gap-2">
                <select
                  value={currencyFilter}
                  onChange={(event) =>
                    setCurrencyFilter(
                      event.target.value as
                        | 'all'
                        | Currency,
                    )
                  }
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                >
                  <option value="all">
                    All currencies
                  </option>

                  <option value="SLE">
                    SLE
                  </option>

                  <option value="USD">
                    USD
                  </option>
                </select>

                <select
                  value={walletStatusFilter}
                  onChange={(event) =>
                    setWalletStatusFilter(
                      event.target.value as
                        | 'all'
                        | 'active'
                        | 'frozen',
                    )
                  }
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                >
                  <option value="all">
                    All statuses
                  </option>

                  <option value="active">
                    Active
                  </option>

                  <option value="frozen">
                    Frozen
                  </option>
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <Spinner label="Loading wallets..." />
          ) : filteredWallets.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={
                wallets.length === 0
                  ? 'No wallets'
                  : 'No matching wallets'
              }
            />
          ) : (
            <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium">
                      Customer
                    </th>

                    <th className="text-left px-5 py-3 font-medium">
                      Currency
                    </th>

                    <th className="text-left px-5 py-3 font-medium">
                      Balance
                    </th>

                    <th className="text-left px-5 py-3 font-medium">
                      Reserved
                    </th>

                    <th className="text-left px-5 py-3 font-medium">
                      Available
                    </th>

                    <th className="text-left px-5 py-3 font-medium">
                      KYC
                    </th>

                    <th className="text-left px-5 py-3 font-medium">
                      Status
                    </th>

                    <th className="text-right px-5 py-3 font-medium">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredWallets.map(
                    (wallet) => {
                      const currency =
                        normalizeCurrency(
                          wallet.currency,
                        );

                      const balance =
                        Number(
                          wallet.balance || 0,
                        );

                      const reserved =
                        Number(
                          wallet.reserved_balance ||
                            0,
                        );

                      const available =
                        Math.max(
                          0,
                          balance - reserved,
                        );

                      const isBusy =
                        busyId ===
                        wallet.wallet_id;

                      return (
                        <tr
                          key={
                            wallet.wallet_id
                          }
                          className="hover:bg-slate-50"
                        >
                          <td className="px-5 py-3 min-w-[220px]">
                            <p className="font-medium text-slate-900">
                              {wallet.owner_name ||
                                'Unknown customer'}
                            </p>

                            {wallet.phone && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                {wallet.phone}
                              </p>
                            )}

                            <div className="flex items-center gap-2 mt-1">
                              {wallet.role && (
                                <span className="text-[11px] uppercase tracking-wide text-slate-400">
                                  {wallet.role}
                                </span>
                              )}

                              <span className="text-[10px] text-slate-300">
                                •
                              </span>

                              <span className="text-[10px] text-slate-400 font-mono">
                                {wallet.wallet_id.slice(
                                  0,
                                  10,
                                )}
                                …
                              </span>
                            </div>
                          </td>

                          <td className="px-5 py-3">
                            <Badge
                              tone={
                                currency ===
                                'USD'
                                  ? 'blue'
                                  : 'indigo'
                              }
                            >
                              {currency}
                            </Badge>
                          </td>

                          <td className="px-5 py-3">
                            <p className="font-semibold text-slate-900">
                              {formatCurrency(
                                balance,
                                currency,
                              )}
                            </p>
                          </td>

                          <td className="px-5 py-3">
                            <p
                              className={
                                reserved > 0
                                  ? 'font-medium text-amber-700'
                                  : 'text-slate-400'
                              }
                            >
                              {formatCurrency(
                                reserved,
                                currency,
                              )}
                            </p>
                          </td>

                          <td className="px-5 py-3">
                            <p className="font-medium text-emerald-700">
                              {formatCurrency(
                                available,
                                currency,
                              )}
                            </p>
                          </td>

                          <td className="px-5 py-3">
                            <Badge
                              tone={getKycTone(
                                wallet.kyc_status,
                              )}
                            >
                              {normalizeKycStatus(
                                wallet.kyc_status,
                              )}
                            </Badge>
                          </td>

                          <td className="px-5 py-3">
                            {wallet.is_active ? (
                              <Badge tone="emerald">
                                Active
                              </Badge>
                            ) : (
                              <Badge tone="amber">
                                Frozen
                              </Badge>
                            )}
                          </td>

                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                handleFreeze(
                                  wallet.wallet_id,
                                  wallet.is_active,
                                )
                              }
                              title={
                                wallet.is_active
                                  ? 'Freeze wallet'
                                  : 'Unfreeze wallet'
                              }
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50 ${
                                wallet.is_active
                                  ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                                  : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                              }`}
                            >
                              {wallet.is_active ? (
                                <Lock className="w-3.5 h-3.5" />
                              ) : (
                                <Unlock className="w-3.5 h-3.5" />
                              )}

                              {isBusy
                                ? 'Updating...'
                                : wallet.is_active
                                  ? 'Freeze'
                                  : 'Unfreeze'}
                            </button>
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold text-slate-900">
                  Global Wallet Activity
                </h3>

                <p className="text-xs text-slate-500 mt-1">
                  Latest live wallet transactions
                </p>
              </div>

              <div className="flex gap-1.5 flex-wrap">
                {(
                  [
                    'all',
                    'completed',
                    'pending',
                    'failed',
                  ] as const
                ).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() =>
                      setTxFilter(status)
                    }
                    className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize ${
                      txFilter === status
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex gap-1.5">
              {(
                ['all', 'SLE', 'USD'] as const
              ).map((currency) => (
                <button
                  key={currency}
                  type="button"
                  onClick={() =>
                    setTxCurrencyFilter(
                      currency,
                    )
                  }
                  className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                    txCurrencyFilter ===
                    currency
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {currency === 'all'
                    ? 'All currencies'
                    : currency}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <Spinner label="Loading transactions..." />
          ) : filteredTx.length === 0 ? (
            <EmptyState
              icon={ArrowDownLeft}
              title="No transactions"
            />
          ) : (
            <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium">
                      Customer
                    </th>

                    <th className="text-left px-5 py-3 font-medium">
                      Type
                    </th>

                    <th className="text-left px-5 py-3 font-medium">
                      Direction
                    </th>

                    <th className="text-left px-5 py-3 font-medium">
                      Amount
                    </th>

                    <th className="text-left px-5 py-3 font-medium">
                      Status
                    </th>

                    <th className="text-left px-5 py-3 font-medium">
                      Reference
                    </th>

                    <th className="text-left px-5 py-3 font-medium">
                      Date
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredTx.map(
                    (transaction) => {
                      const currency =
                        normalizeCurrency(
                          transaction.currency,
                        );

                      const type =
                        String(
                          transaction.transaction_type ||
                            'transaction',
                        );

                      return (
                        <tr
                          key={
                            transaction.id
                          }
                          className="hover:bg-slate-50"
                        >
                          <td className="px-5 py-3 min-w-[160px]">
                            <p className="font-medium text-slate-700">
                              {transaction.owner_name ||
                                'Unknown customer'}
                            </p>
                          </td>

                          <td className="px-5 py-3">
                            <Badge
                              tone={getTypeTone(
                                transaction.transaction_type,
                              )}
                            >
                              {type}
                            </Badge>
                          </td>

                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-medium ${
                                transaction.direction ===
                                'in'
                                  ? 'text-emerald-600'
                                  : 'text-slate-500'
                              }`}
                            >
                              {transaction.direction ===
                              'in' ? (
                                <ArrowDownLeft className="w-3.5 h-3.5" />
                              ) : (
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              )}

                              {transaction.direction ===
                              'in'
                                ? 'Credit'
                                : 'Debit'}
                            </span>
                          </td>

                          <td className="px-5 py-3">
                            <p className="font-semibold text-slate-900">
                              {formatCurrency(
                                Number(
                                  transaction.amount ||
                                    0,
                                ),
                                currency,
                              )}
                            </p>

                            <p className="text-[10px] text-slate-400 uppercase">
                              {currency}
                            </p>
                          </td>

                          <td className="px-5 py-3">
                            <Badge
                              tone={
                                txnTone[
                                  transaction
                                    .status
                                ] ||
                                'amber'
                              }
                            >
                              {
                                transaction.status
                              }
                            </Badge>
                          </td>

                          <td className="px-5 py-3 max-w-[180px]">
                            <p className="text-xs font-mono text-slate-500 truncate">
                              {transaction.reference_code ||
                                '—'}
                            </p>

                            {transaction.description && (
                              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                {
                                  transaction.description
                                }
                              </p>
                            )}
                          </td>

                          <td className="px-5 py-3 text-slate-500 text-xs whitespace-nowrap">
                            {formatDate(
                              transaction.created_at,
                            )}
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />

          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              Financial control protection
            </h4>

            <p className="text-xs text-slate-500 mt-1 leading-5">
              Available balance is calculated as wallet
              balance minus funds reserved for pending
              withdrawals. Customer financial balances are
              read from the backend. Freeze and unfreeze
              operations use the secure Admin wallet-control
              RPC and do not directly modify wallet balances.
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Backend-authoritative controls
              </span>

              <span>
                {formatNumber(wallets.length)} total wallets
              </span>

              <span>
                {formatNumber(reservedWalletCount)} with
                reserved funds
              </span>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}