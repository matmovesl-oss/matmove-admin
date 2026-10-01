import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { CreditCard, CheckCircle2, Clock, XCircle, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';

export function PayoutsPage() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');

  const fetchRealPayouts = async () => {
    setLoading(true);
    setApiError('');
    try {
      const res = await fetch('/api/get-payouts');
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to connect to Monime API');

      if (data.payouts) {
        setPayouts(data.payouts.sort((a: any, b: any) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime()));
      }
    } catch (err: any) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRealPayouts(); }, []);

  let pending = 0, completed = 0, failed = 0, totalSle = 0;
  payouts.forEach(p => {
    const amt = (p.amount?.value || 0) / 100;
    if (p.status === 'pending' || p.status === 'processing') pending++;
    else if (p.status === 'completed') { completed++; totalSle += amt; }
    else if (p.status === 'failed') failed++;
  });

  return (
    <AdminLayout title="Payouts & Withdrawals" subtitle="Live Payout Ledger sourced entirely from Monime Gateway">
      <div className="flex justify-end mb-6 mt-6">
        <button onClick={fetchRealPayouts} disabled={loading} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 transition">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Sync Monime Ledger
        </button>
      </div>

      {apiError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-3">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          <div><p className="font-bold text-sm">Monime API Connection Failed</p><p className="text-xs mt-1">{apiError}</p></div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-start shadow-sm">
          <div><p className="text-sm font-medium text-slate-500 mb-1">Total Settled</p><h3 className="text-2xl font-bold text-emerald-600">SLE {totalSle.toLocaleString(undefined, {minimumFractionDigits: 2})}</h3></div>
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><CreditCard size={20} /></div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-start shadow-sm">
          <div><p className="text-sm font-medium text-slate-500 mb-1">Pending/Processing</p><h3 className="text-2xl font-bold text-amber-600">{pending}</h3></div>
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Clock size={20} /></div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-start shadow-sm">
          <div><p className="text-sm font-medium text-slate-500 mb-1">Completed</p><h3 className="text-2xl font-bold text-slate-900">{completed}</h3></div>
          <div className="p-2 bg-slate-100 text-slate-600 rounded-lg"><CheckCircle2 size={20} /></div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-start shadow-sm">
          <div><p className="text-sm font-medium text-slate-500 mb-1">Failed</p><h3 className="text-2xl font-bold text-red-600">{failed}</h3></div>
          <div className="p-2 bg-red-50 text-red-600 rounded-lg"><XCircle size={20} /></div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? <div className="p-12 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-600" /> Fetching Monime Ledger...</div> : payouts.length === 0 ? <div className="p-12 text-center text-slate-400">No payout records found in Monime.</div> : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
              <tr><th className="px-6 py-4">Transaction ID</th><th className="px-6 py-4">Destination</th><th className="px-6 py-4">Amount</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Date</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payouts.map((p) => {
                const amt = (p.amount?.value || 0) / 100;
                const statusColor = p.status === 'completed' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : p.status === 'failed' ? 'text-red-700 bg-red-50 border-red-200' : 'text-amber-700 bg-amber-50 border-amber-200';
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{p.id}</td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 uppercase">{p.destination?.providerId || 'MOMO'}</div>
                      <div className="text-xs text-slate-500 font-mono">{p.destination?.phoneNumber || p.destination?.accountNumber || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900">SLE {amt.toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded border ${statusColor}`}>{p.status}</span>
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