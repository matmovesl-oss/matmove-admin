import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '../lib/supabase';
import { CreditCard, CheckCircle2, XCircle, Clock, RefreshCw, Loader2 } from 'lucide-react';

export function PayoutsPage() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [stats, setStats] = useState({ pendingCount: 0, pendingValue: 0, completedCount: 0, failedCount: 0 });
  const [loading, setLoading] = useState(true);

  const fetchPayouts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*, profiles ( full_name )')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      if (data) {
        setPayouts(data);
        const pending = data.filter(p => p.status === 'pending' || p.status === 'processing');
        setStats({
          pendingCount: pending.length,
          pendingValue: pending.reduce((acc, curr) => acc + Number(curr.amount || 0), 0),
          completedCount: data.filter(p => p.status === 'completed').length,
          failedCount: data.filter(p => p.status === 'failed' || p.status === 'rejected').length
        });
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchPayouts(); }, []);

  return (
    <AdminLayout title="Payouts & Withdrawals" subtitle="Real-time withdrawal requests from Supabase">
      <div className="flex justify-end mb-6 mt-6">
        <button onClick={fetchPayouts} disabled={loading} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-50 transition">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh Payouts
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-start shadow-sm">
          <div><p className="text-sm font-medium text-slate-500 mb-1">Pending Requests</p><h3 className="text-2xl font-bold text-slate-900">{stats.pendingCount}</h3></div>
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
        </div>
        {loading ? <div className="p-12 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2" /> Loading records...</div> : payouts.length === 0 ? <div className="p-8 text-center text-slate-500">No withdrawal requests found.</div> : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
              <tr><th className="px-6 py-4">Requester</th><th className="px-6 py-4">Destination</th><th className="px-6 py-4">Amount</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Date</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payouts.map((req) => {
                 const statusTone = req.status === 'completed' ? 'emerald' : req.status === 'failed' ? 'red' : 'amber';
                 return (
                  <tr key={req.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-bold text-slate-900">{req.profiles?.full_name || 'Unknown User'}</td>
                    <td className="px-6 py-4 font-mono text-slate-600 text-xs">{req.destination_phone || req.provider || 'N/A'}</td>
                    <td className="px-6 py-4 font-bold text-slate-900">{Number(req.amount).toLocaleString()} SLE</td>
                    <td className="px-6 py-4"><span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase bg-${statusTone}-100 text-${statusTone}-800`}>{req.status}</span></td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{new Date(req.created_at).toLocaleString()}</td>
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