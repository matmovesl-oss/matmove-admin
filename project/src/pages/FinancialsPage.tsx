import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Wallet, TrendingUp, Lock, RefreshCw, Loader2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

export function FinancialsPage() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [monimeBalances, setMonimeBalances] = useState<Record<string, number>>({});
  const [stats, setStats] = useState({ totalBalance: 0, activeCount: 0, frozenCount: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchLiveLedgers = async () => {
    setLoading(true);
    try {
      // Fetch ALL wallets bypassing strict case filters
      const { data: localWallets, error } = await supabase.from('wallets').select(`id, is_active, status, metadata, currency, profiles ( full_name, email, role )`).order('created_at', { ascending: false });
      if (error) throw error;

      if (localWallets) {
        const sleWallets = localWallets.filter(w => w.currency === 'SLE');
        setWallets(sleWallets);
        
        let activeCount = 0;
        let frozenCount = 0;

        sleWallets.forEach(w => {
           if (w.status === 'frozen' || w.is_active === false) frozenCount++;
           else activeCount++;
        });

        // Fetch Monime Master Balance
        try {
          const res = await fetch('/api/get-space-balance');
          const data = await res.json();
          if (data.accounts) {
            const trueBalances: Record<string, number> = {};
            data.accounts.forEach((acc: any) => {
              trueBalances[acc.id] = (acc.balance?.available?.value || 0) / 100;
            });
            setMonimeBalances(trueBalances);
            setStats({ totalBalance: data.masterSleBalance || 0, activeCount, frozenCount });
          }
        } catch (apiErr) { console.error(apiErr); }

        // Fetch Monime Transactions
        try {
          const txRes = await fetch('/api/get-all-transactions', { method: 'POST' });
          const txData = await txRes.json();
          if (txData.transactions) setTransactions(txData.transactions);
        } catch (txErr) { console.error(txErr); }
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchLiveLedgers(); }, []);

  const handleToggleFreeze = async (walletId: string, currentStatus: string | null) => {
     const isFrozen = currentStatus === 'frozen';
     const newStatus = isFrozen ? 'active' : 'frozen';
     if (!window.confirm(`Are you sure you want to ${newStatus.toUpperCase()} this wallet?`)) return;

     setBusyId(walletId);
     try {
       const { error } = await supabase.from('wallets').update({ status: newStatus, is_active: isFrozen }).eq('id', walletId);
       if (error) throw error;
       fetchLiveLedgers();
     } catch (err: any) { alert("Failed to update status: " + err.message); } finally { setBusyId(null); }
  };

  return (
    <AdminLayout title="Financial & Wallet Control Center" subtitle="Master Ledger synced with Monime API.">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap mt-6">
        <div><p className="text-sm font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">Live Monime Sync</p></div>
        <button type="button" onClick={fetchLiveLedgers} disabled={loading} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Ledger</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 flex justify-between items-center shadow-sm">
          <div><p className="text-sm font-medium text-slate-500 mb-1">Monime Master Balance</p><h3 className="text-3xl font-bold text-slate-900">{stats.totalBalance.toLocaleString()} SLE</h3></div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Wallet size={24} /></div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 flex justify-between items-center shadow-sm">
          <div><p className="text-sm font-medium text-slate-500 mb-1">Active Wallets</p><h3 className="text-3xl font-bold text-slate-900">{stats.activeCount}</h3></div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><TrendingUp size={24} /></div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 flex justify-between items-center shadow-sm">
          <div><p className="text-sm font-medium text-slate-500 mb-1">Frozen Wallets</p><h3 className="text-3xl font-bold text-slate-900">{stats.frozenCount}</h3></div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl"><Lock size={24} /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900">Unified Customer Wallets</h3>
          </div>
          {loading ? <div className="p-12 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2" /> Syncing with Monime...</div> : (
            <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide sticky top-0 z-10">
                  <tr><th className="text-left px-5 py-3 font-medium">Customer</th><th className="text-left px-5 py-3 font-medium">Account ID</th><th className="text-left px-5 py-3 font-medium">True Balance</th><th className="text-right px-5 py-3 font-medium">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {wallets.map((wallet: any) => {
                    const isFrozen = wallet.status === 'frozen' || wallet.is_active === false;
                    const monimeId = wallet.metadata?.monime_account_id || 'Pending Setup';
                    const trueBalance = monimeBalances[monimeId] !== undefined ? monimeBalances[monimeId] : 0;
                    
                    return (
                      <tr key={wallet.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3"><p className="font-bold text-slate-900">{wallet.profiles?.full_name}</p><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{wallet.profiles?.role}</span></td>
                        <td className="px-5 py-3"><div className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded inline-block border border-slate-200">{monimeId}</div></td>
                        <td className="px-5 py-3"><p className="font-bold text-slate-900">{trueBalance.toLocaleString()} SLE</p></td>
                        <td className="px-5 py-3 text-right">
                          <button type="button" disabled={busyId === wallet.id} onClick={() => handleToggleFreeze(wallet.id, wallet.status)} className={`text-xs font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 ${!isFrozen ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'}`}>
                            {!isFrozen ? <Lock className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />} {busyId === wallet.id ? 'Wait...' : (!isFrozen ? 'Freeze' : 'Unfreeze')}
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
            <h3 className="font-semibold text-slate-900">Monime Transactions</h3>
          </div>
          {loading ? <div className="p-12 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2" /> Fetching ledger...</div> : transactions.length === 0 ? <div className="p-12 text-center text-slate-500">No transactions found.</div> : (
            <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide sticky top-0 z-10">
                  <tr><th className="text-left px-5 py-3 font-medium">Txn ID</th><th className="text-left px-5 py-3 font-medium">Type</th><th className="text-left px-5 py-3 font-medium">Amount</th><th className="text-left px-5 py-3 font-medium">Date</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((tx: any) => {
                    const isCredit = tx.type === 'credit';
                    const amountSLE = (tx.amount?.value || 0) / 100;
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3"><p className="font-mono text-xs text-slate-900">{tx.id}</p><p className="text-[10px] font-mono text-slate-400 mt-0.5">{tx.financialAccount?.id || 'Master'}</p></td>
                        <td className="px-5 py-3"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${isCredit ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>{isCredit ? <ArrowDownLeft size={12}/> : <ArrowUpRight size={12}/>} {tx.type}</span></td>
                        <td className="px-5 py-3"><p className={`font-semibold ${isCredit ? 'text-emerald-600' : 'text-slate-900'}`}>{isCredit ? '+' : '-'} {amountSLE.toLocaleString()} SLE</p></td>
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