import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';

type Row = {
  id: string;
  user_id: string;
  currency: string;
  balance: number;
  is_frozen: boolean;
  monime_account_id?: string | null;
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

type Account = {
  id: string;
  currency: string;
  balance?: {
    available?: {
      currency: string;
      value: number;
    };
  };
};

type Platform = {
  escrowAccountId: string | null;
  feeAccountId: string | null;
};

const emptyPlatform: Platform = {
  escrowAccountId: null,
  feeAccountId: null,
};

const money = (value: number, currency: string) =>
  `${currency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const accountId = (wallet: Row) =>
  wallet.monime_account_id ||
  wallet.metadata?.monime_account_id ||
  '';

const availableBalance = (
  account?: Account
): number | null => {
  const amount = account?.balance?.available;

  return amount &&
    amount.currency === account?.currency &&
    Number.isSafeInteger(amount.value) &&
    amount.value >= 0
    ? amount.value / 100
    : null;
};

export function FinancialsPage() {
  const [wallets, setWallets] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [platform, setPlatform] =
    useState<Platform>(emptyPlatform);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [gatewayError, setGatewayError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState('all');
  const [target, setTarget] = useState<Row | null>(null);
  const [reason, setReason] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    setGatewayError('');
    setAccounts([]);
    setPlatform(emptyPlatform);

    try {
      const {
        data,
        error: dbError,
      } = await supabase
        .from('wallets')
        .select('*,profiles(full_name,phone,email,role)')
        .order('created_at', { ascending: false });

      if (dbError) throw dbError;

      setWallets((data || []) as unknown as Row[]);
    } catch (err: any) {
      setWallets([]);
      setError(
        err.message ||
        'Customer wallets could not be loaded.'
      );
    }

    try {
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!sessionData.session) {
        throw new Error('Please sign in again.');
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

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || 'Monime balances unavailable.'
        );
      }

      if (!Array.isArray(result.accounts)) {
        throw new Error('Invalid account response.');
      }

      setAccounts(result.accounts);

      setPlatform({
        escrowAccountId:
          result.platform?.escrowAccountId || null,
        feeAccountId:
          result.platform?.feeAccountId || null,
      });
    } catch (err: any) {
      setGatewayError(
        err.message || 'Monime balances unavailable.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const accountMap = new Map(
    accounts.map(account => [account.id, account])
  );

  const linkCounts = new Map<string, number>();

  wallets.forEach(wallet => {
    const id = accountId(wallet);

    if (id) {
      linkCounts.set(
        id,
        (linkCounts.get(id) || 0) + 1
      );
    }
  });

  function customerBalance(wallet: Row) {
    const id = accountId(wallet);
    const account = accountMap.get(id);
    const direct = wallet.monime_account_id;
    const metadata = wallet.metadata?.monime_account_id;

    if (
      gatewayError ||
      (direct && metadata && direct !== metadata) ||
      linkCounts.get(id) !== 1 ||
      account?.currency !== wallet.currency ||
      id === platform.escrowAccountId ||
      id === platform.feeAccountId
    ) {
      return null;
    }

    return availableBalance(account);
  }

  const filtered = wallets.filter(wallet => {
    const text = [
      wallet.profiles?.full_name,
      wallet.profiles?.phone,
      wallet.profiles?.email,
      wallet.profiles?.role,
      accountId(wallet),
    ].join(' ').toLowerCase();

    return (
      text.includes(search.trim().toLowerCase()) &&
      (
        currency === 'all' ||
        wallet.currency === currency
      )
    );
  });

  async function saveFreeze() {
    if (
      !target ||
      busy ||
      reason.trim().length < 3
    ) {
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');

    try {
      const desired = !target.is_frozen;

      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        'matmove_admin_set_wallet_frozen',
        {
          p_wallet_id: target.id,
          p_is_frozen: desired,
          p_reason: reason.trim(),
        }
      );

      if (rpcError) throw rpcError;

      if (
        data?.success !== true ||
        data.wallet_id !== target.id ||
        data.is_frozen !== desired
      ) {
        throw new Error(
          'Freeze status was not confirmed.'
        );
      }

      setNotice(
        desired
          ? 'Wallet frozen. New MatMove wallet operations are blocked.'
          : 'Wallet freeze removed. Other account restrictions still apply.'
      );

      setTarget(null);
      setReason('');

      await load();
    } catch (err: any) {
      setError(
        err.message ||
        'Wallet freeze could not be updated.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout
      title="Financial & Wallet Control Center"
      subtitle="Platform escrow, live customer balances and wallet freeze controls"
    >
      <div className="mt-6 space-y-5">
        <div className="flex flex-wrap gap-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customer or Monime ID"
            className="flex-1 rounded-lg border p-3"
          />

          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            className="rounded-lg border p-3"
          >
            <option value="all">All currencies</option>
            <option value="SLE">SLE</option>
            <option value="USD">USD</option>
          </select>

          <button
            disabled={loading || busy}
            onClick={() => void load()}
            className="rounded-lg border px-4 py-2 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-4 text-red-700"
          >
            {error}
          </p>
        )}

        {gatewayError && (
          <p
            role="alert"
            className="rounded-lg bg-amber-50 p-4 text-amber-800"
          >
            {gatewayError}
          </p>
        )}

        {notice && (
          <p
            role="status"
            className="rounded-lg bg-emerald-50 p-4 text-emerald-800"
          >
            {notice}
          </p>
        )}

        <section className="rounded-xl border border-indigo-200 bg-white p-5">
          <h2 className="text-lg font-bold">
            Platform Escrow &amp; Fees
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Live Monime balance includes held trip funds
            and retained fees. It is not fee earnings alone.
          </p>

          {loading ? (
            <p className="mt-4">
              Loading platform account...
            </p>
          ) : gatewayError ? (
            <p className="mt-4 text-amber-800">
              Platform balance unavailable.
            </p>
          ) : !platform.escrowAccountId ? (
            <p className="mt-4 text-amber-800">
              Configure the Admin server escrow and fee
              account IDs, then redeploy.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {([
                [
                  'Escrow account',
                  platform.escrowAccountId,
                ],
                [
                  'Platform fee account',
                  platform.feeAccountId,
                ],
              ] as const).map(([label, id]) => {
                const account = id
                  ? accountMap.get(id)
                  : undefined;

                const balance =
                  account?.currency === 'SLE'
                    ? availableBalance(account)
                    : null;

                return (
                  <div
                    key={label}
                    className="rounded-lg bg-slate-50 p-4"
                  >
                    <p className="font-semibold">
                      {label}
                    </p>

                    <p className="mt-2 break-all font-mono text-xs">
                      {id || 'Not configured'}
                    </p>

                    <p className="mt-3 text-2xl font-bold">
                      {balance === null
                        ? 'Unavailable'
                        : money(balance, 'SLE')}
                    </p>

                    {balance === null && (
                      <p className="mt-2 text-sm text-amber-800">
                        Check the configured account ID,
                        token, Space, currency and
                        Live/Test mode.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!loading &&
            !gatewayError &&
            platform.escrowAccountId &&
            platform.feeAccountId && (
              <p className="mt-4 text-sm text-slate-600">
                {platform.escrowAccountId ===
                platform.feeAccountId
                  ? 'Shared account: the two cards show one balance. Do not add them together. After confirmed completion, the driver receives 85% and the fee remains here.'
                  : 'Separate accounts: fees go to the configured fee account. Use the same ID for both settings to retain fees in escrow.'}
              </p>
            )}
        </section>

        <div className="grid gap-4 md:grid-cols-4">
          {['SLE', 'USD'].map(unit => {
            const verified = wallets
              .filter(w => w.currency === unit)
              .map(customerBalance)
              .filter(
                (v): v is number => v !== null
              );

            return (
              <div
                key={unit}
                className="rounded-xl border bg-white p-5"
              >
                <p className="text-sm text-slate-500">
                  Linked customer gateway balance — {unit}
                </p>

                <p className="mt-2 text-2xl font-bold">
                  {loading ||
                  gatewayError ||
                  !verified.length
                    ? 'Unavailable'
                    : money(
                        verified.reduce(
                          (a, b) => a + b,
                          0
                        ),
                        unit
                      )}
                </p>
              </div>
            );
          })}

          <div className="rounded-xl border bg-white p-5">
            <p>Active wallets</p>
            <p className="mt-2 text-2xl font-bold">
              {wallets.filter(
                w => w.is_frozen === false
              ).length}
            </p>
          </div>

          <div className="rounded-xl border bg-white p-5">
            <p>Frozen wallets</p>
            <p className="mt-2 text-2xl font-bold">
              {wallets.filter(
                w => w.is_frozen === true
              ).length}
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Customer totals exclude platform accounts and
          missing, conflicting, shared or unavailable links.
          Freeze controls block new MatMove wallet operations;
          they do not freeze Monime directly.
        </p>

        {target && (
          <div className="space-y-3 rounded-xl border bg-white p-5">
            <p className="font-bold">
              {target.is_frozen ? 'Unfreeze' : 'Freeze'}{' '}
              {target.profiles?.full_name || 'customer'}{' '}
              — {target.currency}
            </p>

            <input
              value={reason}
              onChange={e =>
                setReason(e.target.value)
              }
              maxLength={1000}
              placeholder="Reason for the audit log (at least 3 characters)"
              className="w-full rounded-lg border p-3"
            />

            <div className="flex gap-3">
              <button
                disabled={
                  busy ||
                  reason.trim().length < 3
                }
                onClick={() => void saveFreeze()}
                className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
              >
                {busy ? 'Saving...' : 'Confirm'}
              </button>

              <button
                disabled={busy}
                onClick={() => {
                  setTarget(null);
                  setReason('');
                }}
                className="rounded-lg border px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                {[
                  'Customer',
                  'Currency',
                  'Monime account',
                  'Gateway available',
                  'Local balance',
                  'Status',
                  'Controls',
                ].map(label => (
                  <th key={label} className="p-4">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {!loading && !filtered.length && (
                <tr>
                  <td
                    colSpan={7}
                    className="p-6 text-center"
                  >
                    No customer wallets found.
                  </td>
                </tr>
              )}

              {filtered.map(wallet => {
                const balance =
                  customerBalance(wallet);

                return (
                  <tr
                    key={wallet.id}
                    className="border-t"
                  >
                    <td className="p-4">
                      <p className="font-bold">
                        {wallet.profiles?.full_name ||
                          'Unknown customer'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {wallet.profiles?.role}{' '}
                        {wallet.profiles?.phone}
                      </p>
                    </td>

                    <td className="p-4">
                      {wallet.currency}
                    </td>

                    <td className="max-w-xs break-all p-4 font-mono text-xs">
                      {accountId(wallet) || 'Not linked'}
                    </td>

                    <td className="p-4">
                      {loading || balance === null
                        ? 'Unavailable'
                        : money(
                            balance,
                            wallet.currency
                          )}
                    </td>

                    <td className="p-4">
                      {money(
                        Number(wallet.balance || 0),
                        wallet.currency
                      )}
                    </td>

                    <td className="p-4">
                      {wallet.is_frozen
                        ? 'Frozen'
                        : 'Active'}
                    </td>

                    <td className="p-4">
                      <button
                        disabled={loading || busy}
                        onClick={() => {
                          setTarget(wallet);
                          setReason('');
                          setNotice('');
                        }}
                        className="rounded-lg border px-3 py-2 disabled:opacity-50"
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