import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Bell, Clock, TrendingUp, Banknote, AlertOctagon, FileCheck, Wallet, Users, RefreshCw } from 'lucide-react';

export default function ComplianceDashboard() {
  const [stats, setStats] = useState({
    pendingKyc: 0,
    approvedKyc: 0,
    totalBalance: 0,
    pendingPayoutsCount: 0,
    pendingPayoutsValue: 0,
    userCount: 0,
    highRiskAlerts: 0,
  });
  const [recentWithdrawals, setRecentWithdrawals] = useState<any[]>([]);
  const [recentFraudLogs, setRecentFraudLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLiveDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Fetch KYC Counts
      const { count: pendingKycCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('kyc_status', 'pending');

      const { count: approvedKycCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('kyc_status', 'approved');

      const { count: totalUsersCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // 2. Fetch System Balances 
      const { data: walletsData } = await supabase.from('wallets').select('balance');
      const systemBalanceSum = walletsData 
        ? walletsData.reduce((acc, w) => acc + (Number(w.balance) || 0), 0)
        : 0;

      // 3. Fetch Withdrawal Requests
      const { data: payoutsData, count: pendingPayoutsCnt } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .order('created_at', { ascending: false });

      const pendingValue = payoutsData
        ? payoutsData
            .filter((p) => p.status === 'pending')
            .reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
        : 0;

      // 4. Fetch Fraud Logs
      const { data: fraudData } = await supabase
        .from('fraud_logs')
        .select('*')
        .order('created_at', { ascending: false });

      const highRiskTotal = fraudData 
        ? fraudData.filter((f) => f.risk === 'high' || f.risk === 'High Risk').length 
        : 0;

      setStats({
        pendingKyc: pendingKycCount || 0,
        approvedKyc: approvedKycCount || 0,
        totalBalance: systemBalanceSum,
        pendingPayoutsCount: pendingPayoutsCnt || 0,
        pendingPayoutsValue: pendingValue,
        userCount: totalUsersCount || 0,
        highRiskAlerts: highRiskTotal,
      });

      if (payoutsData) setRecentWithdrawals(payoutsData.slice(0, 4));
      if (fraudData) setRecentFraudLogs(fraudData.slice(0, 4));

    } catch (err) {
      console.error("Error fetching live dashboard metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveDashboardData();
  }, []);

  return (
    <div className="flex-1 bg-slate-50 flex flex-col font-sans h-full overflow-y-auto">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compliance Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Executive overview of MatMove platform health</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Search records..." className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-600 outline-none w-64" />
          </div>
          <button 
            onClick={fetchLiveDashboardData}
            className="p-2 text-slate-500 hover:text-slate-700 bg-slate-100 rounded-xl transition flex items-center gap-2 text-xs font-bold"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg flex items-center gap-1.5">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div> Live Supabase Data
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <div className="p-8 max-w-7xl mx-auto w-full space-y-6">

        {/* Primary Metrics Grid */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-500 text-sm font-medium">Pending KYC</span>
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Clock size={18} /></div>
            </div>
            <div>
              <div className="text-3xl font-bold text-slate-900">{stats.pendingKyc}</div>
              <div className="text-xs text-slate-400 mt-1">Awaiting review</div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-500 text-sm font-medium">Total System Balance</span>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><TrendingUp size={18} /></div>
            </div>
            <div>
              <div className="text-3xl font-bold text-slate-900">{stats.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} SLE</div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-500 text-sm font-medium">Pending Payouts</span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Banknote size={18} /></div>
            </div>
            <div>
              <div className="text-3xl font-bold text-slate-900">{stats.pendingPayoutsValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} SLE</div>
              <div className="text-xs text-slate-400 mt-1">{stats.pendingPayoutsCount} requests</div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-500 text-sm font-medium">High-Risk Alerts</span>
              <div className="p-2 bg-red-50 text-red-600 rounded-lg"><AlertOctagon size={18} /></div>
            </div>
            <div>
              <div className="text-3xl font-bold text-slate-900">{stats.highRiskAlerts}</div>
              <div className="text-xs text-slate-400 mt-1">Requires attention</div>
            </div>
          </div>
        </div>

        {/* Secondary Metrics Grid */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
             <div>
               <div className="p-2 bg-slate-50 text-amber-500 rounded-lg w-min mb-3"><FileCheck size={18} /></div>
               <span className="text-slate-500 text-sm font-medium block">KYC Approvals</span>
               <div className="text-2xl font-bold text-slate-900 mt-1">{stats.approvedKyc}</div>
             </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
             <div>
               <div className="p-2 bg-slate-50 text-indigo-500 rounded-lg w-min mb-3"><Wallet size={18} /></div>
               <span className="text-slate-500 text-sm font-medium block">Active Wallets</span>
               <div className="text-2xl font-bold text-slate-900 mt-1">{stats.userCount}</div>
             </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
             <div>
               <div className="p-2 bg-slate-50 text-emerald-500 rounded-lg w-min mb-3"><Banknote size={18} /></div>
               <span className="text-slate-500 text-sm font-medium block">Pending Requests</span>
               <div className="text-2xl font-bold text-slate-900 mt-1">{stats.pendingPayoutsCount}</div>
             </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
             <div>
               <div className="p-2 bg-slate-50 text-indigo-400 rounded-lg w-min mb-3"><Users size={18} /></div>
               <span className="text-slate-500 text-sm font-medium block">User Directory</span>
               <div className="text-2xl font-bold text-slate-900 mt-1">{stats.userCount}</div>
             </div>
          </div>
        </div>

        {/* Live Lists Grid */}
        <div className="grid grid-cols-2 gap-6">
          {/* Withdrawal Requests */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Recent Withdrawal Requests</h3>
              <span className="text-xs text-slate-400 font-medium">Live Feed</span>
            </div>
            <div className="p-2 flex-1">
              {recentWithdrawals.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-sm">No withdrawal requests recorded yet.</div>
              ) : (
                recentWithdrawals.map((w, i) => (
                  <div key={i} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-xl transition cursor-pointer">
                    <div>
                      <div className="font-bold text-sm text-slate-900">{w.user_name || 'Requester'}</div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{w.reference_code || w.id}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm text-slate-900">{Number(w.amount).toFixed(2)} SLE</div>
                      <div className={`text-[10px] uppercase font-bold px-2 py-0.5 inline-block rounded mt-1 ${
                        w.status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                      }`}>
                        {w.status}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Fraud Alerts */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Recent Fraud Alerts</h3>
              <span className="text-xs text-slate-400 font-medium">Live Feed</span>
            </div>
            <div className="p-2 flex-1">
              {recentFraudLogs.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-sm">No fraud activity logged.</div>
              ) : (
                recentFraudLogs.map((a, i) => (
                  <div key={i} className="flex gap-3 items-start p-3 hover:bg-slate-50 rounded-xl transition cursor-pointer">
                    <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${a.risk === 'high' ? 'bg-red-500' : 'bg-amber-500'}`}></div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <div className="font-bold text-sm text-slate-900">{a.user_name || 'System Alert'}</div>
                        <div className="text-xs text-slate-400">{a.created_at ? new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{a.description || a.activity_type}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}