import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Clock, TrendingUp, CreditCard, AlertCircle, FileCheck, Wallet, Users } from 'lucide-react';

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
      // 1. Fetch Profiles (Users + KYC)
      const { data: profiles } = await supabase.from('profiles').select('kyc_status');
      // 2. Fetch Wallets
      const { data: wallets } = await supabase.from('wallets').select('balance, is_active');
      // 3. Fetch Payouts
      const { data: payouts } = await supabase.from('withdrawal_requests').select('amount, status');

      let pendingKycCount = 0;
      let approvedKycCount = 0;
      if (profiles) {
        pendingKycCount = profiles.filter(p => p.kyc_status === 'pending').length;
        approvedKycCount = profiles.filter(p => p.kyc_status === 'approved').length;
      }

      let totalBal = 0;
      let activeW = 0;
      if (wallets) {
        totalBal = wallets.reduce((sum, w) => sum + Number(w.balance || 0), 0);
        activeW = wallets.filter(w => w.is_active !== false).length;
      }

      let pendingPay = 0;
      let pendingPayVal = 0;
      if (payouts) {
        const pendingReqs = payouts.filter(p => p.status === 'pending');
        pendingPay = pendingReqs.length;
        pendingPayVal = pendingReqs.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      }

      setStats({
        pendingKyc: pendingKycCount,
        totalBalance: totalBal,
        pendingPayouts: pendingPay,
        pendingPayoutsValue: pendingPayVal,
        kycApprovals: approvedKycCount,
        activeWallets: activeW,
        userCount: profiles?.length || 0
      });
    } catch (err) {
      console.error("Error fetching dashboard metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveMetrics();
  }, []);

  return (
    <AdminLayout title="Compliance Dashboard" subtitle="Executive overview of MatMove platform health">
      <div className="mb-6 flex justify-end">
        <button onClick={fetchLiveMetrics} className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-xs font-bold border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Live Supabase Data
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