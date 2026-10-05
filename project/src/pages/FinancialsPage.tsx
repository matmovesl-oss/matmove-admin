import {
  useEffect,
  useState,
} from 'react';

import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';

type Currency = 'SLE' | 'USD';

type Row = {
  id: string;
  user_id: string;
  currency: string;
  balance: number;
  is_frozen: boolean;

  metadata: {
    monime_account_id?: string;
  } | null;

  profiles: {
    full_name?: string;
    phone?: string;
    email?: string;
    role?: string;
  } | null;
};

type GatewayAccount = {
  id: string;
  currency: string;

  balance?: {
    available?: {
      currency: string;
      value: number;
    };
  };
};

const formatMoney = (
  value: number,
  currency: string
) =>
  `${currency} ${Number(
    value
  ).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function FinancialsPage() {
  const [wallets, setWallets] =
    useState<Row[]>([]);

  const [accounts, setAccounts] =
    useState<GatewayAccount[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState<string | null>(null);

  const [error, setError] =
    useState('');

  const [gatewayError, setGatewayError] =
    useState('');

  const [search, setSearch] =
    useState('');

  const [currencyFilter, setCurrencyFilter] =
    useState('all');

  const [reason, setReason] =
    useState('');

  const [target, setTarget] =
    useState<Row | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    setGatewayError('');
    setAccounts([]);

    try {
      if (!supabase) {
        throw new Error(
          'Supabase is not configured.'
        );
      }

      const {
        data,
        error: dbError,
      } = await supabase
        .from('wallets')
        .select(
          'id,user_id,currency,balance,is_frozen,metadata,profiles(full_name,phone,email,role)'
        )
        .order('created_at', {
          ascending: false,
        });

      if (dbError) throw dbError;

      setWallets(
        (data || []) as unknown as Row[]
      );

      try {
        const {
          data: sessionData,
        } =
          await supabase.auth.getSession();

        if (!sessionData.session) {
          throw new Error(
            'Please sign in again.'
          );
        }

        const response = await fetch(
          '/api/admin-wallet-balances',
          {
            headers: {
              Authorization:
                `Bearer ${sessionData.session.access_token}`,
            },
            cache: 'no-store',
          }
        );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
              'Gateway balances could not be loaded.'
          );
        }

        if (
          !Array.isArray(
            result.accounts
          )
        ) {
          throw new Error(
            'Unexpected gateway account response.'
          );
        }

        setAccounts(result.accounts);
      } catch (err: any) {
        setGatewayError(
          err.message ||
            'Gateway balances are unavailable.'
        );
      }
    } catch (err: any) {
      setWallets([]);

      setError(
        err.message ||
          'Wallets could not be loaded.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const accountMap = new Map(
    accounts.map((account) => [
      account.id,
      account,
    ])
  );

  const linkCounts =
    new Map<string, number>();

  wallets.forEach((wallet) => {
    const id =
      wallet.metadata?.monime_account_id;

    if (id) {
      linkCounts.set(
        id,
        (linkCounts.get(id) || 0) + 1
      );
    }
  });

  function getGatewayBalance(
    wallet: Row
  ): number | null {
    const id =
      wallet.metadata?.monime_account_id;

    if (
      !id ||
      linkCounts.get(id) !== 1
    ) {
      return null;
    }

    const account =
      accountMap.get(id);

    const amount =
      account?.balance?.available;

    if (
      !account ||
      account.currency !==
        wallet.currency ||
      amount?.currency !==
        wallet.currency
    ) {
      return null;
    }

    if (
      typeof amount.value !== 'number' ||
      !Number.isSafeInteger(
        amount.value
      ) ||
      amount.value < 0
    ) {
      return null;
    }

    return amount.value / 100;
  }

  const totals:
    Record<Currency, number> = {
      SLE: 0,
      USD: 0,
    };

  wallets.forEach((wallet) => {
    const amount =
      getGatewayBalance(wallet);

    if (
      amount !== null &&
      (
        wallet.currency === 'SLE' ||
        wallet.currency === 'USD'
      )
    ) {
      totals[wallet.currency] +=
        amount;
    }
  });

  const filtered = wallets.filter(
    (wallet) => {
      const text =
        `${
          wallet.profiles?.full_name ||
          ''
        } ${
          wallet.profiles?.phone ||
          ''
        } ${
          wallet.profiles?.email ||
          ''
        } ${
          wallet.metadata
            ?.monime_account_id ||
          ''
        }`.toLowerCase();

      return (
        text.includes(
          search
            .trim()
            .toLowerCase()
        ) &&
        (
          currencyFilter === 'all' ||
          wallet.currency ===
            currencyFilter
        )
      );
    }
  );

  async function saveFreeze() {
    if (!target || !reason.trim()) {
      return;
    }

    setBusy(target.id);
    setError('');

    try {
      if (!supabase) {
        throw new Error(
          'Supabase is not configured.'
        );
      }

      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        'admin_set_wallet_active',
        {
          p_wallet_id: target.id,
          p_is_active:
            target.is_frozen === true,
          p_reason: reason.trim(),
        }
      );

      if (rpcError) throw rpcError;

      if (!data?.success) {
        throw new Error(
          'The database did not confirm the wallet update.'
        );
      }

      setTarget(null);
      setReason('');

      await load();
    } catch (err: any) {
      setError(
        err.message ||
          'The wallet could not be updated.'
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminLayout
      title="Financial & Wallet Control Center"
      subtitle="Customer wallets, currency-specific balances and freeze controls"
    >
      <div className="space-y-5 mt-6">
        <div className="flex flex-wrap gap-3">
          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search customer or Monime ID"
            className="border rounded-lg p-3 flex-1"
          />

          <select
            value={currencyFilter}
            onChange={(event) =>
              setCurrencyFilter(
                event.target.value
              )
            }
            className="border rounded-lg p-3"
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

          <button
            disabled={
              loading || !!busy
            }
            onClick={() =>
              void load()
            }
            className="border rounded-lg px-4 py-2 disabled:opacity-50"
          >
            {loading
              ? 'Loading...'
              : 'Refresh'}
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700"
          >
            {error}
          </p>
        )}

        {gatewayError && (
          <p
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800"
          >
            {gatewayError}{' '}
            Local balances are shown
            separately below.
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          {(
            ['SLE', 'USD'] as Currency[]
          ).map((currency) => (
            <div
              key={currency}
              className="bg-white border rounded-xl p-5"
            >
              <p className="text-sm text-slate-500">
                Linked customer gateway
                balance — {currency}
              </p>

              <p className="text-2xl font-bold mt-2">
                {loading ||
                gatewayError
                  ? 'Unavailable'
                  : formatMoney(
                      totals[currency],
                      currency
                    )}
              </p>
            </div>
          ))}

          <div className="bg-white border rounded-xl p-5">
            <p>Active wallets</p>

            <p className="text-2xl font-bold mt-2">
              {
                wallets.filter(
                  (wallet) =>
                    wallet.is_frozen ===
                    false
                ).length
              }
            </p>
          </div>

          <div className="bg-white border rounded-xl p-5">
            <p>Frozen wallets</p>

            <p className="text-2xl font-bold mt-2">
              {
                wallets.filter(
                  (wallet) =>
                    wallet.is_frozen ===
                    true
                ).length
              }
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Gateway totals include only
          wallets with one verified
          account link and matching
          currency. Unlinked, shared,
          mismatched or unavailable
          accounts are excluded.
        </p>

        {target && (
          <div className="border rounded-xl bg-white p-5 space-y-3">
            <p className="font-bold">
              {target.is_frozen
                ? 'Unfreeze'
                : 'Freeze'}{' '}
              {target.profiles?.full_name ||
                'customer'}{' '}
              — {target.currency} wallet
            </p>

            <input
              value={reason}
              onChange={(event) =>
                setReason(
                  event.target.value
                )
              }
              placeholder="Enter a reason for the audit log"
              maxLength={1000}
              className="border rounded-lg p-3 w-full"
            />

            <div className="flex gap-3">
              <button
                disabled={
                  !!busy ||
                  !reason.trim()
                }
                onClick={() =>
                  void saveFreeze()
                }
                className="bg-slate-900 text-white rounded-lg px-4 py-2 disabled:opacity-50"
              >
                {busy
                  ? 'Saving...'
                  : 'Confirm'}
              </button>

              <button
                disabled={!!busy}
                onClick={() => {
                  setTarget(null);
                  setReason('');
                }}
                className="border rounded-lg px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-4">
                  Customer
                </th>
                <th className="p-4">
                  Currency
                </th>
                <th className="p-4">
                  Monime account
                </th>
                <th className="p-4">
                  Gateway available
                </th>
                <th className="p-4">
                  Local balance
                </th>
                <th className="p-4">
                  Status
                </th>
                <th className="p-4">
                  Controls
                </th>
              </tr>
            </thead>

            <tbody>
              {!loading &&
                filtered.length ===
                  0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-6 text-center text-slate-500"
                    >
                      No wallets found.
                    </td>
                  </tr>
                )}

              {filtered.map((wallet) => {
                const id =
                  wallet.metadata
                    ?.monime_account_id;

                const balance =
                  getGatewayBalance(
                    wallet
                  );

                const account = id
                  ? accountMap.get(id)
                  : undefined;

                const linkStatus = !id
                  ? 'Not linked to Monime'
                  : linkCounts.get(id)! >
                    1
                  ? 'Shared account link — review required'
                  : gatewayError
                  ? 'Gateway unavailable'
                  : !account
                  ? 'Linked account not returned by Monime'
                  : balance === null
                  ? 'Currency/balance mismatch — review required'
                  : '';

                return (
                  <tr
                    key={wallet.id}
                    className="border-t"
                  >
                    <td className="p-4">
                      <p className="font-bold">
                        {wallet.profiles
                          ?.full_name ||
                          'Incomplete profile'}
                      </p>

                      <p className="text-xs text-slate-500">
                        {wallet.profiles
                          ?.phone ||
                          wallet.profiles
                            ?.email}{' '}
                        ·{' '}
                        {
                          wallet.profiles
                            ?.role
                        }
                      </p>
                    </td>

                    <td className="p-4 font-bold">
                      {wallet.currency}
                    </td>

                    <td className="p-4">
                      <p className="font-mono text-xs">
                        {id ||
                          `${wallet.currency} — not provisioned`}
                      </p>

                      {linkStatus && (
                        <p className="text-xs text-amber-700 mt-1">
                          {linkStatus}
                        </p>
                      )}
                    </td>

                    <td className="p-4 font-bold">
                      {balance === null
                        ? 'Unavailable'
                        : formatMoney(
                            balance,
                            wallet.currency
                          )}
                    </td>

                    <td className="p-4">
                      {formatMoney(
                        wallet.balance,
                        wallet.currency
                      )}
                    </td>

                    <td className="p-4">
                      {wallet.is_frozen ===
                      true
                        ? 'Frozen'
                        : wallet.is_frozen ===
                          false
                        ? 'Active'
                        : 'Unknown'}
                    </td>

                    <td className="p-4">
                      <button
                        disabled={
                          !!busy ||
                          loading ||
                          wallet.is_frozen ===
                            null
                        }
                        onClick={() => {
                          setTarget(
                            wallet
                          );
                          setReason('');
                        }}
                        className="border rounded-lg px-3 py-2 disabled:opacity-50"
                      >
                        {wallet.is_frozen
                          ? 'Unfreeze Wallet'
                          : 'Freeze Wallet'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}