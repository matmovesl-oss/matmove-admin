import AdminTripReview from '@/components/AdminTripReview';
import { useEffect, useRef, useState } from 'react';
import { RefreshCw, MapPin, Navigation } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { canAccess, useAdminAccess } from '@/lib/adminAccess';

type Booking = {
  id: string;
  version: string;
  status: string;
  fare: string | null;
  serviceType: string;
  vehicleType: string | null;
  pickup: string;
  destination: string;
  scheduledTime: string | null;
  createdAt: string;
  riderId: string;
  driverId: string | null;
  riderLabel: string;
  driverLabel: string | null;
  paymentStarted: boolean;
  paymentMethod: string;
  pendingOffers: string;
  agreedDriverId: string | null;
};

type Driver = {
  id: string;
  label: string;
  eligible: boolean;
  reasonCode: string;
  reason: string;
};

type Feed = {
  actor: string;
  bookings: Booking[];
  drivers: Driver[];
  generatedAt: string;
  limit: number;
};

type Action = 'assign' | 'unassign' | 'cancel';

function formatFare(val: string | number | null | undefined): string {
  if (val == null || val === '') return 'Fare unavailable';
  const n = Number(val);
  if (!Number.isFinite(n)) return String(val);
  return `SLE ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function StaleRideTickets({enabled}:{enabled:boolean}){
  const [rows,setRows]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    if(!enabled)return;
    let live=true,busy=false;
    const load=async()=>{
      if(busy)return;busy=true;setLoading(true);
      try{
        const {data,error}=await supabase.from('matmove_ride_investigation_tickets')
          .select('id,booking_id,reason_code,source_status,status,first_seen_at,last_seen_at')
          .eq('status','open').order('last_seen_at',{ascending:false}).limit(50);
        if(error)throw error;
        if(!Array.isArray(data))throw new Error('Investigation queue response was invalid.');
        if(live){setRows(data);setError('');}
      }catch(e:any){if(live){setError(e?.message||'Investigation queue unavailable. Apply the stale-request migration and retry.');setRows([]);}}
      finally{busy=false;if(live)setLoading(false);}
    };
    void load();
    const timer=window.setInterval(()=>{if(document.visibilityState!=='hidden')void load();},30000);
    const channel=supabase.channel('matmove-ride-investigation-tickets')
      .on('postgres_changes',{event:'*',schema:'public',table:'matmove_ride_investigation_tickets'},()=>void load()).subscribe();
    return()=>{live=false;window.clearInterval(timer);void supabase.removeChannel(channel);};
  },[enabled,reload]);
  if(!enabled)return null;
  return <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold text-slate-900">Automatic ride investigations</h2><p className="text-xs text-slate-600">Stale unfinished requests are added here automatically.</p></div><button type="button" disabled={loading} onClick={()=>setReload(n=>n+1)} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold">Refresh tickets</button></div>
    {error?<p role="alert" className="rounded-lg bg-white p-3 text-xs text-amber-900">{error}</p>:loading&&!rows.length?<p className="text-sm text-slate-500">Loading investigation tickets…</p>:!rows.length?<p className="rounded-lg bg-white p-3 text-sm text-slate-600">No open stale-request investigations.</p>:<div className="space-y-2">{rows.map(row=><article key={row.id} className="rounded-xl border bg-white p-3"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{String(row.reason_code).replace(/_/g,' ')}</strong><span className="text-xs text-amber-800">{row.source_status?.replace(/_/g,' ')}</span></div><p className="mt-1 break-all font-mono text-xs text-slate-600">{row.booking_id}</p><p className="mt-1 text-xs text-slate-500">First flagged: {new Date(row.first_seen_at).toLocaleString()} · Last checked: {new Date(row.last_seen_at).toLocaleString()}</p><button type="button" onClick={()=>{navigator.clipboard?.writeText(row.booking_id);}} className="mt-2 text-xs font-bold text-indigo-700 underline">Copy request reference</button></article>)}</div>}
  </section>;
}

export default function DispatchRadarPage() {
  const access = useAdminAccess(), allowed = canAccess(access, 'dispatch');
  const stamp = JSON.stringify([access?.id, access?.is_active, access?.is_owner, [...(access?.permissions || [])].sort()]);
  const current = useRef(stamp);
  current.current = stamp;
  const mounted = useRef(false), epoch = useRef(0), locked = useRef(false);
  const [tripReference, setTripReference] = useState(''), [searchedTrip, setSearchedTrip] = useState('');
  const [feedSearch,setFeedSearch]=useState('');
  const [feedPeriod,setFeedPeriod]=useState<'today'|'7'|'30'|'all'>('all');
  const [feedLimit,setFeedLimit]=useState<'1000'|'2000'>('1000');
  const [reload, setReload] = useState(0), [feed, setFeed] = useState<Feed | null>(null), [loadedStamp, setLoadedStamp] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [actionError, setActionError] = useState(''), [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(''), [driver, setDriver] = useState(''), [note, setNote] = useState(''), [review, setReview] = useState<Action | null>(null), [busy, setBusy] = useState(false);
  const draft = useRef<{ key: string; booking: string; version: string; action: Action; driver: string | null; note: string } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; epoch.current++; };
  }, []);

  useEffect(() => {
    let live = true, inFlight = false;
    const generation = ++epoch.current;
    const valid = () => live && mounted.current && current.current === stamp && epoch.current === generation;
    setFeed(null);
    setLoadedStamp(stamp);
    setError('');
    setActionError('');
    setLoading(allowed);
    setReview(null);
    setSelected('');
    setDriver('');
    setNote('');
    locked.current = false;
    setBusy(false);
    draft.current = null;

    async function load() {
      if (inFlight || !valid() || !allowed) return;
      inFlight = true;
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('matmove_admin_dispatch_feed');
        if (error) throw error;
        if (
          !data || data.actor !== access!.id || !Array.isArray(data.bookings) || !Array.isArray(data.drivers) || data.bookings.length > 2000 ||
          data.drivers.some((d: any) => typeof d?.id !== 'string' || typeof d.label !== 'string' || typeof d.eligible !== 'boolean' || typeof d.reasonCode !== 'string' || typeof d.reason !== 'string') ||
          new Set(data.drivers.map((d: any) => d.id)).size !== data.drivers.length ||
          data.bookings.some((b: any) => typeof b?.id !== 'string' || typeof b.version !== 'string' || !/^\d+$/.test(b.version) || typeof b.paymentStarted !== 'boolean') ||
          !Number.isFinite(Date.parse(data.generatedAt))
        ) {
          throw new Error('Dispatch response was not confirmed. Apply the complete updated ADMIN_DISPATCH_SETUP.sql and retry.');
        }
        if (valid()) { setFeed(data); setError(''); }
      } catch (e) {
        if (valid()) setError(e instanceof Error ? e.message : String((e as any)?.message || 'Dispatch unavailable. Check ADMIN_DISPATCH_SETUP.sql and retry.'));
      } finally {
        inFlight = false;
        if (valid()) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(() => {
      if (!locked.current && (typeof document === 'undefined' || document.visibilityState !== 'hidden')) void load();
    }, 15000);

    return () => { live = false; epoch.current++; window.clearInterval(timer); };
  }, [stamp, allowed, reload]);

  const ready = loadedStamp === stamp, booking = ready ? feed?.bookings.find(b => b.id === selected) : undefined;
  const selectedDriver = ready ? feed?.drivers.find(d => d.id === driver) : undefined;
  const visibleBookings=(feed?.bookings||[]).filter(b=>{
    const term=feedSearch.trim().toLowerCase();
    if(term&&![b.id,b.riderLabel,b.driverLabel,b.pickup,b.destination,b.status,b.serviceType,b.vehicleType].some(v=>String(v??'').toLowerCase().includes(term)))return false;
    if(feedPeriod==='all')return true;
    const created=Date.parse(b.createdAt);if(!Number.isFinite(created))return false;
    if(feedPeriod==='today'){const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();return created>=start;}
    const days=feedPeriod==='7'?7:30;return created>=Date.now()-days*24*60*60*1000;
  }).slice(0,Number(feedLimit));
  const eligibleDriver = !!selectedDriver?.eligible && !!booking && selectedDriver.id !== booking.riderId && (!booking.agreedDriverId || booking.agreedDriverId === selectedDriver.id);
  const mutable = !!booking && ['pending', 'pending_admin', 'cash_reserve_pending', 'accepted', 'in_progress'].includes(booking.status);
  const cancelable = mutable && !(booking.paymentMethod === 'cash' && (booking.status === 'in_progress' || !!booking.driverId));

  function pick(id: string) {
    if (locked.current) return;
    setSearchedTrip('');
    setSelected(id);
    setDriver('');
    setNote('');
    setReview(null);
    setError('');
    setActionError('');
    setNotice('');
    draft.current = null;
  }

  async function change() {
    if (locked.current || loading || !!error || !booking || !review || !access || !(review === 'cancel' ? cancelable : mutable && !booking.paymentStarted && ['pending','pending_admin'].includes(booking.status)) || note.trim().length < 3 || note.trim().length > 300 || (review === 'assign' && !eligibleDriver)) return;
    const wanted = { booking: booking.id, version: booking.version, action: review, driver: review === 'assign' ? driver : null, note: note.trim() };
    const previous = draft.current;
    const payload = previous && JSON.stringify({ ...previous, key: undefined }) === JSON.stringify(wanted) ? previous : { key: crypto.randomUUID(), ...wanted };
    draft.current = payload;
    const requestStamp = stamp, requestEpoch = epoch.current;
    locked.current = true;
    setBusy(true);
    setActionError('');
    setNotice('');
    const valid = () => mounted.current && current.current === requestStamp && epoch.current === requestEpoch;
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || sessionData.session?.user.id !== access.id) throw new Error('Your account changed. Reopen Dispatch.');
      if (!valid()) return;
      const { data, error } = payload.action === 'cancel' && (booking.paymentStarted || booking.status === 'accepted' || booking.status === 'cash_reserve_pending' || booking.status === 'in_progress')
        ? await supabase.rpc('matmove_admin_cancel_booking', {
            p_booking_id: payload.booking,
            p_expected: payload.version,
            p_request_id: payload.key,
            p_note: payload.note,
            p_expected_actor: access.id,
          })
        : await supabase.rpc('matmove_admin_dispatch_change', {
            p_booking_id: payload.booking,
            p_expected: payload.version,
            p_action: payload.action,
            p_driver: payload.driver,
            p_request_id: payload.key,
            p_note: payload.note,
            p_expected_actor: access.id,
          });
      if (error) throw error;
      if (data?.actor !== access.id || data?.applied !== true || data.requestId !== payload.key || data.bookingId !== payload.booking || data.action !== payload.action) {
        throw new Error('Dispatch action was not confirmed. Keep this request and retry to check its receipt.');
      }
      if (valid()) {
        draft.current = null;
        setReview(null);
        let finalRefundStatus = data.refundStatus;
      if (payload.action === 'cancel' && finalRefundStatus === 'refund_pending') {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            const response = await fetch('https://matmoveent.vercel.app/api/accept-ride-escrow?action=admin_reconcile', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ bookingId: payload.booking }),
            });
            const reconciliation = await response.json().catch(() => null);
            if (response.ok && reconciliation?.refundVerified === true) finalRefundStatus = 'refunded';
          }
        } catch {
          // Cancellation is already recorded. Leave the visible state as refund-pending;
          // the protected scheduled reconciliation worker will retry.
        }
      }
      setNotice(payload.action === 'assign' ? 'Driver assigned. The request remains pending until the driver accepts through the payment flow.' : payload.action === 'unassign' ? 'Pending driver assignment removed.' : finalRefundStatus === 'refunded' && booking.paymentMethod === 'cash' ? 'MatMove cash-fee reserve return is verified. Any physical cash already handed to the driver must be returned to the customer and verified separately.' : finalRefundStatus === 'refunded' ? 'Admin cancellation and full digital fare refund are verified.' : finalRefundStatus === 'refund_pending' && booking.paymentMethod === 'cash' ? 'MatMove cash-fee reserve return is pending provider verification. Any physical cash already handed to the driver must be returned to the customer separately.' : finalRefundStatus === 'refund_pending' ? 'Admin cancellation recorded. Digital fare refund is pending provider verification; the request will only show cancelled after the refund receipt is confirmed.' : 'Request cancellation verified. No refund was required.');
        setReload(n => n + 1);
      }
    } catch (e) {
      if (valid()) setActionError(String((e as any)?.message || 'Dispatch action could not be confirmed.').replace(/^[A-Z_]+:\s*/, ''));
    } finally {
      if (valid()) { locked.current = false; setBusy(false); }
    }
  }

  return (
    <AdminLayout title="Dispatch Radar" subtitle="Assign pending requests at their existing fare. Driver acceptance uses the verified escrow flow.">
      {!allowed ? (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">Access denied. Dispatch has not been assigned.</p>
      ) : (
        <div className="space-y-4">
          <StaleRideTickets enabled={allowed}/>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Latest 2,000 requests. Use date filters or search by rider, driver, location or booking ID. Full export remains available in Reports & CSV. Last synced: {ready && feed ? new Date(feed.generatedAt).toLocaleString() : 'Not yet synced'}.</p>
            <button type="button" disabled={loading || busy} onClick={() => setReload(n => n + 1)} className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-bold disabled:opacity-50">
              <RefreshCw size={16} />Refresh Radar
            </button>
          </div>
          <form onSubmit={e => { e.preventDefault(); if (!busy && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(tripReference.trim())) { setSelected(''); setSearchedTrip(tripReference.trim()); } }} className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-3">
            <label className="min-w-0 flex-1 text-sm font-bold">
              Find any request by reference
              <input aria-label="Trip reference" value={tripReference} onChange={e => setTripReference(e.target.value)} placeholder="Booking UUID from Trips or Reports & CSV" className="mt-1 w-full rounded-lg border p-3 font-mono text-xs" />
            </label>
            <button type="submit" disabled={busy || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(tripReference.trim())} className="min-h-11 rounded-lg border px-3 font-bold disabled:opacity-50">
              Review trip reference
            </button>
          </form>
          <section className="grid gap-3 rounded-xl border bg-white p-3 sm:grid-cols-[minmax(0,1fr)_180px_150px]">
            <label className="block text-sm font-semibold">Search dispatch records
              <input value={feedSearch} onChange={e=>setFeedSearch(e.target.value)} placeholder="Booking ID, rider, driver, pickup or destination" className="mt-1 w-full rounded-lg border p-3 font-normal"/>
            </label>
            <label className="block text-sm font-semibold">Date range
              <select aria-label="Dispatch record date range" value={feedPeriod} onChange={e=>setFeedPeriod(e.target.value as "today"|"7"|"30"|"all")} className="mt-1 w-full rounded-lg border bg-white p-3 font-normal"><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="all">History</option></select>
            </label>
            <label className="block text-sm font-semibold">Records to show
              <select aria-label="Dispatch records to show" value={feedLimit} onChange={e=>setFeedLimit(e.target.value as "1000"|"2000")} className="mt-1 w-full rounded-lg border bg-white p-3 font-normal"><option value="1000">Latest 1,000</option><option value="2000">Latest 2,000</option></select>
            </label>
            <p className="text-xs text-slate-500 sm:col-span-3">Showing {visibleBookings.length.toLocaleString()} matching records from {feed?.bookings.length.toLocaleString()||0} loaded (maximum 2,000).</p>
          </section>
          {searchedTrip && (
            <div className="rounded-xl border bg-white p-4">
              <button type="button" onClick={() => setSearchedTrip('')} className="mb-3 min-h-11 underline">Close reference review</button>
              <AdminTripReview key={`${access!.id}:${searchedTrip}`} userId={access!.id} bookingId={searchedTrip} />
            </div>
          )}
          {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
          {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}<button type="button" disabled={busy} onClick={() => setReload(n => n + 1)} className="ml-2 font-bold underline">Retry Dispatch</button></p>}
          {actionError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{actionError}</p>}
          {!ready || (!feed && loading) ? (
            <p role="status" className="rounded-xl border bg-white p-5 text-sm text-slate-500">Loading dispatch requests…</p>
          ) : !error && feed && !feed.bookings.length ? (
            <p className="rounded-xl border bg-white p-5 text-sm text-slate-600">No requests have been recorded yet.</p>
          ) : !error && feed ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="space-y-3">
                {visibleBookings.map(b => (
                  <button type="button" key={b.id} disabled={busy} onClick={() => pick(b.id)} className={`w-full space-y-2 rounded-2xl border bg-white p-4 text-left disabled:opacity-50 ${selected === b.id ? 'border-indigo-500' : 'border-slate-200'}`}>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-bold">{b.riderLabel || b.riderId}</span>
                      <span className="text-sm font-semibold">{formatFare(b.fare)}</span>
                    </div>
                    <p className="text-xs capitalize text-slate-500">{b.serviceType} · {b.status.replace(/_/g, ' ')}</p>
                    <p className="flex gap-2 text-xs text-slate-600"><MapPin size={14} className="shrink-0" />{b.pickup}</p>
                    <p className="flex gap-2 text-xs text-slate-600"><Navigation size={14} className="shrink-0" />{b.destination}</p>
                    <p className="text-xs text-slate-500">Driver: {b.driverLabel || 'Awaiting assignment'}</p>
                  </button>
                ))}
              </section>
              <section className="min-w-0 space-y-4 self-start rounded-2xl border bg-white p-4">
                {!booking ? (
                  <p className="text-sm text-slate-500">Select a request to review its dispatch controls.</p>
                ) : (
                  <>
                    <AdminTripReview key={`${access!.id}:${booking.id}`} userId={access!.id} bookingId={booking.id} />
                    <h2 className="font-bold">Dispatch controls</h2>
                    <p className="break-all text-xs text-slate-500">{booking.id}</p>
                    <p className="text-sm">{booking.riderLabel} · {formatFare(booking.fare)} · {booking.status.replace(/_/g, ' ')}</p>
                    {booking.scheduledTime && <p className="text-sm">Scheduled: {new Date(booking.scheduledTime).toLocaleString()}</p>}
                    {!mutable ? (
                      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{booking.paymentStarted ? 'Payment processing has started. Reassignment is locked. The customer must use the cancellation/refund flow.' : 'This request is no longer pending. Dispatch changes are closed.'}</p>
                    ) : (
                      <>
                        <p className="text-xs text-slate-600">Assignment does not accept the trip, change the fare or debit a wallet. Only the selected driver can accept it.</p>
                        {booking.pendingOffers !== '0' && <p className="text-sm text-amber-800">Resolve pending fare offers before manual assignment.</p>}
                        <label className="block text-sm font-semibold">
                          Driver
                          <select aria-label="Approved driver" value={driver} disabled={busy || loading} onChange={e => { setDriver(e.target.value); setReview(null); draft.current = null; }} className="mt-2 w-full rounded-xl border bg-white p-3 text-base">
                            <option value="">Select a driver</option>
                            {feed.drivers.map(d => {
                              const reason = d.id === booking.riderId ? 'Cannot drive their own request' : booking.agreedDriverId && booking.agreedDriverId !== d.id ? 'Customer agreed with another driver' : !d.eligible ? d.reason : '';
                              return <option key={d.id} value={d.id} disabled={!!reason}>{d.label} · {reason || 'Ready for assignment'}</option>;
                            })}
                          </select>
                        </label>
                        <p className="text-xs text-slate-600">Manual assignment works for online or offline drivers. Offline drivers see their assigned request when they return and go online. This console does not yet track live online status.</p>
                        {!feed.drivers.length ? (
                          <p className="text-xs text-slate-500">No driver profiles were found. Confirm that the test account has the Driver role.</p>
                        ) : (
                          <details className="rounded-xl border p-3 text-sm">
                            <summary className="cursor-pointer font-semibold">Driver availability and eligibility ({feed.drivers.length})</summary>
                            <ul className="mt-2 space-y-2">
                              {feed.drivers.map(d => (
                                <li key={d.id} className="break-words">
                                  <span className="font-semibold">{d.label}</span>: {d.id === booking.riderId ? 'Cannot drive their own request' : booking.agreedDriverId && booking.agreedDriverId !== d.id ? 'Customer agreed with another driver' : d.reason}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                        <label className="block text-sm font-semibold">
                          Dispatch note
                          <textarea aria-label="Dispatch note" disabled={busy} value={note} onChange={e => { setNote(e.target.value); draft.current = null; }} maxLength={300} className="mt-2 w-full rounded-xl border p-3 text-base" placeholder="Reason for this dispatch action" />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled={busy || loading || !eligibleDriver || !!booking.driverId || booking.pendingOffers !== '0' || booking.paymentStarted || !['pending','pending_admin'].includes(booking.status)} onClick={() => setReview('assign')} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Review assignment</button>
                          {booking.driverId && !booking.agreedDriverId && <button type="button" disabled={busy || booking.paymentStarted || !['pending','pending_admin'].includes(booking.status)} onClick={() => setReview('unassign')} className="rounded-xl border px-4 py-3 text-sm font-bold">Review unassignment</button>}
                          <button type="button" disabled={busy || !cancelable} onClick={() => setReview('cancel')} className="rounded-xl border border-red-200 px-4 py-3 text-sm font-bold text-red-700">Review cancellation / refund</button>
                          {booking.paymentMethod === 'cash' && (booking.status === 'in_progress' || !!booking.driverId) && <p className="text-xs text-amber-800">A driver is linked to this cash request and the physical handover may already have occurred. Verify the driver returned any cash collected to the customer before resolving this request; it remains in the investigation queue.</p>}
                        </div>
                        {review && (
                          <div role="group" aria-label="Confirm dispatch action" className="space-y-3 rounded-xl border-2 border-indigo-500 p-3">
                            <p className="text-sm">Confirm {review === 'assign' ? 'pending assignment' : review === 'unassign' ? 'removing this pending assignment' : 'cancelling this request. If money was collected, MatMove will queue a verified refund'} at the displayed fare?</p>
                            <button type="button" disabled={busy || note.trim().length < 3} onClick={() => void change()} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Confirming…' : 'Confirm dispatch action'}</button>
                            <button type="button" disabled={busy} onClick={() => setReview(null)} className="ml-2 rounded-xl border px-4 py-3 text-sm font-bold">Keep request</button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </section>
            </div>
          ) : null}
        </div>
      )}
    </AdminLayout>
  );
}