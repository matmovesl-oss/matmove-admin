import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/AdminLayout';
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import { supabase } from '@/lib/supabase';
import { FileCheck, Wallet, Banknote, Users, ShieldAlert, Clock, TrendingUp, ArrowRight, Loader2 } from 'lucide-react';
import { formatSLE, timeAgo } from '@/lib/format';

export default function DashboardPage() {
  const [stats, setStats] = useState({ pendingKyc: 0, totalBalance: 0, pendingWithdrawals: 0, pendingValue: 0, totalUsers: 0 });
  const [recentWithdrawals, setRecentWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      try {
        const { data: profiles } = await supabase.from('profiles').select('kyc_status, role');
        const { data: wallets } = await supabase.from('wallets').select('balance').eq('currency', 'SLE');
        const { data: withdrawals } = await supabase.from('withdrawal_requests').select('id, amount, status, created_at, reference_code, profiles(full_name)').order('created_at', { ascending: false });

        let kyc = 0, users = 0;
        if (profiles) {
          kyc = profiles.filter(p => p.kyc_status === 'pending').length;
          users = profiles.filter(p => ['rider', 'driver', 'merchant'].includes(String(p.role).toLowerCase())).length;
        }

        const bal = wallets ? wallets.reduce((s, w) => s + Number(w.balance || 0), 0) : 0;

        let pCount = 0, pVal = 0, recentW: any[] = [];
        if (withdrawals) {
          const pending = withdrawals.filter(w => w.status === 'pending');
          pCount = pending.length;
          pVal = pending.reduce((s, w) => s + Number(w.amount || 0), 0);
          recentW = withdrawals.slice(0, 5);
        }

        setStats({ pendingKyc: kyc, totalBalance: bal, pendingWithdrawals: pCount, pendingValue: pVal, totalUsers: users });
        setRecentWithdrawals(recentW);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    fetchDashboard();
  }, []);

  const quickLinks = [
    { to: '/kyc', label: 'KYC Approvals', icon: FileCheck, count: stats.pendingKyc, tone: 'amber' as const },
    { to: '/wallets', label: 'Wallet Ledger', icon: Wallet, count: stats.totalUsers, tone: 'indigo' as const },
    { to: '/withdrawals', label: 'Pending Payouts', icon: Banknote, count: stats.pendingWithdrawals, tone: 'emerald' as const },
    { to: '/users', label: 'User Directory', icon: Users, count: stats.totalUsers, tone: 'indigo' as const },
  ];

  return (
    <AdminLayout title="Compliance Dashboard" subtitle="Executive overview synced with live Supabase data">
      {loading ? (
        <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Pending KYC" value={String(stats.pendingKyc)} icon={Clock} tone="amber" hint="Awaiting review" />
            <StatCard label="Total System Balance" value={formatSLE(stats.totalBalance)} icon={TrendingUp} tone="indigo" />
            <StatCard label="Pending Payouts" value={formatSLE(stats.pendingValue)} icon={Banknote} tone="emerald" hint={`${stats.pendingWithdrawals} requests`} />
            <StatCard label="Active Users" value={String(stats.totalUsers)} icon={Users} tone="indigo" hint="Riders & Drivers" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {quickLinks.map((q) => {
              const Icon = q.icon;
              return (
                <Link key={q.to} to={q.to} className="group bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${q.tone === 'amber' ? 'bg-amber-50 text-amber-600' : q.tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}><Icon className="w-5 h-5" /></div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-sm text-slate-500">{q.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{q.count}</p>
                </Link>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">Recent Withdrawal Requests</h3>
                <Link to="/withdrawals" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">View all</Link>
              </div>
              <div className="divide-y divide-slate-100">
                {recentWithdrawals.map((w) => (
                  <div key={w.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{w.profiles?.full_name || 'Customer'}</p>
                      <p className="text-xs text-slate-400 font-mono">{w.reference_code || w.id.slice(0,8)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">{formatSLE(w.amount)}</p>
                      <Badge tone={w.status === 'pending' ? 'amber' : w.status === 'completed' ? 'emerald' : 'red'}>{w.status}</Badge>
                    </div>
                  </div>
                ))}
                {recentWithdrawals.length === 0 && <div className="p-6 text-center text-slate-400 text-sm">No recent requests</div>}
              </div>
            </section>
          </div>
        </>
      )}
    </AdminLayout>
  );
}