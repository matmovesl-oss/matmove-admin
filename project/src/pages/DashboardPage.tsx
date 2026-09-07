import { Link } from 'react-router-dom';
import AdminLayout from '@/components/AdminLayout';
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import {
  FileCheck, Wallet, Banknote, Users, ShieldAlert,
  Clock, TrendingUp, ArrowRight,
} from 'lucide-react';
import { formatSLE, timeAgo } from '@/lib/format';
import {
  mockKycQueue, mockWallets, mockWithdrawals, mockFraudLogs,
} from '@/lib/mockData';

export default function DashboardPage() {
  const pendingKyc = mockKycQueue.filter((k) => k.kyc_status === 'pending').length;
  const totalBalance = mockWallets.reduce((s, w) => s + w.balance, 0);
  const pendingWithdrawals = mockWithdrawals.filter((w) => w.status === 'pending');
  const pendingValue = pendingWithdrawals.reduce((s, w) => s + w.amount, 0);
  const highRisk = mockFraudLogs.filter((f) => f.risk_level === 'high');

  const quickLinks = [
    { to: '/kyc', label: 'KYC Approvals', icon: FileCheck, count: pendingKyc, tone: 'amber' as const },
    { to: '/wallets', label: 'Wallet Ledger', icon: Wallet, count: mockWallets.length, tone: 'indigo' as const },
    { to: '/withdrawals', label: 'Pending Payouts', icon: Banknote, count: pendingWithdrawals.length, tone: 'emerald' as const },
    { to: '/users', label: 'User Directory', icon: Users, count: mockKycQueue.length, tone: 'indigo' as const },
  ];

  return (
    <AdminLayout
      title="Compliance Dashboard"
      subtitle="Executive overview of MatMove platform health"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Pending KYC" value={String(pendingKyc)} icon={Clock} tone="amber" hint="Awaiting review" />
        <StatCard label="Total System Balance" value={formatSLE(totalBalance)} icon={TrendingUp} tone="indigo" />
        <StatCard label="Pending Payouts" value={formatSLE(pendingValue)} icon={Banknote} tone="emerald" hint={`${pendingWithdrawals.length} requests`} />
        <StatCard label="High-Risk Alerts" value={String(highRisk.length)} icon={ShieldAlert} tone="amber" hint="Requires attention" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {quickLinks.map((q) => {
          const Icon = q.icon;
          return (
            <Link
              key={q.to}
              to={q.to}
              className="group bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  q.tone === 'amber' ? 'bg-amber-50 text-amber-600' : q.tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
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
            {mockWithdrawals.slice(0, 5).map((w) => (
              <div key={w.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-900">{w.requester_name}</p>
                  <p className="text-xs text-slate-400 font-mono">{w.vult_reference}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">{formatSLE(w.amount)}</p>
                  <Badge tone={w.status === 'pending' ? 'amber' : w.status === 'completed' ? 'emerald' : 'red'}>{w.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Recent Fraud Alerts</h3>
            <Link to="/audit" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">View all</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {mockFraudLogs.slice(0, 5).map((f) => (
              <div key={f.id} className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50">
                <div className={`mt-1.5 w-2 h-2 rounded-full ${
                  f.risk_level === 'high' ? 'bg-red-500' : f.risk_level === 'medium' ? 'bg-amber-500' : 'bg-slate-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{f.actor_name}</p>
                  <p className="text-xs text-slate-500 truncate">{f.activity_type}</p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{timeAgo(f.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
