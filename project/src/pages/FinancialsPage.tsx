import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Wallet, TrendingUp, Lock } from 'lucide-react';

export function FinancialsPage() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalBalance: 0, activeCount: 0, frozenCount: 0 });
  const [loading, setLoading] = useState(true);

  const fetchLiveWallets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('wallets')
        .select(`id, balance, is_active, profiles ( full_name, email )`)
        .order('balance', { ascending: false });

      if (error) throw error;

      if (data) {
        setWallets(data);
        setStats({
          totalBalance: data.reduce((acc, curr) => acc + Number(curr.balance), 0),
          activeCount: data.filter(w => w.is_active !== false).length,
          frozenCount: data.filter(w => w.is_active === false).length
        });
      }
    } catch (err) {
      console.error('Error fetching wallets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLiveWallets(); }, []);

  return (
    <AdminLayout title="Financial & Wallet Ledger" subtitle="System-wide balances, transactions, and wallet controls">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 mt-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 flex justify-between items-center shadow-sm">
          <div><p className="text-sm font-medium text-slate-500 mb-1">Total System Balance</p><h3 className="text-3xl font-bold text-slate-900">{stats.totalBalance.toLocaleString()} SLE</h3></div>
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
          <button onClick={fetchLiveWallets} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">Refresh Data</button>
        </div>
        {loading ? <div className="p-8 text-center text-slate-500">Loading secure financial data...</div> : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
              <tr><th className="px-6 py-4">Owner</th><th className="px-6 py-4">Balance</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {wallets.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4"><p className="font-bold text-slate-900">{w.profiles?.full_name}</p><p className="text-xs text-slate-400">{w.profiles?.email}</p></td>
                  <td className="px-6 py-4 font-bold text-slate-900">{Number(w.balance).toLocaleString()} SLE</td>
                  <td className="px-6 py-4">{w.is_active !== false ? <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full">ACTIVE</span> : <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full">FROZEN</span>}</td>
                  <td className="px-6 py-4 text-right"><button className="text-xs font-bold text-amber-600 flex items-center justify-end gap-1 ml-auto"><Lock size={14} /> {w.is_active !== false ? 'Freeze' : 'Unfreeze'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}