import { useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout'; 
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import Spinner from '@/components/Spinner';
import EmptyState from '@/components/EmptyState';
import { useWallets } from '@/lib/hooks';
import { formatSLE, formatDate } from '@/lib/format';
import type { TxnStatus, TxnType } from '@/lib/types';
import { Wallet, Lock, Unlock, TrendingUp, Snowflake, ArrowDownLeft, ArrowUpRight, Search, RefreshCw, ShieldCheck, Clock3, CircleDollarSign, Banknote, AlertTriangle } from 'lucide-react';

type Currency = 'SLE' | 'USD';
const txnTone: Record<TxnStatus, 'emerald' | 'amber' | 'red'> = { completed: 'emerald', pending: 'amber', failed: 'red' };
const typeTone: Partial<Record<TxnType, 'emerald' | 'amber' | 'red' | 'blue' | 'indigo'>> = { credit: 'emerald', refund: 'emerald', fee: 'amber', payout: 'indigo', debit: 'blue' };
function formatCurrency(amount: number, currency: Currency) { return currency === 'USD' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount || 0)) : formatSLE(Number(amount || 0)); }
function formatNumber(amount: number) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(amount || 0)); }
function normalizeCurrency(value: unknown): Currency { return value === 'USD' ? 'USD' : 'SLE'; }
function getTypeTone(value: unknown) { return (typeTone[value as TxnType] || 'blue'); }

