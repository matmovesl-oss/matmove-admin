import { useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import Spinner from '@/components/Spinner';
import EmptyState from '@/components/EmptyState';
import { useWallets } from '@/lib/hooks';
import { formatSLE, formatDate, timeAgo } from '@/lib/format';
import type { TxnStatus, TxnType } from '@/lib/types';
import { Wallet, Lock, Unlock, TrendingUp, TrendingDown, Snowflake, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

const txnTone: Record<TxnStatus, 'emerald' | 'amber' | 'red'> = {
  completed: 'emerald',
  pending: 'amber',
  failed: 'red',
};

const typeTone: Record<TxnType, 'emerald' | 'amber' | 'red' | 'blue' | 'indigo'> = {
  credit: 'emerald',
  refund: 'emerald',
  fee: 'amber',
  payout: 'indigo',
  debit: 'blue',
};

export default function WalletsPage() {
  const { wallets, transactions, loading, toggleFreeze } = useWallets();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [txFilter, setTxFilter] = useState<'all' | TxnStatus>('all');

  const totalBalance = useMemo(() => wallets.reduce((s, w) => s + w.balance, 0), [wallets]);
  const activeCount = wallets.filter((w) => w.is_active).length;
  const frozenCount = wallets.length - activeCount;

  const filteredTx = txFilter === 'all' ? transactions : transactions.filter((t) => t.status === txFilter);

  const handleFreeze = async (walletId: string, currentlyActive: boolean) => {
    setErr(null);
    setBusyId(walletId);
    try {
      await toggleFreeze(walletId, !currentlyActive);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update wallet');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminLayout
      title="Financial & Wallet Ledger"
      subtitle="System-wide balances, transactions, and wallet controls"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total System Balance" value={formatSLE(totalBalance)} icon={Wallet} tone="indigo" />
        <StatCard label="Active Wallets" value={String(activeCount)} icon={TrendingUp} tone="emerald" />
        <StatCard label="Frozen Wallets" value={String(frozenCount)} icon={Snowflake} tone="amber" />
      </div>

      {err && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{err}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900">User Wallets</h3>
          </div>
          {loading ? (
            <Spinner label="Loading wallets..." />
          ) : wallets.length === 0 ? (
            <EmptyState icon={Wallet} title="No wallets" />
          ) : (
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide sticky top-0">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium">Owner</th>
                    <th className="text-left px-5 py-3 font-medium">Balance</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                    <th className="text-right px-5 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {wallets.map((w) => (
                    <tr key={w.wallet_id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{w.owner_name}</p>
                        <p className="text-xs text-slate-400 font-mono">{w.wallet_id}</p>
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-900">{formatSLE(w.balance)}</td>
                      <td className="px-5 py-3">
                        {w.is_active ? <Badge tone="emerald">Active</Badge> : <Badge tone="amber">Frozen</Badge>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          disabled={busyId === w.wallet_id}
                          onClick={() => handleFreeze(w.wallet_id, w.is_active)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50 ${
                            w.is_active
                              ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                              : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                          }`}
                        >
                          {w.is_active ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          {w.is_active ? 'Freeze' : 'Unfreeze'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold text-slate-900">Global Ledger</h3>
            <div className="flex gap-1.5">
              {(['all', 'completed', 'pending', 'failed'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setTxFilter(f)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize ${
                    txFilter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <Spinner label="Loading transactions..." />
          ) : filteredTx.length === 0 ? (
            <EmptyState icon={ArrowDownLeft} title="No transactions" />
          ) : (
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide sticky top-0">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium">Owner</th>
                    <th className="text-left px-5 py-3 font-medium">Type</th>
                    <th className="text-left px-5 py-3 font-medium">Direction</th>
                    <th className="text-left px-5 py-3 font-medium">Amount</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                    <th className="text-left px-5 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTx.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 text-slate-700">{t.owner_name}</td>
                      <td className="px-5 py-3"><Badge tone={typeTone[t.transaction_type]}>{t.transaction_type}</Badge></td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs ${t.direction === 'in' ? 'text-emerald-600' : 'text-slate-500'}`}>
                          {t.direction === 'in' ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                          {t.direction}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-900">{formatSLE(t.amount)}</td>
                      <td className="px-5 py-3"><Badge tone={txnTone[t.status]}>{t.status}</Badge></td>
                      <td className="px-5 py-3 text-slate-500 text-xs">{formatDate(t.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
