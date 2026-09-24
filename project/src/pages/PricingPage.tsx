import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Loader2, Edit, Save, X, Tag } from 'lucide-react';

export function PricingPage() {
  const [pricing, setPricing] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ base_fare: 0, per_km_rate: 0 });

  const fetchPricing = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('vehicle_pricing').select('*').order('service_type');
      if (error) throw error;
      setPricing(data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchPricing(); }, []);

  const handleSave = async (id: string) => {
    try {
      const { error } = await supabase.from('vehicle_pricing').update({
        base_fare: editForm.base_fare, per_km_rate: editForm.per_km_rate, updated_at: new Date().toISOString()
      }).eq('id', id);
      if (error) throw error;
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
              <tr><th className="px-6 py-4">Service Type</th><th className="px-6 py-4">Base Fare (SLE)</th><th className="px-6 py-4">Per KM Rate (SLE)</th><th className="px-6 py-4">Last Updated</th><th className="px-6 py-4 text-right">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pricing.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4 font-bold text-slate-900 uppercase">{p.service_type}</td>
                  <td className="px-6 py-4">
                    {editingId === p.id ? <input type="number" value={editForm.base_fare} onChange={e => setEditForm({...editForm, base_fare: Number(e.target.value)})} className="w-24 border border-indigo-400 rounded px-2 py-1 outline-none ring-2 ring-indigo-100" /> : <span className="font-semibold text-slate-900">{Number(p.base_fare).toLocaleString()}</span>}
                  </td>
                  <td className="px-6 py-4">
                    {editingId === p.id ? <input type="number" value={editForm.per_km_rate} onChange={e => setEditForm({...editForm, per_km_rate: Number(e.target.value)})} className="w-24 border border-indigo-400 rounded px-2 py-1 outline-none ring-2 ring-indigo-100" /> : <span className="font-semibold text-slate-900">{Number(p.per_km_rate).toLocaleString()}</span>}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500">{new Date(p.updated_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right">
                    {editingId === p.id ? (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleSave(p.id)} className="text-white bg-emerald-600 px-3 py-1.5 rounded font-bold flex items-center gap-1"><Save size={14}/> Save</button>
                        <button onClick={() => setEditingId(null)} className="text-slate-600 bg-slate-200 px-3 py-1.5 rounded font-bold"><X size={14}/></button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingId(p.id); setEditForm({ base_fare: p.base_fare, per_km_rate: p.per_km_rate }); }} className="text-indigo-600 bg-indigo-50 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 inline-flex items-center gap-1.5"><Edit size={14} /> Edit</button>
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