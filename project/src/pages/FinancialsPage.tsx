import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Wallet, TrendingUp, Lock, RefreshCw, Loader2, AlertTriangle, Search, Activity, X } from 'lucide-react';

export function FinancialsPage() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalBalance: 0, activeCount: 0, frozenCount: 0 });
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [search, setSearch] = useState('');

  // Transaction Modal State
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTxns, setLoadingTxns] = useState(false);

  const fetchWalletsAndMonime = async () => {
    setLoading(true);
    setApiError('');
    try {
      const { data: dbWallets, error } = await supabase
        .from('wallets')
        .select(`id, user_id, balance, is_frozen, metadata, created_at, profiles ( id, full_name, email, phone, role )`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const monimeAccountsMap = new Map<string, number>();
      let computedTotalBalance = 0;

      try {
        const monimeRes = await fetch('/api/get-space-balance');
        const monimeData = await monimeRes.json();
        if (!monimeRes.ok) throw new Error(monimeData.error || 'Failed to connect to Monime API');

        if (monimeData?.accounts && Array.isArray(monimeData.accounts)) {
          monimeData.accounts.forEach((acc: any) => {
            const rawVal = acc.balance?.available?.value ?? acc.balance?.value ?? 0;
            const sleVal = Number(rawVal) / 100;
            if (acc.id) monimeAccountsMap.set(acc.id, sleVal);
            if (acc.reference) monimeAccountsMap.set(acc.reference, sleVal);
            computedTotalBalance += sleVal; 
          });
        }
      } catch (mErr: any) {
        setApiError(mErr.message);
      }

      let activeCount = 0;
      let frozenCount = 0;

      const blendedWallets = (dbWallets || []).map((w: any) => {
        const monimeId = w.metadata?.monime_account_id || w.monime_account_id;
        let trueBalance = 0;
        
        if (monimeId && monimeAccountsMap.has(monimeId)) {
          trueBalance = monimeAccountsMap.get(monimeId)!;
        } else if (w.user_id && monimeAccountsMap.has(w.user_id)) {
          trueBalance = monimeAccountsMap.get(w.user_id)!;
        }

        if (w.is_frozen) frozenCount++; else activeCount++;

        return { ...w, monimeId: monimeId || 'Pending Setup', trueBalance };
      });

      setWallets(blendedWallets);
      setStats({ totalBalance: computedTotalBalance, activeCount, frozenCount });
    } catch (err: any) {
      console.error('Error fetching ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWalletsAndMonime(); }, []);

  const handleToggleFreeze = async (walletId: string, currentlyFrozen: boolean) => {
    const newStatus = !currentlyFrozen;
    if (!window.confirm(`Are you sure you want to ${newStatus ? 'FREEZE' : 'UNFREEZE'} this wallet?`)) return;

    try {
      const { error } = await supabase.from('wallets').update({ is_frozen: newStatus }).eq('id', walletId);
      if (error) throw error;
      fetchWalletsAndMonime();
    } catch (err: any) { alert("Failed to update wallet status: " + err.message); }
  };

  const openTransactions = async (wallet: any) => {
    setSelectedAccount(wallet);
    setLoadingTxns(true);
    try {
      const res = await fetch(`/api/get-user-transactions?accountId=${wallet.monimeId}`);
      const data = await res.json();
      if (data.transactions) {
        setTransactions(data.transactions.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else {
        setTransactions([]);
      }
    } catch (err) {
      console.error(err);
      setTransactions([]);
    } finally {
      setLoadingTxns(false);
    }
  };

  const filteredWallets = wallets.filter(w => 
    w.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()) || 
    w.profiles?.phone?.includes(search) || 
    w.monimeId?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout title="Financial & Wallet Control Center" subtitle="Master Ledger synced LIVE with Monime API">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5 mt-6">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search customer or Monime ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-600 outline-none shadow-sm" />
        </div>
        <div className="flex gap-2">
          <p className="text-sm font-bold text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-100 flex items-center gap-1.5 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live Gateway Sync
          </p>
          <button type="button" onClick={fetchWalletsAndMonime} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 transition shadow-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {apiError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-3">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          <div><p className="font-bold text-sm">Monime API Connection Failed</p><p className="text-xs mt-1">{apiError}</p></div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 flex justify-between items-center shadow-sm">
          <div><p className="text-sm font-bold text-slate-500 mb-1 uppercase tracking-wider">Total Monime Ledger</p><h3 className="text-4xl font-bold text-emerald-600">SLE {stats.totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3></div>
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><Wallet size={28} /></div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 flex justify-between items-center shadow-sm">
          <div><p className="text-sm font-bold text-slate-500 mb-1 uppercase tracking-wider">Active Accounts</p><h3 className="text-4xl font-bold text-slate-900">{stats.activeCount}</h3></div>
          <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl"><TrendingUp size={28} /></div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 flex justify-between items-center shadow-sm">
          <div><p className="text-sm font-bold text-slate-500 mb-1 uppercase tracking-wider">Frozen Accounts</p><h3 className="text-4xl font-bold text-amber-600">{stats.frozenCount}</h3></div>
          <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl"><Lock size={28} /></div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50"><h3 className="text-lg font-bold text-slate-900">Unified Customer Wallets</h3></div>
        {loading ? (
          <div className="p-12 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-600" /> Fetching Monime Balances...</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
              <tr><th className="px-6 py-4">Customer</th><th className="px-6 py-4">Monime Gateway ID</th><th className="px-6 py-4">Monime True Balance</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-right">Actions & Controls</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredWallets.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4"><p className="font-bold text-slate-900 text-base">{w.profiles?.full_name || 'Incomplete Profile'}</p><p className="text-xs text-slate-500">{w.profiles?.phone || w.profiles?.email}</p></td>
                  <td className="px-6 py-4"><span className="text-xs font-mono bg-slate-100 border border-slate-200 px-2.5 py-1 rounded text-slate-700">{w.monimeId}</span></td>
                  <td className="px-6 py-4 font-bold text-emerald-600 text-lg">SLE {Number(w.trueBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-6 py-4">
                    {!w.is_frozen ? <span className="bg-emerald-100 text-emerald-800 text-[10px] uppercase font-bold px-3 py-1.5 rounded-lg border border-emerald-200 shadow-sm">Active</span> : <span className="bg-red-100 text-red-800 text-[10px] uppercase font-bold px-3 py-1.5 rounded-lg border border-red-200 shadow-sm">Frozen</span>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openTransactions(w)} className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-2 rounded-lg hover:bg-indigo-100 transition shadow-sm flex items-center gap-1.5"><Activity size={14}/> View Ledger</button>
                      <button onClick={() => handleToggleFreeze(w.id, w.is_frozen)} className={`text-xs font-bold px-3 py-2 rounded-lg border transition shadow-sm flex items-center gap-1.5 ${w.is_frozen ? 'bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-700' : 'bg-red-600 text-white hover:bg-red-700 border-red-700'}`}>
                        <Lock size={14} /> {w.is_frozen ? 'Unfreeze' : 'Freeze Account'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* INDIVIDUAL LEDGER MODAL */}
      {selectedAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Monime Gateway Ledger</h2>
                <p className="text-sm text-slate-500 mt-1">{selectedAccount.profiles?.full_name} · <span className="font-mono">{selectedAccount.monimeId}</span></p>
              </div>
              <button onClick={() => setSelectedAccount(null)} className="p-2 bg-slate-200 rounded-full hover:bg-slate-300 text-slate-600"><X size={20}/></button>
            </div>
            <div className="p-0 overflow-y-auto flex-1">
              {loadingTxns ? (
                <div className="p-12 text-center text-slate-500"><Loader2 className="animate-spin mx-auto mb-2 text-indigo-600" size={32} /> Pulling Individual Ledger...</div>
              ) : transactions.length === 0 ? (
                <div className="p-12 text-center text-slate-400">No gateway transactions recorded for this account.</div>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-bold sticky top-0">
                    <tr><th className="px-6 py-4">Type</th><th className="px-6 py-4">Amount</th><th className="px-6 py-4">Ref</th><th className="px-6 py-4 text-right">Date</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.map((tx: any) => {
                      const amt = (tx.amount?.value || 0) / 100;
                      const isCredit = tx.type === 'credit';
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4"><span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase border ${isCredit ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{tx.type}</span></td>
                          <td className={`px-6 py-4 font-bold text-base ${isCredit ? 'text-emerald-600' : 'text-slate-900'}`}>{isCredit ? '+' : '-'} SLE {amt.toFixed(2)}</td>
                          <td className="px-6 py-4 font-mono text-xs text-slate-400">{tx.reference || tx.id.slice(0, 10)}</td>
                          <td className="px-6 py-4 text-right text-xs text-slate-500">{new Date(tx.timestamp).toLocaleString()}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}