import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '../lib/supabase';
import { CreditCard, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';

export function PayoutsPage() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPayouts = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('bookings').select('*, driver:driver_id(full_name)').eq('status', 'completed').order('created_at', { ascending: false });
      if (data) setPayouts(data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchPayouts(); }, []);

  const totalDisbursed = payouts.reduce((acc, curr) => acc + (Number(curr.fare_amount) * 0.85), 0);
  const platformRevenue = payouts.reduce((acc, curr) => acc + (Number(curr.fare_amount) * 0.15), 0);

  return (
    <AdminLayout title="Completed Trip Payouts" subtitle="Ledger of driver earnings and platform fees collected in Escrow">
      <div className="flex justify-end mb-6 mt-6">
        <button onClick={fetchPayouts} disabled={loading} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 transition">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh Ledger
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-start shadow-sm">
          <div><p className="text-sm font-medium text-slate-500 mb-1">Total Disbursed to Drivers</p><h3 className="text-2xl font-bold text-emerald-600">SLE {totalDisbursed.toFixed(2)}</h3></div>
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><CreditCard size={20} /></div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-start shadow-sm">
          <div><p className="text-sm font-medium text-slate-500 mb-1">Total Platform Revenue (15%)</p><h3 className="text-2xl font-bold text-indigo-600">SLE {platformRevenue.toFixed(2)}</h3></div>
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><CheckCircle2 size={20} /></div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? <div className="p-12 text-center text-slate-500">Loading records...</div> : payouts.length === 0 ? <div className="p-8 text-center text-slate-500">No payouts found.</div> : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
              <tr><th className="px-6 py-4">Driver</th><th className="px-6 py-4">Gross Fare</th><th className="px-6 py-4">Driver Earnings (85%)</th><th className="px-6 py-4">Platform Fee (15%)</th><th className="px-6 py-4">Date</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payouts.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-bold text-slate-900">{req.driver?.full_name || 'Driver'}</td>
                    <td className="px-6 py-4 text-slate-600">SLE {req.fare_amount}</td>
                    <td className="px-6 py-4 font-bold text-emerald-600">SLE {(req.fare_amount * 0.85).toFixed(2)}</td>
                    <td className="px-6 py-4 font-bold text-indigo-600">SLE {(req.fare_amount * 0.15).toFixed(2)}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{new Date(req.created_at).toLocaleString()}</td>
                  </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}