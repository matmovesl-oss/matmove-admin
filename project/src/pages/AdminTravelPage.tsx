import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { AdminPageSkeleton } from '@/components/Skeleton';
import { 
  Bus, CheckCircle2, Search, Phone, MapPin, 
  User, ShieldCheck, AlertTriangle, Users, Settings, DollarSign 
} from 'lucide-react';

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

  // Settings form states
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
      if (version === requestVersion.current) setLoadError(error?.message || 'Travel records could not be loaded. Check the connection and retry.');
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
    if (!Number.isInteger(totalSeatsInput) || totalSeatsInput < 1 || !Number.isFinite(priceUsdInput) || priceUsdInput < 0 || !Number.isFinite(priceSleInput) || priceSleInput < 0) {
      setNotice('Enter a whole number of seats and valid non-negative fares.');
      return;
    }
    setBusy(true);
    setNotice('');
    setActionError('');
    try {
      const { data, error } = await supabase.from('travel_settings').upsert({
        id: 'bus_ghana',
        total_seats: totalSeatsInput,
        price_usd: Number(priceUsdInput),
        price_sle: Number(priceSleInput),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' }).select('*').single();
      if (error) throw error;
      setBusSettings(data);
      setNotice('Bus capacity and prices are saved. Customer screens will refresh from Supabase.');
      await fetchTravelData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to save bus settings.');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveSeat = async (booking: any) => {
    if (reservedSeats + pendingRequests > totalCapacity) {
      alert('The current reservation queue exceeds the configured capacity. Reject the excess pending requests before approving another booking.');
      return;
    }
    if (reservedSeats + Number(booking.passengers_count || 1) > totalCapacity) {
      alert(`Cannot approve: Bus capacity of ${busSettings.total_seats} seats will be exceeded.`);
      return;
    }

    setBusy(true);
    setNotice('');
    try {
      const { error } = await supabase.from('travel_bookings').update({ status: 'approved' }).eq('id', booking.id);
      if (error) throw error;
      setNotice(`Approved seat allocation for ${booking.passenger_name}. Passenger can now pay.`);
      fetchTravelData();
    } catch (error: any) {
      setActionError(error.message || 'Seat approval failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRejectSeat = async (id: string) => {
    const reason = window.prompt('Reason for rejecting seat request (e.g. Bus at maximum capacity. Please join the next session):');
    if (!reason) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('travel_bookings').update({ status: 'rejected', admin_notes: reason }).eq('id', id);
      if (error) throw error;
      await fetchTravelData();
    } catch (error: any) {
      setActionError(error.message || 'Seat rejection failed.');
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
      fetchTravelData();
    } catch (error: any) {
      setActionError(error.message || 'Boarding activation failed.');
    } finally {
      setBusy(false);
    }
  };

  const totalCapacity = busSettings.total_seats || 50;
  const confirmedPaidSeats = bookings
    .filter(b => b.is_paid || b.status === 'boarded')
    .reduce((acc, curr) => acc + Math.max(1, Number(curr.passengers_count) || 1), 0);
  const reservedSeats = bookings
    .filter(b => b.is_paid || ['approved', 'boarded'].includes(b.status))
    .reduce((acc, curr) => acc + Math.max(1, Number(curr.passengers_count) || 1), 0);
  const pendingRequests = bookings
    .filter(b => b.status === 'pending_approval' && !b.is_paid)
    .reduce((acc, curr) => acc + Math.max(1, Number(curr.passengers_count) || 1), 0);
  // Pending requests are temporary capacity holds until an administrator approves or rejects them.
  const availableSeats = Math.max(0, totalCapacity - reservedSeats - pendingRequests);

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
        {notice && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-2xl flex items-center gap-2">
            <CheckCircle2 size={16} /> {notice}
          </div>
        )}
        {actionError && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">{actionError}</div>}

        {/* Capacity Alert */}
        {reservedSeats + pendingRequests > totalCapacity && (
          <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-2xl flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
            <span>
              <b>Capacity Alert:</b> Total reserved and pending seats ({reservedSeats + pendingRequests}) exceed the {totalCapacity} seat bus capacity. Remaining requests should be rejected so customers are queued for the next session.
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {[
            ['overview', 'Bus Capacity & Overview'],
            ['manifest', 'Manifest & Approvals'],
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

        {loading ? <AdminPageSkeleton /> : loadError ? (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
            <p className="font-bold">Travel data unavailable</p><p className="mt-1">{loadError}</p>
            <button type="button" onClick={() => void fetchTravelData()} className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-2 font-bold">Retry travel data</button>
          </div>
        ) : <>
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
                <span className="text-xs font-bold text-emerald-600 uppercase">Confirmed / Paid</span>
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
                <Bus className="text-indigo-600" size={20} /> Next Scheduled Direct Bus
              </h3>
              <p className="text-xs text-slate-500">Departures 7:00 AM sharp from PZ Terminal, Freetown to Accra Circle Terminal, Ghana.</p>
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-wrap gap-6 text-xs text-slate-700">
                <div><span className="text-slate-400 font-bold block">Fare Price:</span> <b>${busSettings.price_usd || 100} / SLE {Number(busSettings.price_sle || 2400).toLocaleString()}</b></div>
                <div><span className="text-slate-400 font-bold block">Max per Customer:</span> <b>3 Passengers</b></div>
                <div><span className="text-slate-400 font-bold block">Status:</span> <b className={availableSeats <= 0 ? 'text-rose-600' : 'text-emerald-700'}>{availableSeats <= 0 ? 'BUS FULL' : 'SEATS OPEN'}</b></div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Manifest */}
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
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      b.status === 'approved' ? 'bg-indigo-100 text-indigo-800' :
                      b.status === 'boarded' ? 'bg-emerald-100 text-emerald-800' :
                      b.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {b.status}
                    </span>
                    <p className="text-xs font-black text-slate-900 mt-1">{b.passengers_count} Seat(s) · SLE {Number(b.fare_amount).toLocaleString()}</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border text-xs flex justify-between">
                  <span>Emergency: <b>{b.emergency_name}</b> ({b.emergency_phone})</span>
                  <span className="text-slate-400">{new Date(b.created_at).toLocaleDateString()}</span>
                </div>

                {b.status === 'pending_approval' && (
                  <div className="flex gap-2 pt-2 border-t">
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
                      Reject (Bus Full)
                    </button>
                  </div>
                )}
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

        {/* Tab 5: Bus Settings & Pricing */}
        {currentTab === 'settings' && (
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5 max-w-4xl">
            <div className="flex items-center gap-2">
              <Settings className="text-indigo-600" size={20} />
              <div>
                <h3 className="font-bold text-base text-slate-900">Bus Capacity & Pricing Settings</h3>
                <p className="text-xs text-slate-500">Current values are read from Supabase. Saving updates the shared customer fare and seat availability.</p>
              </div>
            </div>

            {busSettings.updated_at && <p className="text-[11px] text-slate-500">Last synced: {new Date(busSettings.updated_at).toLocaleString()}</p>}
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="p-3">Setting</th><th className="p-3">Current Supabase value</th><th className="p-3">Update value</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <th scope="row" className="p-3 font-semibold text-slate-800">Total bus seats</th>
                      <td className="p-3 font-bold tabular-nums">{Number(busSettings.total_seats || 0).toLocaleString()} seats</td>
                      <td className="p-3"><input aria-label="New total bus seats" type="number" min="1" step="1" required value={totalSeatsInput} onChange={e => setTotalSeatsInput(Number(e.target.value))} className="w-full max-w-44 rounded-lg border p-2 font-bold" /></td>
                    </tr>
                    <tr>
                      <th scope="row" className="p-3 font-semibold text-slate-800">Fare per seat (USD)</th>
                      <td className="p-3 font-bold tabular-nums">${Number(busSettings.price_usd || 0).toLocaleString()}</td>
                      <td className="p-3"><input aria-label="New fare per seat in USD" type="number" min="0" step="0.01" required value={priceUsdInput} onChange={e => setPriceUsdInput(Number(e.target.value))} className="w-full max-w-44 rounded-lg border p-2 font-bold" /></td>
                    </tr>
                    <tr>
                      <th scope="row" className="p-3 font-semibold text-slate-800">Fare per seat (SLE)</th>
                      <td className="p-3 font-bold tabular-nums">SLE {Number(busSettings.price_sle || 0).toLocaleString()}</td>
                      <td className="p-3"><input aria-label="New fare per seat in SLE" type="number" min="0" step="0.01" required value={priceSleInput} onChange={e => setPriceSleInput(Number(e.target.value))} className="w-full max-w-44 rounded-lg border p-2 font-bold" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500">New fares apply to new reservations. Existing reservations keep the fare recorded when they were submitted. Seat capacity cannot be reduced below currently held seats.</p>
              <button type="submit" disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-xs transition shadow-md disabled:opacity-60">
                {busy ? 'Saving Settings…' : 'Save Bus Capacity & Pricing'}
              </button>
            </form>
          </div>
        )}

        </>}
      </div>
    </AdminLayout>
  );
}
