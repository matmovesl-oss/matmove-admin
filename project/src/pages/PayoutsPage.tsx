import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { CreditCard, CheckCircle2, XCircle, Clock } from 'lucide-react';

export function PayoutsPage() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [stats, setStats] = useState({ pendingCount: 0, pendingValue: 0, completedCount: 0, failedCount: 0 });
  const [loading, setLoading] = useState(true);

  const fetchLivePayouts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        setPayouts(data);
        
        const pending = data.filter(p => p.status === 'pending');
        const completed = data.filter(p => p.status === 'completed');
        const failed = data.filter(p => p.status === 'failed' || p.status === 'rejected');

        setStats({
          pendingCount: pending.length,
          pendingValue: pending.reduce((acc, curr) => acc + Number(curr.amount), 0),
          completedCount: completed.length,
          failedCount: failed.length
        });
      }
    } catch (err) {
      console.error('Error fetching payouts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLivePayouts();
  }, []);

  const handlePayoutAction = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('withdrawal_requests')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      fetchLivePayouts(); // Refresh the list
    } catch (err: any) {
      alert(err.message || "Failed to update payout status.");
    }
  };

  return (
    <AdminLayout title="Payouts & Withdrawals" subtitle="Authorize or reject pending withdrawal requests">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-start shadow-sm">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Pending Requests</p>
            <h3 className="text-2xl font-bold text-slate-900">{stats.pendingCount}</h3>
          </div>
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Clock size={20} /></div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-start shadow-sm">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Pending Value</p>
            <h3 className="text-2xl font-bold text-slate-900">{stats.pendingValue.toLocaleString()} SLE</h3>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><CreditCard size={20} /></div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-start shadow-sm">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Completed</p>
            <h3 className="text-2xl font-bold text-slate-900">{stats.completedCount}</h3>
          </div>
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><CheckCircle2 size={20} /></div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-start shadow-sm">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Failed</p>
            <h3 className="text-2xl font-bold text-slate-900">{stats.failedCount}</h3>
          </div>
          <div className="p-2 bg-red-50 text-red-600 rounded-lg"><XCircle size={20} /></div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-900">Live Payout Queue</h3>
          <button onClick={fetchLivePayouts} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">Refresh Data</button>
        </div>
        
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading payout records...</div>
        ) : payouts.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No withdrawal requests found.</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
              <tr>
                <th className="px-6 py-4">Requester</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payouts.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4 font-bold text-slate-900">
                    {req.user_name || 'Unknown User'}
                    <div className="text-xs text-slate-400 font-normal mt-0.5">Ref: {req.reference_code || req.id.substring(0, 8)}</div>
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-900">
                    {Number(req.amount).toLocaleString()} SLE
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                      req.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                      req.status === 'failed' || req.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs">
                    {new Date(req.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {req.status === 'pending' ? (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handlePayoutAction(req.id, 'completed')} className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition">Authorize</button>
                        <button onClick={() => handlePayoutAction(req.id, 'rejected')} className="text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition">Reject</button>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}