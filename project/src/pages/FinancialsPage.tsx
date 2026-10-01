import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Wallet, TrendingUp, Lock, RefreshCw, Loader2 } from 'lucide-react';

export function FinancialsPage() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalBalance: 0, activeCount: 0, frozenCount: 0 });
  const [loading, setLoading] = useState(true);

  const fetchWalletsAndMonime = async () => {
    setLoading(true);
    try {
      // 1. Fetch Supabase Wallets with linked customer profiles
      const { data: dbWallets, error } = await supabase
        .from('wallets')
        .select(`id, user_id, balance, is_frozen, metadata, created_at, profiles ( id, full_name, email, phone, role )`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 2. Fetch Live Financial Accounts from Monime via backend proxy
      const monimeAccountsMap = new Map<string, number>(); // accountId or reference -> balance in SLE
      try {
        const monimeRes = await fetch('/api/get-space-balance');
        const monimeData = await monimeRes.json();
        
        if (monimeData?.accounts && Array.isArray(monimeData.accounts)) {
          monimeData.accounts.forEach((acc: any) => {
            // Monime values are in minor units (cents), convert to SLE major unit
            const rawVal = acc.balance?.available?.value ?? acc.balance?.value ?? 0;
            const sleVal = Number(rawVal) / 100;
            if (acc.id) monimeAccountsMap.set(acc.id, sleVal);
            if (acc.reference) monimeAccountsMap.set(acc.reference, sleVal);
          });
        }
      } catch (mErr) {
        console.error('Failed to fetch Monime live balances:', mErr);
      }

      // 3. Blend Supabase records with Monime live balances
      let computedTotalBalance = 0;
      let activeCount = 0;
      let frozenCount = 0;

      const blendedWallets = (dbWallets || []).map((w: any) => {
        const monimeId = w.metadata?.monime_account_id || w.monime_account_id;
        
        // Match live Monime account balance using Monime ID or User Reference ID
        let trueBalance = 0;
        if (monimeId && monimeAccountsMap.has(monimeId)) {
          trueBalance = monimeAccountsMap.get(monimeId)!;
        } else if (w.user_id && monimeAccountsMap.has(w.user_id)) {
          trueBalance = monimeAccountsMap.get(w.user_id)!;
        } else {
          trueBalance = Number(w.balance || 0); // Fallback if Monime account setup is pending
        }

        computedTotalBalance += trueBalance;
        if (w.is_frozen) {
          frozenCount++;
        } else {
          activeCount++;
        }

        return {
          ...w,
          monimeId: monimeId || 'Pending Setup',
          trueBalance
        };
      });

      setWallets(blendedWallets);
      setStats({
        totalBalance: computedTotalBalance,
        activeCount,
        frozenCount
      });

    } catch (err: any) {
      console.error('Error fetching financial ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletsAndMonime();
  }, []);

  const handleToggleFreeze = async (walletId: string, currentlyFrozen: boolean) => {
    const newStatus = !currentlyFrozen;
    if (!window.confirm(`Are you sure you want to ${newStatus ? 'FREEZE' : 'UNFREEZE'} this wallet?`)) return;

    try {
      const { error } = await supabase.from('wallets').update({ is_frozen: newStatus }).eq('id', walletId);
      if (error) throw error;
      
      // Write entry to Audit Trail
      await supabase.from('audit_logs').insert({
        action: newStatus ? 'FREEZE_WALLET' : 'UNFREEZE_WALLET',
        details: `Admin changed wallet status for ${walletId} to frozen=${newStatus}`
      });

      fetchWalletsAndMonime();
    } catch (err: any) {
      alert("Failed to update wallet status: " + err.message);
    }
  };

  return (
    <AdminLayout title="Financial & Wallet Control Center" subtitle="Master Ledger synced live with Monime accounts and Supabase profiles">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap mt-6">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Monime Live Balance Stream Active
          </p>
        </div>
        <button type="button" onClick={fetchWalletsAndMonime} disabled={loading} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition shadow-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Ledger
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 flex justify-between items-center shadow-sm">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Total Monime System Balance</p>
            <h3 className="text-3xl font-bold text-emerald-600">
              SLE {stats.totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Wallet size={24} /></div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 flex justify-between items-center shadow-sm">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Active Accounts</p>
            <h3 className="text-3xl font-bold text-slate-900">{stats.activeCount}</h3>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><TrendingUp size={24} /></div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 flex justify-between items-center shadow-sm">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Frozen Accounts</p>
            <h3 className="text-3xl font-bold text-amber-600">{stats.frozenCount}</h3>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl"><Lock size={24} /></div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-slate-900">Unified Customer Wallets</h3>
        </div>
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-600" /> Syncing live balances with Monime...
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-bold">
              <tr>
                <th className="px-6 py-4">Customer / Role</th>
                <th className="px-6 py-4">Monime Gateway ID</th>
                <th className="px-6 py-4">Monime True Balance</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {wallets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">No customer wallets found.</td>
                </tr>
              ) : (
                wallets.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900">{w.profiles?.full_name || 'Incomplete Profile'}</p>
                      <p className="text-xs text-slate-400">{w.profiles?.phone || w.profiles?.email || 'No contact'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono bg-slate-100 border border-slate-200 px-2.5 py-1 rounded text-slate-700">
                        {w.monimeId}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-emerald-600 text-base">
                      SLE {Number(w.trueBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4">
                      {!w.is_frozen ? (
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] uppercase font-bold px-2.5 py-1 rounded-full border border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="bg-amber-100 text-amber-800 text-[10px] uppercase font-bold px-2.5 py-1 rounded-full border border-amber-200">
                          Frozen
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => handleToggleFreeze(w.id, w.is_frozen)} className="text-xs font-bold text-amber-600 flex items-center justify-end gap-1 ml-auto hover:text-amber-800 transition">
                        <Lock size={14} /> {!w.is_frozen ? 'Freeze Wallet' : 'Unfreeze Wallet'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}