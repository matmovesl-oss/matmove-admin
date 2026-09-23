import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Clock, TrendingUp, CreditCard, AlertCircle, FileCheck, Wallet, Users, Loader2 } from 'lucide-react';

export function ComplianceDashboard() {
  const [stats, setStats] = useState({
    pendingKyc: 0,
    totalBalance: 0,
    pendingPayouts: 0,
    pendingPayoutsValue: 0,
    kycApprovals: 0,
    activeWallets: 0,
    userCount: 0
  });
  const [loading, setLoading] = useState(true);

  const fetchLiveMetrics = async () => {
    setLoading(true);
    try {
      // 1. Fetch Local Profiles & Wallets
      const { data: profiles } = await supabase.from('profiles').select('kyc_status, role');
      const { data: wallets } = await supabase.from('wallets').select('balance, is_active').eq('currency', 'SLE');

      let pendingKycCount = 0;
      let approvedKycCount = 0;
      let users = 0;

      if (profiles) {
        pendingKycCount = profiles.filter(p => p.kyc_status === 'pending' && ['driver', 'merchant'].includes(String(p.role).toLowerCase())).length;
        approvedKycCount = profiles.filter(p => p.kyc_status === 'approved' && ['driver', 'merchant'].includes(String(p.role).toLowerCase())).length;
        users = profiles.filter(p => ['rider', 'driver', 'merchant'].includes(String(p.role).toLowerCase())).length;
      }

      let activeW = wallets ? wallets.filter(w => w.is_active !== false).length : 0;
      let localFallbackBal = wallets ? wallets.reduce((sum, w) => sum + Number(w.balance || 0), 0) : 0;

      // 2. Fetch True Monime Data
      let monimeTotalBal = localFallbackBal;
      let pendingPayCount = 0;
      let pendingPayVal = 0;

      try {
        const balRes = await fetch('/api/get-space-balance');
        const balData = await balRes.json();
        if (balData.masterSleBalance !== undefined) monimeTotalBal = balData.masterSleBalance;
      } catch (e) { console.error("Monime balance fetch failed"); }

      try {
        const payRes = await fetch('/api/get-payouts');
        const payData = await payRes.json();
        if (payData.payouts) {
          const pendingReqs = payData.payouts.filter((p:any) => p.status === 'pending' || p.status === 'processing');
          pendingPayCount = pendingReqs.length;
          pendingPayVal = pendingReqs.reduce((sum:number, p:any) => sum + (p.amount?.value || 0), 0) / 100;
        }
      } catch (e) { console.error("Monime payout fetch failed"); }

      setStats({
        pendingKyc: pendingKycCount,
        totalBalance: monimeTotalBal,
        pendingPayouts: pendingPayCount,
        pendingPayoutsValue: pendingPayVal,
        kycApprovals: approvedKycCount,
        activeWallets: activeW,
        userCount: users
      });
    } catch (err) {
      console.error("Error fetching dashboard metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLiveMetrics(); }, []);

  return (
    <AdminLayout title="Compliance Dashboard" subtitle="Executive overview of MatMove platform health">
      <div className="mb-6 flex justify-end mt-6">
        <button onClick={fetchLiveMetrics} className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-xs font-bold border border-emerald-200 hover:bg-emerald-100 transition">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
          Live Monime Data
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="text-slate-500 text-sm font-medium">Pending KYC</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Clock size={18} /></div>
          </div>
          <div className="text-4xl font-bold text-slate-900">{loading ? '-' : stats.pendingKyc}</div>
          <span className="text-xs text-slate-400 mt-2 block">Awaiting review</span>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="text-slate-500 text-sm font-medium">Total System Balance</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><TrendingUp size={18} /></div>
          </div>
          <div className="text-4xl font-bold text-slate-900">{loading ? '-' : stats.totalBalance.toLocaleString()} SLE</div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="text-slate-500 text-sm font-medium">Pending Payouts</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><CreditCard size={18} /></div>
          </div>
          <div className="text-4xl font-bold text-slate-900">{loading ? '-' : stats.pendingPayoutsValue.toLocaleString()} SLE</div>
          <span className="text-xs text-slate-400 mt-2 block">{stats.pendingPayouts} requests</span>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="text-slate-500 text-sm font-medium">High-Risk Alerts</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg"><AlertCircle size={18} /></div>
          </div>
          <div className="text-4xl font-bold text-slate-900">0</div>
          <span className="text-xs text-slate-400 mt-2 block">Requires attention</span>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="text-slate-500 text-sm font-medium">KYC Approvals</span>
            <div className="p-2 bg-slate-50 text-slate-600 rounded-lg"><FileCheck size={18} /></div>
          </div>
          <div className="text-3xl font-bold text-slate-900">{loading ? '-' : stats.kycApprovals}</div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="text-slate-500 text-sm font-medium">Active Wallets</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Wallet size={18} /></div>
          </div>
          <div className="text-3xl font-bold text-slate-900">{loading ? '-' : stats.activeWallets}</div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="text-slate-500 text-sm font-medium">Pending Requests</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><CreditCard size={18} /></div>
          </div>
          <div className="text-3xl font-bold text-slate-900">{loading ? '-' : stats.pendingPayouts}</div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="text-slate-500 text-sm font-medium">User Directory</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Users size={18} /></div>
          </div>
          <div className="text-3xl font-bold text-slate-900">{loading ? '-' : stats.userCount}</div>
        </div>
      </div>
    </AdminLayout>
  );
}