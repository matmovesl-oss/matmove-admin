import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Bus, CheckCircle2, Search, User, ShieldCheck, AlertTriangle, Settings, XCircle } from 'lucide-react';

export function AdminTravelPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'overview';

  const [bookings, setBookings] = useState<any[]>([]);
  const [busSettings, setBusSettings] = useState<any>({ total_seats: 50, price_usd: 100, price_sle: 2400 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const requestVersion = useRef(0);
  const hasLoaded = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const [totalSeatsInput, setTotalSeatsInput] = useState(50);
  const [priceUsdInput, setPriceUsdInput] = useState(100);
  const [priceSleInput, setPriceSleInput] = useState(2400);

  const fetchTravelData = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!hasLoaded.current) setLoading(true);
    setLoadError('');
    try {
      const [settingsResult, bookingsResult] = await Promise.all([
        supabase.from('travel_settings').select('*').eq('id', 'bus_ghana').maybeSingle(),
        supabase.from('travel_bookings').select('*').order('created_at', { ascending: false }),
      ]);
      if (settingsResult.error) throw settingsResult.error;
      if (bookingsResult.error) throw bookingsResult.error;
      if (version !== requestVersion.current) return;
      if (settingsResult.data) {
        setBusSettings(settingsResult.data);
        setTotalSeatsInput(Number(settingsResult.data.total_seats));
        setPriceUsdInput(Number(settingsResult.data.price_usd));
        setPriceSleInput(Number(settingsResult.data.price_sle));
      }
      setBookings(bookingsResult.data || []);
      hasLoaded.current = true;
    } catch (error: any) {
      if (version === requestVersion.current) setLoadError(error?.message || 'Travel records could not be loaded.');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTravelData();
    const channel = supabase.channel('admin-travel-live-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'travel_settings', filter: 'id=eq.bus_ghana' }, () => { void fetchTravelData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'travel_bookings' }, () => { void fetchTravelData(); })
      .subscribe();
    return () => {
      requestVersion.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [fetchTravelData]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice('');
    setActionError('');
    try {
      const { error } = await supabase.from('travel_settings').upsert({
        id: 'bus_ghana',
        total_seats: Number(totalSeatsInput),
        price_usd: Number(priceUsdInput),
        price_sle: Number(priceSleInput),
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      setNotice('Bus capacity and pricing updated successfully.');
      void fetchTravelData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update settings.');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveSeat = async (booking: any) => {
    setBusy(true);
    setNotice('');
    try {
      const { error } = await supabase.from('travel_bookings').update({ status: 'approved' }).eq('id', booking.id);
      if (error) throw error;
      setNotice(`Approved seat allocation for ${booking.passenger_name}. Passenger can now pay.`);
      void fetchTravelData();
    } finally {
      setBusy(false);
    }
  };

  const handleApproveCancellation = async (booking: any) => {
    const confirmed = window.confirm(`Approve cancellation request for ${booking.passenger_name}? Their seats will be released back to the bus capacity.`);
    if (!confirmed) return;

    setBusy(true);
    setNotice('');
    try {
      const { error } = await supabase.from('travel_bookings').update({
        status: 'cancelled',
        admin_notes: `Cancellation approved. Reason: ${booking.cancel_reason || 'Customer request'}`
      }).eq('id', booking.id);
      if (error) throw error;
      setNotice(`Cancellation approved for ${booking.passenger_name}. ${booking.is_paid ? 'Note: Issue refund reversal via Refunds & Special Operations if needed.' : ''}`);
      void fetchTravelData();
    } finally {
      setBusy(false);
    }
  };

  const handleRejectSeat = async (id: string) => {
    const reason = window.prompt('Reason for rejecting seat:');
    if (!reason) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('travel_bookings').update({ status: 'rejected', admin_notes: reason }).eq('id', id);
      if (error) throw error;
      void fetchTravelData();
    } finally {
      setBusy(false);
    }
  };

  const handleActivateBoarding = async (id: string) => {
    const confirmed = window.confirm('Verify passenger physical ID before admitting onto the bus. Mark as BOARDED & ACTIVATED?');
    if (!confirmed) return;
    setBusy(true);
    setNotice('');
    try {
      const { error } = await supabase.from('travel_bookings').update({
        status: 'boarded',
        boarded_at: new Date().toISOString()
      }).eq('id', id);
      if (error) throw error;
      setNotice('Passenger successfully activated and admitted onto bus.');
      void fetchTravelData();
    } finally {
      setBusy(false);
    }
  };

  const totalCapacity = busSettings.total_seats || 50;
  const confirmedPaidSeats = bookings
    .filter(b => b.is_paid || b.status === 'boarded')
    .reduce((acc, curr) => acc + (curr.passengers_count || 1), 0);
  const pendingRequests = bookings
    .filter(b => b.status === 'pending_approval')
    .reduce((acc, curr) => acc + (curr.passengers_count || 1), 0);
  const cancelRequests = bookings.filter(b => b.status === 'cancel_requested').length;
  const availableSeats = Math.max(0, totalCapacity - confirmedPaidSeats);

  const filtered = bookings.filter(b => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return b.passenger_name?.toLowerCase().includes(q) || b.passenger_phone?.includes(q);
  });

  return (
    <AdminLayout
      title="Travel on Bus Hub (Freetown ⇄ Accra)"
      subtitle="SLRSA Compliance, Passenger Manifests, Capacity Control & Terminal Activation"
    >
      <div className="max-w-6xl space-y-6 mt-4">
        {notice && <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-2xl flex items-center gap-2"><CheckCircle2 size={16} /> {notice}</div>}
        {actionError && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl font-bold">{actionError}</div>}
        {loadError && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl font-bold">{loadError}</div>}

        {cancelRequests > 0 && (
          <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-2xl flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
            <span><b>Action Required:</b> There are {cancelRequests} pending travel cancellation request(s) waiting for review under Manifest & Approvals.</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {[
            ['overview', 'Bus Capacity & Overview'],
            ['manifest', `Manifest & Approvals ${cancelRequests > 0 ? `(${cancelRequests} Cancels)` : ''}`],
            ['boarding', 'Passenger Boarding & Activation'],
            ['payments', 'Fare Payments Audit'],
            ['settings', 'Bus Pricing & Seat Settings'],
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

        {/* Tab 1: Overview */}
        {currentTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-slate-400 uppercase">Total Capacity</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{totalCapacity} Seats</p>
                <span className="text-[11px] text-slate-500">Configured in Settings</span>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-emerald-600 uppercase">Confirmed & Paid</span>
                <p className="text-2xl font-black text-emerald-600 mt-1">{confirmedPaidSeats} Seats</p>
                <span className="text-[11px] text-slate-500">Revenue: SLE {(confirmedPaidSeats * (busSettings.price_sle || 2400)).toLocaleString()}</span>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-amber-600 uppercase">Pending Review</span>
                <p className="text-2xl font-black text-amber-600 mt-1">{pendingRequests} Seats</p>
                <span className="text-[11px] text-slate-500">Awaiting dispatch review</span>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-indigo-600 uppercase">Available Left</span>
                <p className="text-2xl font-black text-indigo-600 mt-1">{availableSeats} Left</p>
                <span className="text-[11px] text-slate-500">{availableSeats <= 0 ? 'BUS FULL' : 'Seats Open'}</span>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-3">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Bus className="text-indigo-600" size={20} /> Scheduled Departures
              </h3>
              <p className="text-xs text-slate-500">Direct Bus between Freetown PZ Terminal and Accra Circle Terminal.</p>
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-wrap gap-6 text-xs text-slate-700">
                <div><span className="text-slate-400 font-bold block">Fare Price:</span> <b>${busSettings.price_usd || 100} / SLE {Number(busSettings.price_sle || 2400).toLocaleString()}</b></div>
                <div><span className="text-slate-400 font-bold block">Max per Customer:</span> <b>3 Passengers</b></div>
                <div><span className="text-slate-400 font-bold block">Status:</span> <b className={availableSeats <= 0 ? 'text-rose-600' : 'text-emerald-700'}>{availableSeats <= 0 ? 'BUS FULL' : 'SEATS OPEN'}</b></div>
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
                placeholder="Search passenger name or phone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs"
              />
            </div>

            {filtered.map(b => (
              <div key={b.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <User size={15} className="text-indigo-600" /> {b.passenger_name}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">{b.passenger_phone} · {b.passenger_address}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                      b.status === 'approved' ? 'bg-indigo-100 text-indigo-800' :
                      b.status === 'boarded' ? 'bg-emerald-100 text-emerald-800' :
                      b.status === 'cancel_requested' ? 'bg-rose-100 text-rose-800 animate-pulse' :
                      b.status === 'cancelled' ? 'bg-slate-100 text-slate-600' :
                      b.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {b.status === 'cancel_requested' ? 'Cancel Requested' : b.status}
                    </span>
                    <p className="text-xs font-black text-slate-900 mt-1">{b.passengers_count} Seat(s) · SLE {Number(b.fare_amount).toLocaleString()}</p>
                  </div>
                </div>

                {b.cancel_reason && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
                    <b>Cancellation Reason:</b> {b.cancel_reason}
                  </div>
                )}

                <div className="bg-slate-50 p-3 rounded-xl border text-xs flex justify-between">
                  <span>Emergency: <b>{b.emergency_name}</b> ({b.emergency_phone})</span>
                  <span className="text-slate-400">{new Date(b.created_at).toLocaleDateString()}</span>
                </div>

                <div className="flex gap-2 pt-2 border-t">
                  {b.status === 'pending_approval' && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => handleApproveSeat(b)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
                      >
                        <CheckCircle2 size={14} /> Approve Seat
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handleRejectSeat(b.id)}
                        className="px-4 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold rounded-xl text-xs border border-rose-200"
                      >
                        Reject Seat
                      </button>
                    </>
                  )}

                  {b.status === 'cancel_requested' && (
                    <button
                      disabled={busy}
                      onClick={() => handleApproveCancellation(b)}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
                    >
                      <XCircle size={14} /> Approve Cancellation & Release Seats
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Boarding */}
        {currentTab === 'boarding' && (
          <div className="space-y-4">
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 text-xs text-amber-900 font-medium">
              Terminal Gate Desk: Verify passenger government ID and receipt before clicking <b>Activate / Boarded</b>.
            </div>

            {filtered.filter(b => b.is_paid || b.status === 'approved').map(b => (
              <div key={b.id} className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center justify-between shadow-sm">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{b.passenger_name} ({b.passengers_count} Seat(s))</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{b.passenger_phone} · Emergency: {b.emergency_name} ({b.emergency_phone})</p>
                  <span className="text-[11px] font-bold text-emerald-700 mt-1 block">Paid in full (SLE {Number(b.fare_amount).toLocaleString()})</span>
                </div>
                <div>
                  {b.status === 'boarded' ? (
                    <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-xl font-bold text-xs flex items-center gap-1.5">
                      <CheckCircle2 size={15} /> Boarded
                    </span>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => handleActivateBoarding(b.id)}
                      className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-md"
                    >
                      <ShieldCheck size={16} /> Activate / Boarded
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: Payments Audit */}
        {currentTab === 'payments' && (
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-base text-slate-900">Direct Travel Treasury Log</h3>
            <p className="text-xs text-slate-500">Payments routed to <code>MONIME_TRAVEL_ACCOUNT_ID</code></p>
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
                  <tr key={b.id}>
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

        {/* Tab 5: Settings */}
        {currentTab === 'settings' && (
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5 max-w-xl">
            <div className="flex items-center gap-2">
              <Settings className="text-indigo-600" size={20} />
              <h3 className="font-bold text-base text-slate-900">Bus Capacity & Pricing Settings</h3>
            </div>
            <p className="text-xs text-slate-500">Adjust the bus fare and maximum passenger seats. The customer portal updates automatically in real-time.</p>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Total Bus Seat Capacity</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={totalSeatsInput}
                  onChange={e => setTotalSeatsInput(Number(e.target.value))}
                  className="w-full p-2.5 border rounded-xl text-sm font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fare Price (USD)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={priceUsdInput}
                    onChange={e => setPriceUsdInput(Number(e.target.value))}
                    className="w-full p-2.5 border rounded-xl text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fare Price (SLE)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={priceSleInput}
                    onChange={e => setPriceSleInput(Number(e.target.value))}
                    className="w-full p-2.5 border rounded-xl text-sm font-bold"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-xs transition shadow-md"
              >
                {busy ? 'Saving Settings…' : 'Save Bus Capacity & Pricing'}
              </button>
            </form>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}