import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout'; // Corrected import
import { Radar, Car, Package, CalendarClock, MapPin, Navigation, Clock, User, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

export default function DispatchRadarPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const { data: bookingsData } = await supabase
        .from('bookings')
        .select(`*, rider:profiles!rider_id(full_name, phone)`)
        .in('status', ['pending', 'pending_admin'])
        .order('created_at', { ascending: false });

      const { data: driversData } = await supabase
        .from('profiles')
        .select('id, full_name, phone, vehicle_type')
        .eq('role', 'driver')
        .eq('kyc_status', 'approved');

      if (bookingsData) setRequests(bookingsData);
      if (driversData) setDrivers(driversData);
    } catch (error) {
      console.error('Error fetching dispatch data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('admin-dispatch-radar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleAssignDriver = async (bookingId: string, driverId: string) => {
    if (!driverId) return alert('Please select a driver first.');
    setAssigningId(bookingId);
    
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ 
          status: 'accepted', 
          driver_id: driverId,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert('Failed to assign driver: ' + err.message);
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <AdminLayout title="Dispatch Radar" subtitle="Live monitoring and manual driver assignment">
      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
          <Radar size={48} className="animate-spin text-indigo-600 mb-4" />
          <p className="font-bold">Initializing Radar...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center flex flex-col items-center justify-center mt-6">
          <Radar size={64} className="text-slate-200 mb-4" />
          <h3 className="text-xl font-bold text-slate-900">No Active Requests</h3>
          <p className="text-slate-500 text-sm mt-2">The dispatch queue is currently empty. Waiting for customers...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
          {requests.map((req) => (
            <div key={req.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
              {req.status === 'pending_admin' && (
                <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1">
                  <AlertCircle size={12}/> Needs Assignment
                </div>
              )}
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex gap-2">
                    {req.service_type === 'delivery' ? (
                      <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"><Package size={14}/> Delivery</span>
                    ) : req.service_type === 'scheduled' ? (
                      <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"><CalendarClock size={14}/> Scheduled</span>
                    ) : (
                      <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"><Car size={14}/> Ride ({req.vehicle_type || 'Any'})</span>
                    )}
                  </div>
                  <div className="text-right mt-4">
                    <div className="text-2xl font-bold text-slate-900">SLE {req.fare_amount}</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Customer Offer</div>
                  </div>
                </div>

                <div className="space-y-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="flex items-start gap-3">
                    <MapPin size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Pickup Location</div>
                      <div className="text-sm font-semibold text-slate-800">{req.pickup_location}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Navigation size={16} className="text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Destination</div>
                      <div className="text-sm font-semibold text-slate-800">{req.destination_location}</div>
                    </div>
                  </div>
                  {req.scheduled_time && (
                    <div className="flex items-start gap-3 pt-3 mt-3 border-t border-slate-200">
                      <Clock size={16} className="text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Scheduled For</div>
                        <div className="text-sm font-semibold text-slate-800">{new Date(req.scheduled_time).toLocaleString()}</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 mb-6 px-2">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                    <User size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">{req.rider?.full_name || 'Customer'}</div>
                    <div className="text-xs text-slate-500">{req.rider?.phone || 'No phone provided'}</div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5 mt-auto bg-slate-50 -mx-6 -mb-6 p-6 rounded-b-2xl">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Assign to Verified Driver</label>
                <div className="flex gap-2">
                  <select 
                    id={`driver-select-${req.id}`}
                    className="flex-1 bg-white border border-slate-200 rounded-xl text-sm px-4 outline-none focus:ring-2 focus:ring-indigo-600"
                    defaultValue=""
                  >
                    <option value="" disabled>Select available driver...</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>{d.full_name} ({d.vehicle_type || 'No Vehicle'} - {d.phone})</option>
                    ))}
                  </select>
                  <button 
                    onClick={() => {
                      const selectEl = document.getElementById(`driver-select-${req.id}`) as HTMLSelectElement;
                      handleAssignDriver(req.id, selectEl.value);
                    }}
                    disabled={assigningId === req.id}
                    className="bg-indigo-600 text-white px-5 py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition flex items-center gap-2 shadow-sm"
                  >
                    {assigningId === req.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    Assign
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}