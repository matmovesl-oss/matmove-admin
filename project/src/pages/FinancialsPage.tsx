
import {exportCompleteCsv} from '@/lib/csvExport';

import { useEffect, useState, useRef, useCallback } from 'react';
import {useAdminAccess,canAccess} from '@/lib/adminAccess';
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
  spinAccountId: string | null;
  referralAccountId: string | null;
  mainAccountId: string | null;
  businessAccountIds: string[];
};

const emptyPlatform: Platform = {
  escrowAccountId: null,
  feeAccountId: null,
  spinAccountId: null,
  referralAccountId: null,
  mainAccountId: null,
  businessAccountIds: [],
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
  const access=useAdminAccess(),allowed=canAccess(access,'financials');
  const stamp=JSON.stringify([access?.id,allowed,access?.is_active,access?.permissions]);
  const current=useRef(stamp);current.current=stamp;
  const mounted=useRef(false),generation=useRef(0),writeLock=useRef(false);
  const [loadedStamp,setLoadedStamp]=useState('');
  const [referralAccountId,setReferralAccountId]=useState<string|null>(null);
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

  const load=useCallback(async()=> {
    if(!allowed)return;
    const token=++generation.current;
    const valid=()=>mounted.current&&current.current===stamp&&generation.current===token;
    setLoadedStamp(stamp);setWallets([]);
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
      if(!Array.isArray(data))throw new Error('Customer wallet response is invalid.');
      if(!valid())return;
      setWallets(data as unknown as Row[]);
    } catch (err: any) {
      if(!valid())return;
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

      if(!valid())return;
      if (!sessionData.session || sessionData.session.user.id!==access?.id) {
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
      if(!valid())return;

      if (!response.ok) {
        throw new Error(
          result.error || 'Monime balances unavailable.'
        );
      }

      if (!Array.isArray(result.accounts)) {
        throw new Error('Invalid account response.');
      }

      // Customer totals require the complete server classification.
      const businessIds = result.businessAccountIds;
      if (!Array.isArray(businessIds) || businessIds.some((id:unknown) => typeof id !== 'string' || !/^fac-[A-Za-z0-9_-]+$/.test(id))) {
        throw new Error('Platform account classification was not confirmed.');
      }
      const after = await supabase.auth.getSession();
      if (!valid()) return;
      if (after.error || after.data.session?.user.id !== access?.id) throw new Error('Your sign-in changed. Reopen Financials.');
      setAccounts(result.accounts);

      setPlatform({
        businessAccountIds: businessIds,
        referralAccountId: result.platform?.referralAccountId || null,
        mainAccountId: result.platform?.mainAccountId || null,
        spinAccountId: result.platform?.spinAccountId || null,
        escrowAccountId:
          result.platform?.escrowAccountId || null,
        feeAccountId:
          result.platform?.feeAccountId || null,
      });
    } catch (err: any) {
      if(!valid())return;
      setGatewayError(
        err.message || 'Monime balances unavailable.'
      );
    } finally {
      if(valid())setLoading(false);
    }
  },[stamp,allowed,access?.id]);

  useEffect(() => {
    mounted.current=true;setTarget(null);setReason('');setNotice('');setBusy(false);
    void load();
    return()=>{mounted.current=false;generation.current++;};
  }, [load]);

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
      loading || error || gatewayError || loadedStamp!==stamp ||
      (direct && metadata && direct !== metadata) ||
      linkCounts.get(id) !== 1 ||
      account?.currency !== wallet.currency ||
      id === platform.escrowAccountId ||
      id === platform.feeAccountId || id === platform.spinAccountId || id === referralAccountId ||
      id === platform.referralAccountId || id === platform.mainAccountId || platform.businessAccountIds.includes(id)
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
      !allowed || loadedStamp!==stamp || writeLock.current ||
      busy ||
      reason.trim().length < 3
    ) {
      return;
    }

    writeLock.current=true;const actionStamp=stamp;
    const valid=()=>mounted.current&&current.current===actionStamp;
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const {data:session,error:sessionError}=await supabase.auth.getSession();
      if(sessionError)throw sessionError;
      if(!valid()||session.session?.user.id!==access?.id)throw new Error('Session changed. Sign in again before updating a wallet.');
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
      if(!valid())return;

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
      if(!valid())return;
      setError(
        err.message ||
        'Wallet freeze could not be updated.'
      );
    } finally {
      writeLock.current=false;if(valid())setBusy(false);
    }
  }

  if(!allowed)return <AdminLayout title="Financial & Wallets"><p role="alert" className="p-6">Access denied.</p></AdminLayout>;
  if(loadedStamp!==stamp)return <AdminLayout title="Financial & Wallets"><p className="p-6">Loading wallets...</p></AdminLayout>;

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
            {loading ? 'Loading...' : error || gatewayError ? 'Retry financials' : 'Refresh'}
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
                  {loading ? 'Loading...' : error ||
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
              {loading ? 'Loading...' : error ? 'Unavailable' : wallets.filter(
                w => w.is_frozen === false
              ).length}
            </p>
          </div>

          <div className="rounded-xl border bg-white p-5">
            <p>Frozen wallets</p>
            <p className="mt-2 text-2xl font-bold">
              {loading ? 'Loading...' : error ? 'Unavailable' : wallets.filter(
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
              {target.profiles?.full_name || target.profiles?.email || target.profiles?.phone || target.user_id}{' '}
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
              {loading ? <tr><td colSpan={7} className="p-6 text-center">Loading customer wallets...</td></tr> : error ? <tr><td colSpan={7} className="p-6 text-center">Customer wallets could not be loaded. Use Retry financials.</td></tr> : !filtered.length && (
                <tr>
                  <td
                    colSpan={7}
                    className="p-6 text-center"
                  >
                    No customer wallets found.
                  </td>
                </tr>
              )}

              {!loading && !error && filtered.map(wallet => {
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
                          wallet.profiles?.email || wallet.profiles?.phone || wallet.user_id}
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
                      {balance === null
                        ? 'Unavailable'
                        : money(
                            balance,
                            wallet.currency
                          )}
                    </td>

                    <td className="p-4">
                      {wallet.balance!=null && Number.isFinite(Number(wallet.balance)) ? money(Number(wallet.balance),wallet.currency) : 'Unavailable'}
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

type ReferralOverview={actor:string;owner:boolean;activationReady:boolean;campaign:{revision:string;accepting:boolean;payments:boolean;budgetMinor:string;source:string|null};totals:{referrals:string;pendingMinor:string;creditedMinor:string;reviewMinor:string;budgetUsedMinor:string;reservedMinor:string};treasury:{accountId:string;availableMinor:string;currency:'SLE';observedAt:string}|null;treasuryError:string|null};
const referralFields=['id','new_user_email','inviter_email','beneficiary_email','code','kind','amount_minor','currency','state','provider_id','created_at','updated_at'];
const unsigned=(v:unknown):v is string=>typeof v==='string'&&/^\d{1,19}$/.test(v);
