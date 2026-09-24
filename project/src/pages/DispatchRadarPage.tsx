import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Loader2, MapPin, Navigation, RefreshCw, Car, Package, AlertCircle } from 'lucide-react';

export default function DispatchRadarPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      // FIX: Removed .in('status', ...) filter so it captures ALL bookings
      const { data, error } = await supabase
        .from('bookings')
        .select(`*, profiles!rider_id(full_name, phone)`)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setBookings(data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { 
    fetchBookings(); 
    // FIX: Listen to ALL updates on the bookings table without filters
    const channel = supabase.channel('admin-dispatch-radar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, fetchBookings)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <AdminLayout title="Dispatch Radar" subtitle="Live feed of all ride requests, deliveries, and schedules">
      <div className="flex justify-end mb-6 mt-6">
        <button onClick={fetchBookings} disabled={loading} className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-700 transition shadow-sm">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh Radar
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? <div className="p-12 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2" /> Scanning for active bookings...</div> : bookings.length === 0 ? <div className="p-8 text-center text-slate-500">No active bookings found.</div> : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
              <tr><th className="px-6 py-4">Customer & Service</th><th className="px-6 py-4">Route Info</th><th className="px-6 py-4">Fare (SLE)</th><th className="px-6 py-4">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bookings.map((b) => {
                 const statusTone = b.status === 'completed' ? 'emerald' : b.status === 'cancelled' ? 'red' : 'amber';
                 return (
                  <tr key={b.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 mb-1">{b.profiles?.full_name || 'Unknown User'}</div>
                      <div className="flex items-center gap-2">
                        {b.service_type === 'delivery' ? <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><Package size={12}/> Delivery</span>
                        : <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><Car size={12}/> Ride</span>}
                        <span className="font-mono text-slate-400 text-[10px] uppercase">{b.vehicle_type || 'Standard'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <div className="flex items-start gap-2 mb-1.5">
                        <MapPin size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-xs text-slate-700 truncate" title={b.pickup_location}>{b.pickup_location}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Navigation size={14} className="text-red-500 shrink-0 mt-0.5" />
                        <span className="text-xs text-slate-700 truncate" title={b.destination_location}>{b.destination_location}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900">{Number(b.fare_amount || 0).toLocaleString()}</td>
                    <td className="px-6 py-4"><span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase bg-${statusTone}-100 text-${statusTone}-800`}>{b.status || 'pending'}</span></td>
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