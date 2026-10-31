import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { 
  Bus, CheckCircle2, Search, Phone, MapPin, 
  User, ShieldCheck, AlertTriangle, Users, Calendar 
} from 'lucide-react';

export function AdminTravelPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'overview';

  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState('');

  const fetchBookings = async () => {
    try {
      const { data } = await supabase
        .from('travel_bookings')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setBookings(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleApproveSeat = async (id: string) => {
    setBusy(true);
    setActionNotice('');
    try {
      await supabase.from('travel_bookings').update({ status: 'approved' }).eq('id', id);
      setActionNotice('Seat booking approved. Passenger can now pay 6,000 SLE in their portal.');
      fetchBookings();
    } finally {
      setBusy(false);
    }
  };

  const handleRejectSeat = async (id: string) => {
    const reason = window.prompt('Reason for rejecting seat request (e.g. Bus at maximum capacity):');
    if (!reason) return;
    setBusy(true);
    try {
      await supabase.from('travel_bookings').update({ status: 'rejected', admin_notes: reason }).eq('id', id);
      fetchBookings();
    } finally {
      setBusy(false);
    }
  };

  const handleActivateBoarding = async (id: string) => {
    const confirmed = window.confirm('Verify passenger physical ID before admitting onto the bus. Mark as BOARDED & ACTIVATED?');
    if (!confirmed) return;
    setBusy(true);
    setActionNotice('');
    try {
      await supabase.from('travel_bookings').update({
        status: 'boarded',
        boarded_at: new Date().toISOString()
      }).eq('id', id);
      setActionNotice('Passenger successfully activated and admitted onto bus.');
      fetchBookings();
    } finally {
      setBusy(false);
    }
  };

  // Bus capacity calculations
  const totalBusCapacity = 45;
  const confirmedPaidSeats = bookings
    .filter(b => b.is_paid || b.status === 'boarded')
    .reduce((acc, curr) => acc + (curr.passengers_count || 1), 0);
  const pendingRequests = bookings
    .filter(b => b.status === 'pending_approval')
    .reduce((acc, curr) => acc + (curr.passengers_count || 1), 0);
  const remainingSeats = Math.max(0, totalBusCapacity - confirmedPaidSeats);

  const filtered = bookings.filter(b => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.passenger_name?.toLowerCase().includes(q) ||
      b.passenger_phone?.includes(q) ||
      b.id?.toLowerCase().includes(q)
    );
  });

  return (
    <AdminLayout
      title="Travel on Bus Hub (Freetown ⇄ Accra)"
      subtitle="SLRSA Compliance, Passenger Manifests, Capacity Control & Terminal Activation"
    >
      <div className="max-w-6xl space-y-6 mt-4">
        {actionNotice && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-2xl flex items-center gap-2">
            <CheckCircle2 size={16} /> {actionNotice}
          </div>
        )}

        {/* Tab Controls */}
        <div className="flex gap-2 border-b border-slate-200 pb-3">
          {[
            ['overview', 'Bus Capacity & Overview'],
            ['manifest', 'Manifest & Approvals'],
            ['boarding', 'Passenger Boarding & Activation'],
            ['payments', 'Fare Payments Audit'],
          ].map(([tabKey, label]) => (
            <button
              key={tabKey}
              onClick={() => setSearchParams({ tab: tabKey })}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                currentTab === tabKey
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab 1: Overview & Capacity */}
        {currentTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-slate-400 uppercase">Total Capacity</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{totalBusCapacity} Seats</p>
                <span className="text-[11px] text-slate-500">Luxury 45-passenger express</span>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-emerald-600 uppercase">Confirmed & Paid</span>
                <p className="text-2xl font-black text-emerald-600 mt-1">{confirmedPaidSeats} Seats</p>
                <span className="text-[11px] text-slate-500">Revenue: SLE {(confirmedPaidSeats * 6000).toLocaleString()}</span>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-amber-600 uppercase">Pending Review</span>
                <p className="text-2xl font-black text-amber-600 mt-1">{pendingRequests} Seats</p>
                <span className="text-[11px] text-slate-500">Awaiting seat allocation</span>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-indigo-600 uppercase">Available Seats</span>
                <p className="text-2xl font-black text-indigo-600 mt-1">{remainingSeats} Left</p>
                <span className="text-[11px] text-slate-500">For 1st & 15th departure</span>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-3">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Bus className="text-indigo-600" size={20} /> Next Scheduled Direct Bus
              </h3>
              <p className="text-xs text-slate-500">Departures 7:00 AM sharp from PZ Terminal, Freetown with direct transit to Accra Circle Terminal.</p>
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-wrap gap-6 text-xs text-slate-700">
                <div><span className="text-slate-400 font-bold block">Fare per Seat:</span> <b>SLE 6,000</b></div>
                <div><span className="text-slate-400 font-bold block">Max Booking / Account:</span> <b>3 Passengers</b></div>
                <div><span className="text-slate-400 font-bold block">Safety Compliance:</span> <b>SLRSA & ECOWAS Manifest</b></div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Manifest & Approvals */}
        {currentTab === 'manifest' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search passenger name, phone, or booking ID..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>

            {loading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-28 bg-slate-200 rounded-2xl"></div>
                <div className="h-28 bg-slate-200 rounded-2xl"></div>
              </div>
            ) : filtered.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-400 bg-white rounded-2xl border">No passenger requests found.</p>
            ) : (
              filtered.map(b => (
                <div key={b.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <User size={15} className="text-indigo-600" /> {b.passenger_name}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                        <span className="flex items-center gap-1"><Phone size={12} /> {b.passenger_phone}</span>
                        <span className="flex items-center gap-1"><MapPin size={12} /> {b.passenger_address}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        b.status === 'approved' ? 'bg-indigo-100 text-indigo-800' :
                        b.status === 'boarded' ? 'bg-emerald-100 text-emerald-800' :
                        b.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {b.status === 'pending_approval' ? 'Awaiting Seat Approval' : b.status}
                      </span>
                      <p className="text-xs font-black text-slate-900 mt-1">{b.passengers_count} Seat{b.passengers_count > 1 ? 's' : ''} · SLE {Number(b.fare_amount).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs flex justify-between">
                    <span>Emergency Contact: <b>{b.emergency_name}</b> ({b.emergency_phone})</span>
                    <span className="text-slate-400">{new Date(b.created_at).toLocaleDateString()}</span>
                  </div>

                  {b.status === 'pending_approval' && (
                    <div className="flex gap-2 pt-2 border-t">
                      <button
                        disabled={busy}
                        onClick={() => handleApproveSeat(b.id)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
                      >
                        <CheckCircle2 size={14} /> Approve Seat Allocation
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handleRejectSeat(b.id)}
                        className="px-4 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold rounded-xl text-xs border border-rose-200"
                      >
                        Reject (Full)
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 3: Terminal Boarding & Activation */}
        {currentTab === 'boarding' && (
          <div className="space-y-4">
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 text-xs text-amber-900 font-medium">
              Terminal Gate Desk: Verify passenger government ID and receipt before clicking <b>Activate / Boarded</b>.
            </div>

            <div className="relative">
              <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search boarding manifest by passenger name or phone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>

            <div className="space-y-3">
              {filtered.filter(b => b.is_paid || b.status === 'approved').map(b => (
                <div key={b.id} className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center justify-between shadow-sm">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{b.passenger_name} ({b.passengers_count} Seat{b.passengers_count > 1 ? 's' : ''})</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{b.passenger_phone} · Emergency: {b.emergency_name} ({b.emergency_phone})</p>
                    <span className="text-[11px] font-bold text-emerald-700 mt-1 block">Paid in full (SLE {Number(b.fare_amount).toLocaleString()})</span>
                  </div>

                  <div>
                    {b.status === 'boarded' ? (
                      <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-xl font-bold text-xs flex items-center gap-1.5">
                        <CheckCircle2 size={15} /> Boarded ({new Date(b.boarded_at || b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                      </span>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() => handleActivateBoarding(b.id)}
                        className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-md transition"
                      >
                        <ShieldCheck size={16} /> Activate / Boarded
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Payments & Treasury */}
        {currentTab === 'payments' && (
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-base text-slate-900">Direct Travel Treasury Log</h3>
            <p className="text-xs text-slate-500">Every booking debits 6,000 SLE per passenger directly into the designated travel treasury account.</p>

            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase font-bold">
                  <th className="pb-3">Passenger</th>
                  <th className="pb-3">Phone</th>
                  <th className="pb-3">Seats</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bookings.filter(b => b.is_paid || b.status === 'boarded').map(b => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="py-3 font-bold text-slate-900">{b.passenger_name}</td>
                    <td className="py-3 text-slate-600">{b.passenger_phone}</td>
                    <td className="py-3">{b.passengers_count}</td>
                    <td className="py-3 font-bold text-emerald-600">SLE {Number(b.fare_amount).toLocaleString()}</td>
                    <td className="py-3 text-slate-400">{new Date(b.created_at).toLocaleDateString()}</td>
                    <td className="py-3 font-bold text-emerald-700">Settled</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}