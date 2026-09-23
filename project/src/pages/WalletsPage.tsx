import { useMemo, useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout'; 
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import Spinner from '@/components/Spinner';
import EmptyState from '@/components/EmptyState';
import { supabase } from '@/lib/supabase';
import { Wallet, Lock, Unlock, TrendingUp, Snowflake, ArrowDownLeft, ArrowUpRight, Search, RefreshCw, Banknote, CircleDollarSign, Clock3, AlertTriangle } from 'lucide-react';

type Currency = 'SLE' | 'USD';
function formatCurrency(amount: number, currency: Currency) { return currency === 'USD' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount || 0)) : `${Number(amount || 0).toLocaleString()} SLE`; }

export default function WalletsPage() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [monimeBalances, setMonimeBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [walletSearch, setWalletSearch] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<'all' | Currency>('all');
  const [walletStatusFilter, setWalletStatusFilter] = useState<'all' | 'active' | 'frozen'>('all');
  const [txFilter, setTxFilter] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');

  const fetchLedgers = async () => {
    setErr(null);
    try {
      // 1. Fetch Local Wallets
      const { data: localWallets, error } = await supabase.from('wallets').select(`*, profiles(full_name, phone, role)`).eq('currency', 'SLE');
      if (error) throw error;
      setWallets(localWallets || []);

      // 2. Fetch True Monime Balances
      try {
        const res = await fetch('/api/get-space-balance');
        const data = await res.json();
        if (data.accounts) {
          const balances: Record<string, number> = {};
          data.accounts.forEach((acc: any) => balances[acc.id] = (acc.balance?.available?.value || 0) / 100);
          setMonimeBalances(balances);
        }
      } catch (apiErr) { console.error("Monime balance fetch failed."); }

      // 3. Fetch Monime Transactions
      try {
        const txRes = await fetch('/api/get-all-transactions', { method: 'POST' });
        const txData = await txRes.json();
        if (txData.transactions) setTransactions(txData.transactions);
      } catch (txErr) { console.error("Monime tx fetch failed."); }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchLedgers(); }, []);

  const handleRefresh = () => { setRefreshing(true); fetchLedgers(); };

  const handleFreeze = async (walletId: string, currentlyActive: boolean) => {
    const isFrozen = !currentlyActive;
    const newStatus = isFrozen ? 'active' : 'frozen';
    if (!window.confirm(`Are you sure you want to ${isFrozen ? 'UNFREEZE' : 'FREEZE'} this wallet?`)) return;
    
    setBusyId(walletId);
    try {
      const { error } = await supabase.from('wallets').update({ status: newStatus, is_active: isFrozen }).eq('id', walletId);
      if (error) throw error;
      fetchLedgers();
    } catch (e: any) { alert(e.message); } finally { setBusyId(null); }
  };

  // Calculations
  const activeCount = wallets.filter(w => w.status !== 'frozen').length;
  const frozenCount = wallets.filter(w => w.status === 'frozen').length;
  const totalSleBalance = Object.values(monimeBalances).reduce((sum, val) => sum + val, 0) || wallets.reduce((sum, w) => sum + Number(w.balance || 0), 0);

  const filteredWallets = useMemo(() => {
    const query = walletSearch.toLowerCase();
    return wallets.filter((wallet) => {
      const isFrozen = wallet.status === 'frozen';
      const matchesStatus = walletStatusFilter === 'all' || (walletStatusFilter === 'active' && !isFrozen) || (walletStatusFilter === 'frozen' && isFrozen);
      const monimeId = wallet.metadata?.monime_account_id || '';
      const searchable = `${wallet.profiles?.full_name} ${wallet.profiles?.phone} ${monimeId}`.toLowerCase();
      const matchesSearch = !query || searchable.includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [wallets, walletSearch, walletStatusFilter]);

  const filteredTx = useMemo(() => {
    return transactions.filter(tx => txFilter === 'all' || tx.status === txFilter);
  }, [transactions, txFilter]);

  return (
    <AdminLayout title="Financial & Wallet Control Center" subtitle="Master Ledger for Supabase and Monime synced balances.">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div><p className="text-sm font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">Synchronized via Monime Webhooks</p></div>
        <button onClick={handleRefresh} disabled={refreshing || loading} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh Ledger</button>
      </div>

      {err && (<div className="mb-5 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200 flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{err}</span></div>)}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <StatCard label="SLE Master Balance" value={formatCurrency(totalSleBalance, 'SLE')} icon={Banknote} tone="indigo" />
        <StatCard label="USD Master Balance" value="$0.00" icon={CircleDollarSign} tone="emerald" />
        <StatCard label="Available SLE" value={formatCurrency(totalSleBalance, 'SLE')} icon={TrendingUp} tone="emerald" />
        <StatCard label="Available USD" value="$0.00" icon={TrendingUp} tone="blue" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label="Reserved Payouts (SLE)" value="0.00 SLE" icon={Clock3} tone="amber" />
        <StatCard label="Reserved Payouts (USD)" value="$0.00" icon={Clock3} tone="amber" />
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
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={walletSearch} onChange={(e) => setWalletSearch(e.target.value)} placeholder="Search customer, phone or Monime ID..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" /></div>
              <div className="flex gap-2">
                <select value={walletStatusFilter} onChange={(e) => setWalletStatusFilter(e.target.value as any)} className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"><option value="all">All statuses</option><option value="active">Active</option><option value="frozen">Frozen</option></select>
              </div>
            </div>
          </div>
          {loading ? (<Spinner label="Loading master ledger..." />) : filteredWallets.length === 0 ? (<EmptyState icon={Wallet} title="No wallets found" />) : (
            <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide sticky top-0 z-10">
                  <tr><th className="text-left px-5 py-3 font-medium">Customer / Role</th><th className="text-left px-5 py-3 font-medium">Gateway ID</th><th className="text-left px-5 py-3 font-medium">True Balance</th><th className="text-left px-5 py-3 font-medium">Status</th><th className="text-right px-5 py-3 font-medium">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWallets.map((wallet: any) => {
                    const monimeId = wallet.metadata?.monime_account_id || 'Pending Setup';
                    const trueBalance = monimeBalances[monimeId] !== undefined ? monimeBalances[monimeId] : Number(wallet.balance || 0);
                    const isFrozen = wallet.status === 'frozen';
                    const isBusy = busyId === wallet.id;

                    return (
                      <tr key={wallet.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 min-w-[220px]">
                          <p className="font-bold text-slate-900">{wallet.profiles?.full_name || 'Unknown'}</p>
                          <div className="flex items-center gap-2 mt-1"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{wallet.profiles?.role}</span><span className="text-[10px] text-slate-500">• {wallet.profiles?.phone || 'No phone'}</span></div>
                        </td>
                        <td className="px-5 py-3"><div className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded inline-block border border-slate-200">{monimeId}</div></td>
                        <td className="px-5 py-3"><p className="font-bold text-slate-900">{formatCurrency(trueBalance, 'SLE')}</p></td>
                        <td className="px-5 py-3">{!isFrozen ? <Badge tone="emerald">Active</Badge> : <Badge tone="amber">Frozen</Badge>}</td>
                        <td className="px-5 py-3 text-right">
                          <button disabled={isBusy} onClick={() => handleFreeze(wallet.id, !isFrozen)} className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50 ${!isFrozen ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'}`}>
                            {!isFrozen ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />} {isBusy ? 'Wait...' : !isFrozen ? 'Freeze' : 'Unfreeze'}
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
              <div><h3 className="font-semibold text-slate-900">Gateway Transactions</h3><p className="text-xs text-slate-500 mt-1">Live Monime internal movements</p></div>
              <div className="flex gap-1.5 flex-wrap">
                {['all', 'completed', 'pending', 'failed'].map((s) => (
                  <button key={s} onClick={() => setTxFilter(s as any)} className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize ${txFilter === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{s}</button>
                ))}
              </div>
            </div>
          </div>
          {loading ? (<Spinner label="Loading transactions..." />) : filteredTx.length === 0 ? (<EmptyState icon={ArrowDownLeft} title="No transactions" />) : (
            <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide sticky top-0 z-10">
                  <tr><th className="text-left px-5 py-3 font-medium">Txn ID</th><th className="text-left px-5 py-3 font-medium">Type</th><th className="text-left px-5 py-3 font-medium">Amount</th><th className="text-left px-5 py-3 font-medium">Date</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTx.map((tx) => {
                    const isCredit = tx.type === 'credit';
                    const amountSLE = (tx.amount?.value || 0) / 100;
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 min-w-[160px]"><p className="font-mono text-xs text-slate-900">{tx.id}</p><p className="text-[10px] font-mono text-slate-400 mt-0.5">{tx.financialAccount?.id || 'Master'}</p></td>
                        <td className="px-5 py-3"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${isCredit ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>{isCredit ? <ArrowDownLeft size={12}/> : <ArrowUpRight size={12}/>} {tx.type}</span></td>
                        <td className="px-5 py-3"><p className={`font-semibold ${isCredit ? 'text-emerald-600' : 'text-slate-900'}`}>{isCredit ? '+' : '-'} {formatCurrency(amountSLE, 'SLE')}</p></td>
                        <td className="px-5 py-3 text-slate-500 text-xs whitespace-nowrap">{new Date(tx.timestamp).toLocaleString()}</td>
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