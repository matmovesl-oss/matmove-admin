import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/components/AdminLayout';
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import { Banknote, Clock, CheckCircle2, XCircle, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';

export function PayoutsPage() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'failed'>('all');

  const fetchRealPayouts = async () => {
    setLoading(true);
    setApiError('');
    try {
      const res = await fetch('/api/get-payouts');
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to connect to Monime API');

      if (data.payouts && Array.isArray(data.payouts)) {
        setPayouts(data.payouts.sort((a: any, b: any) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime()));
      }
    } catch (err: any) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRealPayouts(); }, []);

  const stats = useMemo(() => {
    let pending = 0, completed = 0, failed = 0, pendingSle = 0;
    payouts.forEach(p => {
      const amt = (p.amount?.value || 0) / 100;
      if (p.status === 'pending' || p.status === 'processing') { pending++; pendingSle += amt; }
      else if (p.status === 'completed') completed++;
      else if (p.status === 'failed') failed++;
    });
    return { pending, completed, failed, pendingSle };
  }, [payouts]);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return payouts;
    if (filter === 'pending') return payouts.filter(p => p.status === 'pending' || p.status === 'processing');
    return payouts.filter(p => p.status === filter);
  }, [payouts, filter]);

  return (
    <AdminLayout title="Payouts & Withdrawals" subtitle="Live payout status directly from Monime Gateway">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6 mt-6">
        <StatCard label="Pending Requests" value={String(stats.pending)} icon={Clock} tone="amber" />
        <StatCard label="Pending SLE" value={`SLE ${stats.pendingSle.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} icon={Banknote} tone="indigo" />
        <StatCard label="Completed" value={String(stats.completed)} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Failed" value={String(stats.failed)} icon={XCircle} tone="red" />
      </div>

      <div className="mb-4 bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex justify-between items-center">
        <div className="flex gap-2">
          {(['all', 'pending', 'completed', 'failed'] as const).map(tab => (
            <button key={tab} onClick={() => setFilter(tab)} className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition ${filter === tab ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {tab}
            </button>
          ))}
        </div>
        <button onClick={fetchRealPayouts} disabled={loading} className="flex items-center gap-2 px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14} />} Refresh Live
        </button>
      </div>

      {apiError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-3">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          <div><p className="font-bold text-sm">Monime API Connection Failed</p><p className="text-xs mt-1">{apiError}</p></div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-600" /> Fetching from Monime...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-500"><Banknote size={40} className="mx-auto mb-3 text-slate-300"/> No payouts found.</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
              <tr><th className="px-6 py-4">Transaction ID</th><th className="px-6 py-4">Provider</th><th className="px-6 py-4">Destination</th><th className="px-6 py-4">Amount</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Date</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map(p => {
                const amt = (p.amount?.value || 0) / 100;
                const statusTone = p.status === 'completed' ? 'emerald' : p.status === 'failed' ? 'red' : 'amber';
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{p.id}</td>
                    <td className="px-6 py-4 font-bold text-slate-900 uppercase">{p.destination?.providerId || 'MOMO'}</td>
                    <td className="px-6 py-4 font-mono text-slate-600">{p.destination?.phoneNumber || p.destination?.accountNumber || 'N/A'}</td>
                    <td className="px-6 py-4 font-bold text-slate-900">SLE {amt.toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <Badge tone={statusTone}>{p.status}</Badge>
                      {p.status === 'failed' && p.failureDetail && <div className="text-[10px] text-red-500 mt-1">{p.failureDetail.message}</div>}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">{new Date(p.createTime).toLocaleString()}</td>
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