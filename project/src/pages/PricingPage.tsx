import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Loader2, Edit, Save, X, Tag } from 'lucide-react';

export function PricingPage({ adminProfile }: any) {
  const [pricing, setPricing] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ base_fare: 0, per_km_rate: 0 });

  const fetchPricing = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('pricing_settings').select('*').order('vehicle_type');
      if (error) throw error;
      setPricing(data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchPricing(); }, []);

  const handleSave = async (id: string, type: string) => {
    try {
      const { error } = await supabase.from('pricing_settings').update({ min_fare: editForm.base_fare, per_km_rate: editForm.per_km_rate }).eq('vehicle_type', type);
      if (error) throw error;
      
      await supabase.from('audit_logs').insert({ admin_id: adminProfile?.id || null, action: 'UPDATE_PRICING', details: `Updated ${type} pricing: Base SLE ${editForm.base_fare}, Per Km SLE ${editForm.per_km_rate}` });
      
      setEditingId(null);
      fetchPricing();
    } catch (err: any) { alert("Failed to update: " + err.message); }
  };

  return (
    <AdminLayout title="Vehicle Pricing Config" subtitle="Manage base fares and per-km rates across all vehicle classes">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mt-6">
        <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2 text-indigo-700"><Tag size={18} /><h3 className="font-bold">Active Fleet Pricing</h3></div>
        </div>
        {loading ? <div className="p-12 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2" /> Loading pricing models...</div> : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-bold">
              <tr><th className="px-6 py-4">Service Type</th><th className="px-6 py-4">Base Fare (SLE)</th><th className="px-6 py-4">Per KM Rate (SLE)</th><th className="px-6 py-4 text-right">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pricing.map((p) => (
                <tr key={p.vehicle_type} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4 font-bold text-slate-900 uppercase">{p.vehicle_type}</td>
                  <td className="px-6 py-4">
                    {editingId === p.vehicle_type ? <input type="number" value={editForm.base_fare} onChange={e => setEditForm({...editForm, base_fare: Number(e.target.value)})} className="w-24 border border-indigo-400 rounded px-2 py-1 outline-none ring-2 ring-indigo-100" /> : <span className="font-semibold text-slate-900">{Number(p.min_fare).toLocaleString()}</span>}
                  </td>
                  <td className="px-6 py-4">
                    {editingId === p.vehicle_type ? <input type="number" value={editForm.per_km_rate} onChange={e => setEditForm({...editForm, per_km_rate: Number(e.target.value)})} className="w-24 border border-indigo-400 rounded px-2 py-1 outline-none ring-2 ring-indigo-100" /> : <span className="font-semibold text-slate-900">{Number(p.per_km_rate).toLocaleString()}</span>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {editingId === p.vehicle_type ? (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleSave(p.vehicle_type, p.vehicle_type)} className="text-white bg-emerald-600 px-3 py-1.5 rounded font-bold"><Save size={14} className="inline mr-1"/> Save</button>
                        <button onClick={() => setEditingId(null)} className="text-slate-600 bg-slate-200 px-3 py-1.5 rounded font-bold"><X size={14}/></button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingId(p.vehicle_type); setEditForm({ base_fare: p.min_fare, per_km_rate: p.per_km_rate }); }} className="text-indigo-600 bg-indigo-50 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100"><Edit size={14} className="inline mr-1"/> Edit</button>
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