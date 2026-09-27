import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Loader2, MapPin, Navigation, RefreshCw, Car, Package, Phone, CalendarClock, UserPlus, X, AlertCircle } from 'lucide-react';

export default function DispatchRadarPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dispatch Modal States
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          rider:rider_id(full_name, phone),
          driver:driver_id(full_name, phone)
        `)
        .order('created_at', { ascending: false })
        .limit(100);
        
      if (error) throw error;
      setBookings(data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const fetchAvailableDrivers = async () => {
    try {
      // Fetch all approved drivers
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone, vehicle_type, plate_number')
        .eq('role', 'driver')
        .eq('kyc_status', 'approved');
      if (error) throw error;
      setAvailableDrivers(data || []);
    } catch (err) { console.error("Failed to load drivers", err); }
  };

  useEffect(() => { 
    fetchBookings(); 
    fetchAvailableDrivers();

    const channel = supabase.channel('admin-dispatch-radar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, fetchBookings)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleAssignDriver = async () => {
    if (!selectedDriverId) return alert('Please select a driver first.');
    setActionLoading(true);
    try {
      // Force accept the booking and assign to specific driver
      const { error } = await supabase.from('bookings').update({ 
        status: 'accepted', 
        driver_id: selectedDriverId 
      }).eq('id', selectedBooking.id);
      
      if (error) throw error;
      alert('Driver assigned successfully!');
      setSelectedBooking(null);
      fetchBookings();
    } catch (err: any) { alert(err.message); } finally { setActionLoading(false); }
  };

  const handleCancelTrip = async () => {
    if (!window.confirm('Are you sure you want to cancel this request?')) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('bookings').update({ 
        status: 'cancelled' 
      }).eq('id', selectedBooking.id);
      
      if (error) throw error;
      alert('Trip cancelled securely.');
      setSelectedBooking(null);
      fetchBookings();
    } catch (err: any) { alert(err.message); } finally { setActionLoading(false); }
  };

  return (
    <AdminLayout title="Dispatch Radar Feed" subtitle="Live tracking and manual assignment of incoming requests">
      <div className="flex justify-end mb-6 mt-6">
        <button onClick={fetchBookings} disabled={loading} className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-700 transition shadow-sm">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh Radar
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? <div className="p-12 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2" /> Scanning for active bookings...</div> : bookings.length === 0 ? <div className="p-8 text-center text-slate-500">No active bookings found.</div> : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
              <tr><th className="px-6 py-4">Rider Details</th><th className="px-6 py-4">Driver Details</th><th className="px-6 py-4">Route Info</th><th className="px-6 py-4">Fare (SLE)</th><th className="px-6 py-4">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bookings.map((b) => {
                 const statusTone = b.status === 'completed' ? 'emerald' : b.status === 'cancelled' ? 'red' : 'amber';
                 return (
                  <tr key={b.id} onClick={() => setSelectedBooking(b)} className="hover:bg-slate-50 transition cursor-pointer group">
                    {/* RIDER INFO */}
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 mb-1 group-hover:text-indigo-600 transition">{b.rider?.full_name || 'Unknown Rider'}</div>
                      <div className="flex items-center gap-1 text-xs text-slate-500"><Phone size={12}/> {b.rider?.phone || 'No Phone'}</div>
                      <div className="mt-1 flex items-center gap-2">
                        {b.service_type === 'delivery' ? <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex w-max items-center gap-1"><Package size={12}/> Delivery</span>
                        : b.service_type === 'scheduled' ? <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex w-max items-center gap-1"><CalendarClock size={12}/> Scheduled</span>
                        : <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex w-max items-center gap-1"><Car size={12}/> Ride</span>}
                      </div>
                    </td>
                    {/* DRIVER INFO */}
                    <td className="px-6 py-4">
                      {b.driver ? (
                        <>
                          <div className="font-bold text-slate-900 mb-1">{b.driver.full_name}</div>
                          <div className="flex items-center gap-1 text-xs text-slate-500"><Phone size={12}/> {b.driver.phone || 'No Phone'}</div>
                          <span className="font-mono text-slate-400 text-[10px] uppercase block mt-1">{b.vehicle_type || 'Standard'}</span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No driver assigned</span>
                      )}
                    </td>
                    {/* ROUTE INFO */}
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

      {/* DISPATCH MANAGEMENT MODAL */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  Dispatch Control 
                  <span className={`text-[10px] px-2.5 py-1 rounded-full uppercase tracking-widest font-bold ${selectedBooking.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : selectedBooking.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {selectedBooking.status}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-1 font-mono">ID: {selectedBooking.id}</p>
              </div>
              <button onClick={() => setSelectedBooking(null)} className="p-2 text-slate-400 hover:bg-slate-200 rounded-full transition"><X size={20} /></button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="text-xs font-bold text-slate-400 uppercase mb-2 tracking-wider">Rider Details</div>
                  <div className="font-bold text-slate-900">{selectedBooking.rider?.full_name || 'Unknown'}</div>
                  <div className="text-sm text-slate-600 mt-1">{selectedBooking.rider?.phone || 'No Phone'}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="text-xs font-bold text-slate-400 uppercase mb-2 tracking-wider">Requested Service</div>
                  <div className="font-bold text-slate-900 capitalize flex items-center gap-2">
                    {selectedBooking.service_type === 'delivery' ? <Package size={16} className="text-orange-500"/> : <Car size={16} className="text-blue-500"/>}
                    {selectedBooking.service_type} ({selectedBooking.vehicle_type || 'Standard'})
                  </div>
                  <div className="text-sm font-bold text-emerald-600 mt-1">Fare: SLE {selectedBooking.fare_amount}</div>
                </div>
              </div>

              <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                <div className="text-xs font-bold text-blue-400 uppercase mb-3 tracking-wider">Route Information</div>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <MapPin size={18} className="text-emerald-500 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase">Pickup Location</div>
                      <div className="text-sm font-semibold text-slate-900">{selectedBooking.pickup_location}</div>
                    </div>
                  </div>
                  <div className="border-l-2 border-dashed border-slate-200 ml-2 h-4"></div>
                  <div className="flex items-start gap-3">
                    <Navigation size={18} className="text-red-500 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase">Destination Location</div>
                      <div className="text-sm font-semibold text-slate-900">{selectedBooking.destination_location}</div>
                    </div>
                  </div>
                </div>
                {selectedBooking.scheduled_time && (
                  <div className="mt-4 pt-4 border-t border-blue-100 flex items-center gap-2 text-sm font-bold text-purple-700">
                    <CalendarClock size={16} /> Scheduled For: {new Date(selectedBooking.scheduled_time).toLocaleString()}
                  </div>
                )}
              </div>

              {(selectedBooking.status === 'pending' || selectedBooking.status === 'pending_admin') && (
                <div className="bg-amber-50 p-5 rounded-2xl border border-amber-200">
                  <div className="text-sm font-bold text-amber-900 mb-3 flex items-center gap-2"><UserPlus size={16} /> Manual Dispatch Override</div>
                  <p className="text-xs text-amber-700 mb-4">Assign this trip directly to an available, approved driver.</p>
                  
                  <select 
                    value={selectedDriverId}
                    onChange={(e) => setSelectedDriverId(e.target.value)}
                    className="w-full p-3 rounded-xl border border-amber-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-500 mb-4"
                  >
                    <option value="">-- Select Available Driver --</option>
                    {availableDrivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.full_name} ({d.vehicle_type || 'Car'} - {d.plate_number || 'No Plate'}) | {d.phone}
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-3">
                    <button 
                      onClick={handleAssignDriver}
                      disabled={actionLoading || !selectedDriverId}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {actionLoading ? <Loader2 size={16} className="animate-spin"/> : 'Assign & Dispatch'}
                    </button>
                    <button 
                      onClick={handleCancelTrip}
                      disabled={actionLoading}
                      className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 font-bold py-3 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <AlertCircle size={16} /> Cancel Trip
                    </button>
                  </div>
                </div>
              )}

              {selectedBooking.driver && (
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                  <div className="text-xs font-bold text-emerald-600 uppercase mb-2 tracking-wider">Assigned Driver</div>
                  <div className="font-bold text-slate-900">{selectedBooking.driver.full_name}</div>
                  <div className="text-sm text-slate-600 mt-1">{selectedBooking.driver.phone}</div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}