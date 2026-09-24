import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Wallet, TrendingUp, Lock, RefreshCw, Loader2 } from 'lucide-react';

export function FinancialsPage() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalBalance: 0, activeCount: 0, frozenCount: 0 });
  const [loading, setLoading] = useState(true);

  const fetchWallets = async () => {
    setLoading(true);
    try {
      // Exact Supabase query bypassing case filters
      const { data, error } = await supabase
        .from('wallets')
        .select(`id, balance, is_frozen, metadata, created_at, profiles ( full_name, email, phone )`)
        .eq('currency', 'SLE')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        setWallets(data);
        setStats({
          totalBalance: data.reduce((acc, curr) => acc + Number(curr.balance || 0), 0),
          activeCount: data.filter(w => w.is_frozen === false).length,
          frozenCount: data.filter(w => w.is_frozen === true).length
        });
      }
    } catch (err) {
      console.error('Error fetching wallets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWallets(); }, []);

  const handleToggleFreeze = async (walletId: string, currentlyFrozen: boolean) => {
    const newStatus = !currentlyFrozen;
    if (!window.confirm(`Are you sure you want to ${newStatus ? 'FREEZE' : 'UNFREEZE'} this wallet?`)) return;

    try {
      const { error } = await supabase.from('wallets').update({ is_frozen: newStatus }).eq('id', walletId);
      if (error) throw error;
      fetchWallets();
    } catch (err: any) { alert("Failed: " + err.message); }
  };

  return (
    <AdminLayout title="Financial & Wallet Ledger" subtitle="Real-time Supabase wallet balances and statuses">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap mt-6">
        <div><p className="text-sm font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">Live Supabase Sync</p></div>
        <button type="button" onClick={fetchWallets} disabled={loading} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 flex justify-between items-center shadow-sm">
          <div><p className="text-sm font-medium text-slate-500 mb-1">Total User Balance</p><h3 className="text-3xl font-bold text-slate-900">{stats.totalBalance.toLocaleString()} SLE</h3></div>
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

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-900">Customer Wallets</h3>
        </div>
        {loading ? <div className="p-8 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2" /> Syncing with Supabase...</div> : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
              <tr><th className="px-6 py-4">Owner</th><th className="px-6 py-4">Monime Account ID</th><th className="px-6 py-4">Balance</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {wallets.map((w) => {
                const monimeId = w.metadata?.monime_account_id || 'Pending Setup';
                return (
                  <tr key={w.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900">{w.profiles?.full_name || 'Unknown User'}</p>
                      <p className="text-xs text-slate-400">{w.profiles?.phone || w.profiles?.email}</p>
                    </td>
                    <td className="px-6 py-4"><span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">{monimeId}</span></td>
                    <td className="px-6 py-4 font-bold text-slate-900">{Number(w.balance).toLocaleString()} SLE</td>
                    <td className="px-6 py-4">
                      {w.is_frozen === false 
                        ? <span className="bg-emerald-100 text-emerald-800 text-[10px] uppercase font-bold px-2.5 py-1 rounded-full">Active</span> 
                        : <span className="bg-amber-100 text-amber-800 text-[10px] uppercase font-bold px-2.5 py-1 rounded-full">Frozen</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => handleToggleFreeze(w.id, w.is_frozen)} className="text-xs font-bold text-amber-600 flex items-center justify-end gap-1 ml-auto hover:text-amber-800 transition">
                        <Lock size={14} /> {w.is_frozen === false ? 'Freeze Wallet' : 'Unfreeze Wallet'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}