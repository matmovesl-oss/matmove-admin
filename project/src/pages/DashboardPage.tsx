import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/AdminLayout';
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import { supabase } from '@/lib/supabase';
import { FileCheck, Wallet, Banknote, Users, ShieldAlert, Clock, TrendingUp, ArrowRight, Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const [stats, setStats] = useState({ pendingKyc: 0, totalBalance: 0, pendingWithdrawals: 0, totalUsers: 0 });
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      try {
        const { data: profiles } = await supabase.from('profiles').select('kyc_status, role');
        const { data: wallets } = await supabase.from('wallets').select('balance').eq('currency', 'SLE');
        const { data: bookings } = await supabase.from('bookings').select('*, rider:rider_id(full_name), driver:driver_id(full_name)').order('created_at', { ascending: false }).limit(5);

        let kyc = 0, users = 0;
        if (profiles) {
          kyc = profiles.filter(p => p.kyc_status === 'pending').length;
          users = profiles.filter(p => ['rider', 'driver', 'merchant'].includes(String(p.role).toLowerCase())).length;
        }

        const bal = wallets ? wallets.reduce((s, w) => s + Number(w.balance || 0), 0) : 0;
        
        setStats({ pendingKyc: kyc, totalBalance: bal, pendingWithdrawals: 0, totalUsers: users });
        if (bookings) setRecentBookings(bookings);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    fetchDashboard();
  }, []);

  const quickLinks = [
    { to: '/kyc', label: 'KYC Approvals', icon: FileCheck, count: stats.pendingKyc, tone: 'amber' as const },
    { to: '/users', label: 'Active Users', icon: Users, count: stats.totalUsers, tone: 'indigo' as const },
    { to: '/pricing', label: 'Platform Pricing', icon: TrendingUp, count: 4, tone: 'emerald' as const },
    { to: '/logs', label: 'Audit Logs', icon: ShieldAlert, count: 'Live', tone: 'indigo' as const },
  ];

  return (
    <AdminLayout title="Compliance Dashboard" subtitle="Executive overview synced with live Supabase data">
      {loading ? (
        <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Pending KYC" value={String(stats.pendingKyc)} icon={Clock} tone="amber" hint="Awaiting review" />
            <StatCard label="Total User Balances" value={`SLE ${stats.totalBalance.toFixed(2)}`} icon={Wallet} tone="indigo" />
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
                <h3 className="font-semibold text-slate-900">Recent Platform Bookings</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {recentBookings.map((b) => (
                  <div key={b.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50">
                    <div>
                      <p className="text-sm font-medium text-slate-900 capitalize">{b.service_type} - {b.rider?.full_name || 'Rider'}</p>
                      <p className="text-xs text-slate-400">Driver: {b.driver?.full_name || 'Unassigned'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">SLE {b.fare_amount}</p>
                      <Badge tone={b.status === 'completed' ? 'emerald' : b.status === 'cancelled' ? 'red' : 'amber'}>{b.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </AdminLayout>
  );
}