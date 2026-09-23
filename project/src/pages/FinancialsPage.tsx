import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Wallet, TrendingUp, Lock, RefreshCw, Loader2, Search, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import Badge from '@/components/Badge';

export function FinancialsPage() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalBalance: 0, activeCount: 0, frozenCount: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchLiveLedgers = async () => {
    setLoading(true);
    try {
      // 1. Fetch Wallets from Supabase (for owner info and freeze status)
      const { data: localWallets, error } = await supabase
        .from('wallets')
        .select(`id, balance, is_active, status, metadata, profiles ( full_name, email, phone, role )`)
        .eq('currency', 'SLE')
        .order('balance', { ascending: false });

      if (error) throw error;

      if (localWallets) {
        setWallets(localWallets);
        
        // 2. Fetch True Master Balance from our new Monime API route
        try {
           const res = await fetch('/api/get-space-balance');
           const data = await res.json();
           if (data.masterSleBalance !== undefined) {
             setStats({ 
               totalBalance: data.masterSleBalance, 
               activeCount: data.activeWalletsCount, 
               frozenCount: data.frozenWalletsCount 
             });
           }
        } catch (apiErr) {
           console.error("Monime true sync failed, falling back to local");
           setStats({
             totalBalance: localWallets.reduce((acc, curr) => acc + Number(curr.balance), 0),
             activeCount: localWallets.filter(w => w.status !== 'frozen').length,
             frozenCount: localWallets.filter(w => w.status === 'frozen').length
           });
        }

        // 3. Fetch All Gateway Transactions
        try {
           const txRes = await fetch('/api/get-all-transactions', { method: 'POST' });
           const txData = await txRes.json();
           if (txData.transactions) setTransactions(txData.transactions);
        } catch (txErr) {
           console.error("Failed to load gateway transactions");
        }
      }
    } catch (err) {
      console.error('Error fetching ledgers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLiveLedgers(); }, []);

  const handleToggleFreeze = async (walletId: string, currentStatus: string | null) => {
     const isFrozen = currentStatus === 'frozen';
     const newStatus = isFrozen ? 'active' : 'frozen';
     const confirmMsg = isFrozen ? 'Are you sure you want to unfreeze this wallet?' : 'Are you sure you want to FREEZE this wallet? The user will not be able to load, payout, or transfer.';
     
     if (!window.confirm(confirmMsg)) return;

     setBusyId(walletId);
     try {
       const { error } = await supabase.from('wallets').update({ status: newStatus, is_active: isFrozen }).eq('id', walletId);
       if (error) throw error;
       alert(`Wallet successfully ${newStatus}!`);
       fetchLiveLedgers();
     } catch (err: any) {
       alert("Failed to update wallet status: " + err.message);
     } finally {
       setBusyId(null);
     }
  };

  return (
    <AdminLayout title="Financial & Wallet Control Center" subtitle="Master Ledger for Supabase, Monime, and Flot synced balances.">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap mt-6">
        <div><p className="text-sm font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">Synchronized via Monime & Flot Webhooks</p></div>
        <button type="button" onClick={fetchLiveLedgers} disabled={loading} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Ledger</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 mt-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 flex justify-between items-center shadow-sm">
          <div><p className="text-sm font-medium text-slate-500 mb-1">True Master SLE Balance</p><h3 className="text-3xl font-bold text-slate-900">{stats.totalBalance.toLocaleString()} SLE</h3></div>
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
            <p className="text-xs text-slate-500 mt-1">{stats.activeCount} of {wallets.length} active accounts</p>
          </div>
          {loading ? <div className="p-12 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2" /> Syncing with Monime...</div> : (
            <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide sticky top-0 z-10">
                  <tr><th className="text-left px-5 py-3 font-medium">Customer / Role</th><th className="text-left px-5 py-3 font-medium">Gateway ID</th><th className="text-left px-5 py-3 font-medium">Balance</th><th className="text-left px-5 py-3 font-medium">Status</th><th className="text-right px-5 py-3 font-medium">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {wallets.map((wallet: any) => {
                    const isFrozen = wallet.status === 'frozen' || wallet.is_active === false;
                    const isBusy = busyId === wallet.id;
                    const monimeId = wallet.metadata?.monime_account_id || 'Pending Setup';
                    
                    return (
                      <tr key={wallet.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 min-w-[220px]">
                          <p className="font-bold text-slate-900">{wallet.profiles?.full_name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{wallet.profiles?.role}</span>
                            <span className="text-[10px] text-slate-300">•</span>
                            <span className="text-[10px] text-slate-500">{wallet.profiles?.phone || 'No phone'}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3"><div className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded inline-block border border-slate-200">{monimeId}</div></td>
                        <td className="px-5 py-3">
                          <p className="font-bold text-slate-900">{Number(wallet.balance).toLocaleString()} SLE</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Wallet: {wallet.id.slice(0,8)}...</p>
                        </td>
                        <td className="px-5 py-3">{!isFrozen ? <Badge tone="emerald">Active</Badge> : <Badge tone="amber">Frozen</Badge>}</td>
                        <td className="px-5 py-3 text-right">
                          <button type="button" disabled={isBusy} onClick={() => handleToggleFreeze(wallet.id, wallet.status)} className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50 ${!isFrozen ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'}`}>
                            {!isFrozen ? <Lock className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                            {isBusy ? 'Updating...' : !isFrozen ? 'Freeze' : 'Unfreeze'}
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
            <h3 className="font-semibold text-slate-900">Gateway Transactions</h3>
            <p className="text-xs text-slate-500 mt-1">Live Monime, Flot, and internal movements</p>
          </div>
          {loading ? <div className="p-12 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2" /> Loading ledger...</div> : transactions.length === 0 ? <div className="p-12 text-center text-slate-500">No transactions found.</div> : (
            <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium">Txn ID</th>
                    <th className="text-left px-5 py-3 font-medium">Type</th>
                    <th className="text-left px-5 py-3 font-medium">Amount</th>
                    <th className="text-left px-5 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((tx: any) => {
                    const isCredit = tx.type === 'credit';
                    const amountSLE = (tx.amount?.value || 0) / 100;
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 min-w-[160px]">
                           <p className="font-mono text-xs text-slate-900">{tx.id}</p>
                           <p className="text-[10px] font-mono text-slate-400 mt-0.5">Acc: {tx.financialAccount?.id || 'Master'}</p>
                        </td>
                        <td className="px-5 py-3">
                           <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${isCredit ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                             {isCredit ? <ArrowDownLeft size={12}/> : <ArrowUpRight size={12}/>}
                             {tx.type}
                           </span>
                        </td>
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