export default function WalletsPage() {
  const { wallets, transactions, loading, error, refetch, toggleFreeze } = useWallets();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [walletSearch, setWalletSearch] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<'all' | Currency>('all');
  const [walletStatusFilter, setWalletStatusFilter] = useState<'all' | 'active' | 'frozen'>('all');
  const [txFilter, setTxFilter] = useState<'all' | TxnStatus>('all');
  const [txCurrencyFilter, setTxCurrencyFilter] = useState<'all' | Currency>('all');
  const [refreshing, setRefreshing] = useState(false);

  const totalSleBalance = useMemo(() => wallets.filter((wallet) => normalizeCurrency(wallet.currency) === 'SLE').reduce((sum, wallet) => sum + Number(wallet.balance || 0), 0), [wallets]);
  const totalUsdBalance = useMemo(() => wallets.filter((wallet) => normalizeCurrency(wallet.currency) === 'USD').reduce((sum, wallet) => sum + Number(wallet.balance || 0), 0), [wallets]);
  const totalSleReserved = useMemo(() => wallets.filter((wallet) => normalizeCurrency(wallet.currency) === 'SLE').reduce((sum, wallet) => sum + Number(wallet.reserved_balance || 0), 0), [wallets]);
  const totalUsdReserved = useMemo(() => wallets.filter((wallet) => normalizeCurrency(wallet.currency) === 'USD').reduce((sum, wallet) => sum + Number(wallet.reserved_balance || 0), 0), [wallets]);
  const totalSleAvailable = useMemo(() => wallets.filter((wallet) => normalizeCurrency(wallet.currency) === 'SLE').reduce((sum, wallet) => sum + Math.max(0, Number(wallet.balance || 0) - Number(wallet.reserved_balance || 0)), 0), [wallets]);
  const totalUsdAvailable = useMemo(() => wallets.filter((wallet) => normalizeCurrency(wallet.currency) === 'USD').reduce((sum, wallet) => sum + Math.max(0, Number(wallet.balance || 0) - Number(wallet.reserved_balance || 0)), 0), [wallets]);
  const activeCount = wallets.filter((wallet) => wallet.is_active).length;
  const frozenCount = wallets.length - activeCount;

  const filteredWallets = useMemo(() => {
    const query = walletSearch.trim().toLowerCase();
    return wallets.filter((wallet) => {
      const currency = normalizeCurrency(wallet.currency);
      const matchesCurrency = currencyFilter === 'all' || currency === currencyFilter;
      const matchesStatus = walletStatusFilter === 'all' || (walletStatusFilter === 'active' && wallet.is_active) || (walletStatusFilter === 'frozen' && !wallet.is_active);
      const monimeId = (wallet as any).monime_account_id || '';
      const searchable = [wallet.owner_name, wallet.phone, wallet.role, wallet.wallet_id, monimeId, currency].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !query || searchable.includes(query);
      return matchesCurrency && matchesStatus && matchesSearch;
    });
  }, [wallets, walletSearch, currencyFilter, walletStatusFilter]);

  const filteredTx = useMemo(() => {
    return transactions.filter((transaction) => {
      const currency = normalizeCurrency(transaction.currency);
      const matchesStatus = txFilter === 'all' || transaction.status === txFilter;
      const matchesCurrency = txCurrencyFilter === 'all' || currency === txCurrencyFilter;
      return matchesStatus && matchesCurrency;
    });
  }, [transactions, txFilter, txCurrencyFilter]);

  const handleRefresh = async () => { setErr(null); setRefreshing(true); try { await refetch(); } catch (e: any) { setErr(e.message || 'Failed to refresh'); } finally { setRefreshing(false); } };
  const handleFreeze = async (walletId: string, currentlyActive: boolean) => { setErr(null); setBusyId(walletId); try { await toggleFreeze(walletId, !currentlyActive); } catch (e: any) { setErr(e.message || 'Failed to update'); } finally { setBusyId(null); } };

  return (
    <AdminLayout title="Financial & Wallet Control Center" subtitle="Master Ledger for Supabase, Monime, and Flot synced balances.">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div><p className="text-sm font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">Synchronized via Monime & Flot Webhooks</p></div>
        <button type="button" onClick={handleRefresh} disabled={refreshing || loading} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh Ledger</button>
      </div>

      {(error || err) && (<div className="mb-5 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200 flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{err || error}</span></div>)}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <StatCard label="SLE Master Balance" value={formatCurrency(totalSleBalance, 'SLE')} icon={Banknote} tone="indigo" />
        <StatCard label="USD Master Balance" value={formatCurrency(totalUsdBalance, 'USD')} icon={CircleDollarSign} tone="emerald" />
        <StatCard label="Available SLE" value={formatCurrency(totalSleAvailable, 'SLE')} icon={TrendingUp} tone="emerald" />
        <StatCard label="Available USD" value={formatCurrency(totalUsdAvailable, 'USD')} icon={TrendingUp} tone="blue" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label="Reserved Payouts (SLE)" value={formatCurrency(totalSleReserved, 'SLE')} icon={Clock3} tone="amber" />
        <StatCard label="Reserved Payouts (USD)" value={formatCurrency(totalUsdReserved, 'USD')} icon={Clock3} tone="amber" />
        <StatCard label="Active Wallets" value={String(activeCount)} icon={TrendingUp} tone="emerald" />
        <StatCard label="Frozen Wallets" value={String(frozenCount)} icon={Snowflake} tone="amber" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div><h3 className="font-semibold text-slate-900">Unified Customer Wallets</h3><p className="text-xs text-slate-500 mt-1">{filteredWallets.length} of {wallets.length} active accounts</p></div>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={walletSearch} onChange={(event) => setWalletSearch(event.target.value)} placeholder="Search customer, phone or Monime ID..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" /></div>
              <div className="flex gap-2">
                <select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value as 'all' | Currency)} className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"><option value="all">All currencies</option><option value="SLE">SLE</option><option value="USD">USD</option></select>
                <select value={walletStatusFilter} onChange={(event) => setWalletStatusFilter(event.target.value as 'all' | 'active' | 'frozen')} className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"><option value="all">All statuses</option><option value="active">Active</option><option value="frozen">Frozen</option></select>
              </div>
            </div>
          </div>
          {loading ? (<Spinner label="Loading master ledger..." />) : filteredWallets.length === 0 ? (<EmptyState icon={Wallet} title="No wallets found" />) : (
            <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium">Customer / Role</th>
                    <th className="text-left px-5 py-3 font-medium">Gateway ID</th>
                    <th className="text-left px-5 py-3 font-medium">Balance</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                    <th className="text-right px-5 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWallets.map((wallet: any) => {
                    const currency = normalizeCurrency(wallet.currency);
                    const balance = Number(wallet.balance || 0);
                    const isBusy = busyId === wallet.wallet_id;
                    const safeId = String(wallet.wallet_id || 'N/A');
                    const monimeId = wallet.monime_account_id || 'Pending Setup';
                    
                    return (
                      <tr key={safeId} className="hover:bg-slate-50">
                        <td className="px-5 py-3 min-w-[220px]">
                          <p className="font-bold text-slate-900">{wallet.owner_name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{wallet.role}</span>
                            <span className="text-[10px] text-slate-300">•</span>
                            <span className="text-[10px] text-slate-500">{wallet.phone || 'No phone'}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                           <div className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded inline-block border border-slate-200">{monimeId}</div>
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-bold text-slate-900">{formatCurrency(balance, currency)}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Wallet: {safeId.slice(0,8)}...</p>
                        </td>
                        <td className="px-5 py-3">{wallet.is_active ? <Badge tone="emerald">Active</Badge> : <Badge tone="amber">Frozen</Badge>}</td>
                        <td className="px-5 py-3 text-right">
                          <button type="button" disabled={isBusy} onClick={() => handleFreeze(safeId, wallet.is_active)} className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50 ${wallet.is_active ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'}`}>
                            {wallet.is_active ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            {isBusy ? 'Updating...' : wallet.is_active ? 'Freeze' : 'Unfreeze'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div><h3 className="font-semibold text-slate-900">Gateway Transactions</h3><p className="text-xs text-slate-500 mt-1">Live Monime, Flot, and internal movements</p></div>
              <div className="flex gap-1.5 flex-wrap">
                {(['all', 'completed', 'pending', 'failed'] as const).map((status) => (
                  <button key={status} type="button" onClick={() => setTxFilter(status)} className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize ${txFilter === status ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{status}</button>
                ))}
              </div>
            </div>
          </div>
          {loading ? (<Spinner label="Loading transactions..." />) : filteredTx.length === 0 ? (<EmptyState icon={ArrowDownLeft} title="No transactions" />) : (
            <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium">Customer</th>
                    <th className="text-left px-5 py-3 font-medium">Source</th>
                    <th className="text-left px-5 py-3 font-medium">Amount</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                    <th className="text-left px-5 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTx.map((transaction) => {
                    const currency = normalizeCurrency(transaction.currency);
                    const safeId = String(transaction.id || 'N/A');
                    const isCredit = transaction.direction === 'in';
                    const isGateway = transaction.description?.toLowerCase().includes('monime') || transaction.description?.toLowerCase().includes('flot');
                    
                    return (
                      <tr key={safeId} className="hover:bg-slate-50">
                        <td className="px-5 py-3 min-w-[160px]">
                           <p className="font-medium text-slate-900">{transaction.owner_name}</p>
                           <p className="text-[10px] font-mono text-slate-400 mt-0.5">{transaction.reference_code || 'No Ref'}</p>
                        </td>
                        <td className="px-5 py-3">
                           <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${isGateway ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-100 text-slate-600'}`}>
                             {isCredit ? <ArrowDownLeft size={12}/> : <ArrowUpRight size={12}/>}
                             {isGateway ? 'Gateway' : isCredit ? 'Internal Credit' : 'Internal Debit'}
                           </span>
                        </td>
                        <td className="px-5 py-3"><p className="font-semibold text-slate-900">{formatCurrency(Number(transaction.amount || 0), currency)}</p></td>
                        <td className="px-5 py-3"><Badge tone={txnTone[transaction.status] || 'amber'}>{transaction.status}</Badge></td>
                        <td className="px-5 py-3 text-slate-500 text-xs whitespace-nowrap">{formatDate(transaction.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}