import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { AdminPageSkeleton, SkeletonGrid } from '@/components/Skeleton';
import { Ticket, Plus, Calendar, MapPin, Search, CheckCircle2, ShieldCheck, Upload } from 'lucide-react';

export function AdminEventsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'overview';

  const [events, setEvents] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const requestVersion = useRef(0);
  const hasLoaded = useRef(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  // Form states
  const [title, setTitle] = useState('');
  const [flyerFile, setFlyerFile] = useState<File | null>(null);
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [price, setPrice] = useState('100');
  const [description, setDescription] = useState('');

  const fetchEventsAndTickets = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!hasLoaded.current) setLoading(true);
    setLoadError('');
    try {
      const [eventsResult, ticketsResult] = await Promise.all([
        supabase.from('platform_events').select('*').order('created_at', { ascending: false }),
        supabase.from('event_tickets').select('*, event:platform_events(title)').order('created_at', { ascending: false }),
      ]);
      if (eventsResult.error) throw eventsResult.error;
      if (ticketsResult.error) throw ticketsResult.error;
      if (version !== requestVersion.current) return;
      setEvents(eventsResult.data || []);
      setTickets(ticketsResult.data || []);
      hasLoaded.current = true;
    } catch (error: any) {
      if (version === requestVersion.current) setLoadError(error?.message || 'Event and ticket records could not be loaded.');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEventsAndTickets();
    const channel = supabase.channel('admin-events-live-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_events' }, () => { void fetchEventsAndTickets(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_tickets' }, () => { void fetchEventsAndTickets(); })
      .subscribe();
    return () => {
      requestVersion.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [fetchEventsAndTickets]);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flyerFile) { setActionError('Choose an event flyer image before publishing.'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(flyerFile.type)) { setActionError('Flyers must be JPG, PNG, or WebP images.'); return; }
    if (flyerFile.size > 5 * 1024 * 1024) { setActionError('The flyer image must be 5 MB or smaller.'); return; }
    if (!title.trim() || !venue.trim() || !date || !Number.isFinite(Number(price)) || Number(price) < 0) { setActionError('Complete the event details with a valid ticket price.'); return; }

    setBusy(true);
    setActionError('');
    setNotice('');
    let uploadedPath: string | null = null;
    try {
      const extension = flyerFile.type === 'image/jpeg' ? 'jpg' : flyerFile.type === 'image/png' ? 'png' : 'webp';
      const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      uploadedPath = `${randomId}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('event-flyers').upload(uploadedPath, flyerFile, {
        contentType: flyerFile.type,
        cacheControl: '3600',
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data: publicData } = supabase.storage.from('event-flyers').getPublicUrl(uploadedPath);
      if (!publicData?.publicUrl) throw new Error('The flyer URL could not be confirmed after upload.');

      const { error: insertError } = await supabase.from('platform_events').insert({
        title: title.trim(),
        flyer_url: publicData.publicUrl,
        event_date: new Date(date).toISOString(),
        venue: venue.trim(),
        ticket_price: Number(price),
        description: description.trim(),
        is_active: true,
      });
      if (insertError) throw insertError;

      setShowAddModal(false);
      setTitle(''); setFlyerFile(null); setDate(''); setVenue(''); setPrice('100'); setDescription('');
      setNotice('Event published. The customer Events Hub will update from Supabase.');
      await fetchEventsAndTickets();
    } catch (err: any) {
      if (uploadedPath) {
        // Best-effort cleanup prevents unused public flyers after a failed event insert.
        await supabase.storage.from('event-flyers').remove([uploadedPath]).catch(() => undefined);
      }
      setActionError(err.message || 'Failed to publish event.');
    } finally {
      setBusy(false);
    }
  };

  const handleActivateGateTicket = async (ticketId: string) => {
    setBusy(true);
    setNotice('');
    try {
      const { error } = await supabase.from('event_tickets').update({
        status: 'used',
        admitted_at: new Date().toISOString()
      }).eq('id', ticketId);
      if (error) throw error;
      setNotice('Ticket verified and activated. Attendee admitted.');
      await fetchEventsAndTickets();
    } catch (error: any) {
      setActionError(error.message || 'Ticket activation failed.');
    } finally {
      setBusy(false);
    }
  };

  const filteredTickets = tickets.filter(t => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return t.ticket_code?.toLowerCase().includes(q) || t.user_phone?.includes(q) || t.event?.title?.toLowerCase().includes(q);
  });

  return (
    <AdminLayout
      title="Events Hub & Ticket Gate"
      subtitle="Publish customer events with flyer uploads and manage gate check-ins"
    >
      <div className="max-w-6xl space-y-6 mt-4">
        {notice && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-2xl flex items-center gap-2">
            <CheckCircle2 size={16} /> {notice}
          </div>
        )}
        {actionError && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">{actionError}</div>}

        <div className="flex gap-2 border-b border-slate-200 pb-3">
          {[
            ['overview', 'Events & Flyers'],
            ['sales', 'Ticket Sales Audit'],
            ['checkin', 'Gate Check-In & Activation'],
          ].map(([tabKey, label]) => (
            <button
              key={tabKey}
              onClick={() => setSearchParams({ tab: tabKey })}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                currentTab === tabKey
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? <><AdminPageSkeleton /><SkeletonGrid count={3} /></> : loadError ? (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
            <p className="font-bold">Events data unavailable</p><p className="mt-1">{loadError}</p>
            <button type="button" onClick={() => void fetchEventsAndTickets()} className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-2 font-bold">Retry events data</button>
          </div>
        ) : <>
        {currentTab === 'overview' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-base">Active Events</h3>
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-sky-600 hover:bg-sky-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition shadow-sm"
              >
                <Plus size={16} /> Upload & Post Event
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {events.map(evt => (
                <div key={evt.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                  <img src={evt.flyer_url || '/logo.png'} alt={evt.title} className="w-full h-44 object-cover bg-slate-100" />
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">{evt.title}</h4>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{evt.description}</p>
                      <div className="mt-3 space-y-1 text-xs text-slate-600 font-medium">
                        <div className="flex items-center gap-1.5"><Calendar size={13} /> {new Date(evt.event_date).toLocaleString()}</div>
                        <div className="flex items-center gap-1.5"><MapPin size={13} /> {evt.venue}</div>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t flex justify-between items-center">
                      <span className="text-base font-black text-sky-600">SLE {Number(evt.ticket_price).toLocaleString()}</span>
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">Active</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentTab === 'sales' && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-base text-slate-900">Direct Ticket Sales</h3>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase font-bold">
                  <th className="pb-3">Ticket Code</th>
                  <th className="pb-3">Event Title</th>
                  <th className="pb-3">Customer Phone</th>
                  <th className="pb-3">Passes</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="py-3 font-mono font-bold text-sky-600">{t.ticket_code}</td>
                    <td className="py-3 font-bold text-slate-900">{t.event?.title || 'Event'}</td>
                    <td className="py-3 text-slate-600">{t.user_phone}</td>
                    <td className="py-3">{t.tickets_count || 1}</td>
                    <td className="py-3 font-bold text-emerald-600">SLE {Number(t.amount_paid).toLocaleString()}</td>
                    <td className="py-3 text-slate-400">{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.status === 'used' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-800'}`}>
                        {t.status === 'used' ? 'Admitted' : 'Confirmed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {currentTab === 'checkin' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Scan or enter ticket code (e.g. TKT-ABC123) or phone number..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>

            <div className="space-y-3">
              {filteredTickets.map(t => (
                <div key={t.id} className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center justify-between shadow-sm">
                  <div>
                    <span className="font-mono font-black text-sm text-sky-600 block">{t.ticket_code}</span>
                    <h4 className="font-bold text-slate-900 text-sm mt-0.5">{t.event?.title}</h4>
                    <p className="text-xs text-slate-500">{t.user_phone} · {t.tickets_count || 1} Admission(s)</p>
                  </div>
                  <div>
                    {t.status === 'used' ? (
                      <span className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs flex items-center gap-1.5">
                        <CheckCircle2 size={15} /> Admitted
                      </span>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() => handleActivateGateTicket(t.id)}
                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md transition"
                      >
                        <ShieldCheck size={16} /> Admit & Activate Pass
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showAddModal && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl">
              <h2 className="text-lg font-bold mb-4">Post New Event with Flyer</h2>
              <form onSubmit={handleCreateEvent} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Event Title</label>
                  <input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="w-full p-2.5 border rounded-xl text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Upload Flyer (Image File)</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    required
                    onChange={e => setFlyerFile(e.target.files?.[0] || null)}
                    className="w-full p-2 border border-dashed rounded-xl text-xs bg-slate-50 cursor-pointer"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Date & Time</label>
                    <input type="datetime-local" required value={date} onChange={e => setDate(e.target.value)} className="w-full p-2.5 border rounded-xl text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Price (SLE)</label>
                    <input type="number" required value={price} onChange={e => setPrice(e.target.value)} className="w-full p-2.5 border rounded-xl text-xs" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Venue</label>
                  <input type="text" required value={venue} onChange={e => setVenue(e.target.value)} className="w-full p-2.5 border rounded-xl text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                  <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2.5 border rounded-xl text-xs" />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={busy} className="flex-1 bg-sky-600 text-white font-bold py-3 rounded-xl text-xs">
                    {busy ? 'Uploading & Publishing…' : 'Publish Event'}
                  </button>
                  <button type="button" onClick={() => setShowAddModal(false)} className="px-4 bg-slate-200 text-slate-700 font-bold rounded-xl text-xs">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        </>}
      </div>
    </AdminLayout>
  );
}
