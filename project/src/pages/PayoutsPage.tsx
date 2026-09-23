import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { CreditCard, CheckCircle2, XCircle, Clock, RefreshCw, Loader2 } from 'lucide-react';

export function PayoutsPage() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [stats, setStats] = useState({ pendingCount: 0, pendingValue: 0, completedCount: 0, failedCount: 0 });
  const [loading, setLoading] = useState(true);

  const fetchLivePayouts = async () => {
    setLoading(true);
    try {
      const monimeRes = await fetch('https://api.monime.io/v1/payouts?limit=50', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_MONIME_API_KEY}`,
          'Monime-Space-Id': import.meta.env.VITE_MONIME_SPACE_ID,
          'Monime-Version': 'caph.2025-08-23'
        }
      });
      const rawData = await monimeRes.json();
      
      if (monimeRes.ok && rawData.result) {
         const data = rawData.result.items || rawData.result;
         setPayouts(data);
         
         let pendingVal = 0;
         const pending = data.filter((p:any) => p.status === 'pending' || p.status === 'processing');
         pending.forEach((p:any) => pendingVal += (p.amount?.value || 0));

         setStats({
           pendingCount: pending.length,
           pendingValue: pendingVal / 100,
           completedCount: data.filter((p:any) => p.status === 'completed').length,
           failedCount: data.filter((p:any) => p.status === 'failed').length
         });
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchLivePayouts(); }, []);

  return (
    <AdminLayout title="Monime Payouts & Withdrawals" subtitle="Live disbursement tracking directly from Monime Ledger">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 mt-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-start shadow-sm">
          <div><p className="text-sm font-medium text-slate-500 mb-1">Processing Queue</p><h3 className="text-2xl font-bold text-slate-900">{stats.pendingCount}</h3></div>
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Clock size={20} /></div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-start shadow-sm">
          <div><p className="text-sm font-medium text-slate-500 mb-1">Pending Value</p><h3 className="text-2xl font-bold text-slate-900">{stats.pendingValue.toLocaleString()} SLE</h3></div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><CreditCard size={20} /></div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-start shadow-sm">
          <div><p className="text-sm font-medium text-slate-500 mb-1">Completed</p><h3 className="text-2xl font-bold text-slate-900">{stats.completedCount}</h3></div>
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><CheckCircle2 size={20} /></div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-start shadow-sm">
          <div><p className="text-sm font-medium text-slate-500 mb-1">Failed</p><h3 className="text-2xl font-bold text-slate-900">{stats.failedCount}</h3></div>
          <div className="p-2 bg-red-50 text-red-600 rounded-lg"><XCircle size={20} /></div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-900">Live Payout Queue</h3>
          <button onClick={fetchLivePayouts} className="text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition">
             {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh Data
          </button>
        </div>
        {loading ? <div className="p-12 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2" /> Syncing payouts...</div> : payouts.length === 0 ? <div className="p-8 text-center text-slate-500">No withdrawal requests found in Monime.</div> : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
              <tr><th className="px-6 py-4">Transaction ID</th><th className="px-6 py-4">Source Account</th><th className="px-6 py-4">Destination</th><th className="px-6 py-4">Amount</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Date</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payouts.map((req) => {
                 const statusTone = req.status === 'completed' ? 'emerald' : req.status === 'failed' ? 'red' : 'amber';
                 const amtSLE = (req.amount?.value || 0) / 100;
                 return (
                  <tr key={req.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-mono text-[10px] text-slate-600">{req.id}</td>
                    <td className="px-6 py-4 font-mono text-[10px] text-slate-600">{req.source?.financialAccountId || 'Master Float'}</td>
                    <td className="px-6 py-4 font-bold text-slate-900">{req.destination?.phoneNumber || req.destination?.accountNumber || 'Unknown'}</td>
                    <td className="px-6 py-4 font-bold text-slate-900">{amtSLE.toLocaleString()} SLE</td>
                    <td className="px-6 py-4"><span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase bg-${statusTone}-100 text-${statusTone}-800`}>{req.status}</span></td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{new Date(req.createTime).toLocaleString()}</td>
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