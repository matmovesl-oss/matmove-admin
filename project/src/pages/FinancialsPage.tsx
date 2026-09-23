import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Wallet, TrendingUp, Lock, RefreshCw, Loader2 } from 'lucide-react';

export function FinancialsPage() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalBalance: 0, activeCount: 0, frozenCount: 0 });
  const [loading, setLoading] = useState(true);

  // Directly fetch true data from Monime + Supabase
  const fetchLiveWallets = async () => {
    setLoading(true);
    try {
      // 1. Fetch Wallets from Supabase to get user info and freeze status
      const { data: localWallets, error } = await supabase
        .from('wallets')
        .select(`id, balance, is_active, status, metadata, profiles ( full_name, email )`)
        .eq('currency', 'SLE')
        .order('balance', { ascending: false });

      if (error) throw error;

      // 2. Fetch True Master Balance from Monime
      let monimeMasterBalance = 0;
      let activeCount = 0;
      let frozenCount = 0;

      if (localWallets) {
        // Optimistically calculate local stats first
        localWallets.forEach(w => {
           if (w.status === 'frozen' || w.is_active === false) frozenCount++;
           else activeCount++;
        });

        setWallets(localWallets);

        // Attempt direct Monime fetch to sum up absolute true balances
        try {
           const res = await fetch('https://api.monime.io/v1/financial-accounts?withBalance=true&limit=100', {
             method: 'GET',
             headers: {
               'Authorization': `Bearer ${import.meta.env.VITE_MONIME_API_KEY}`,
               'Monime-Space-Id': import.meta.env.VITE_MONIME_SPACE_ID,
               'Monime-Version': 'caph.2025-08-23'
             }
           });
           const monimeData = await res.json();
           const accounts = monimeData.result?.items || monimeData.result || [];
           
           accounts.forEach((acc: any) => {
              if (acc.balance?.available?.value) monimeMasterBalance += acc.balance.available.value;
           });
           
           setStats({ 
             totalBalance: monimeMasterBalance / 100, 
             activeCount, 
             frozenCount 
           });
        } catch (monimeErr) {
           console.error("Monime true sync failed, falling back to local calculation");
           setStats({
             totalBalance: localWallets.reduce((acc, curr) => acc + Number(curr.balance), 0),
             activeCount,
             frozenCount
           });
        }
      }
    } catch (err) {
      console.error('Error fetching wallets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLiveWallets(); }, []);

  const handleToggleFreeze = async (walletId: string, currentStatus: string | null) => {
     const isFrozen = currentStatus === 'frozen';
     const newStatus = isFrozen ? 'active' : 'frozen';
     const confirmMsg = isFrozen ? 'Are you sure you want to unfreeze this wallet?' : 'Are you sure you want to FREEZE this wallet? The user will not be able to load, payout, or transfer.';
     
     if (!window.confirm(confirmMsg)) return;

     try {
       const { error } = await supabase.from('wallets').update({ status: newStatus, is_active: isFrozen }).eq('id', walletId);
       if (error) throw error;
       alert(`Wallet successfully ${newStatus}!`);
       fetchLiveWallets();
     } catch (err: any) {
       alert("Failed to update wallet status: " + err.message);
     }
  };

  return (
    <AdminLayout title="Financial & Wallet Ledger" subtitle="System-wide balances, transactions, and wallet controls">
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

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-900">Live User Wallets</h3>
          <button onClick={fetchLiveWallets} className="text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition">
             {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh Data
          </button>
        </div>
        {loading ? <div className="p-12 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2" /> Syncing with Monime Ledger...</div> : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
              <tr><th className="px-6 py-4">Owner</th><th className="px-6 py-4">Gateway ID</th><th className="px-6 py-4">Balance</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {wallets.map((w) => {
                 const isFrozen = w.status === 'frozen' || w.is_active === false;
                 return (
                  <tr key={w.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4"><p className="font-bold text-slate-900">{w.profiles?.full_name}</p><p className="text-xs text-slate-400">{w.profiles?.email}</p></td>
                    <td className="px-6 py-4"><span className="font-mono text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-600">{w.metadata?.monime_account_id || 'N/A'}</span></td>
                    <td className="px-6 py-4 font-bold text-slate-900">{Number(w.balance).toLocaleString()} SLE</td>
                    <td className="px-6 py-4">{!isFrozen ? <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full">ACTIVE</span> : <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full shadow-sm">FROZEN</span>}</td>
                    <td className="px-6 py-4 text-right">
                       <button onClick={() => handleToggleFreeze(w.id, w.status)} className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center justify-end gap-1.5 ml-auto transition ${!isFrozen ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                          <Lock size={14} /> {!isFrozen ? 'Freeze Wallet' : 'Unfreeze Wallet'}
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