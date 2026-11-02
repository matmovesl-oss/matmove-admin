import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Ticket, Plus, Calendar, MapPin, Search, CheckCircle2, ShieldCheck, Trash2, Edit3, Filter } from 'lucide-react';

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
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventFilter, setSelectedEventFilter] = useState('all');
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
  const [isActive, setIsActive] = useState(true);

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

  const handleOpenEdit = (evt: any) => {
    setEditingEvent(evt);
    setTitle(evt.title);
    setDate(evt.event_date ? new Date(evt.event_date).toISOString().slice(0, 16) : '');
    setVenue(evt.venue);
    setPrice(String(evt.ticket_price));
    setDescription(evt.description || '');
    setIsActive(evt.is_active);
    setFlyerFile(null);
    setShowAddModal(true);
  };

  const handleCreateOrUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setActionError('');
    setNotice('');
    let uploadedUrl = editingEvent?.flyer_url || '/logo.png';

    try {
      if (flyerFile) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(flyerFile.type)) {
          throw new Error('Flyers must be JPG, PNG, or WebP images.');
        }
        if (flyerFile.size > 5 * 1024 * 1024) {
          throw new Error('The flyer image must be 5 MB or smaller.');
        }
        const extension = flyerFile.type === 'image/jpeg' ? 'jpg' : flyerFile.type === 'image/png' ? 'png' : 'webp';
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('event-flyers').upload(fileName, flyerFile, {
          contentType: flyerFile.type,
          cacheControl: '3600',
          upsert: false,
        });
        if (uploadError) throw uploadError;
        const { data: publicData } = supabase.storage.from('event-flyers').getPublicUrl(fileName);
        if (publicData?.publicUrl) uploadedUrl = publicData.publicUrl;
      }

      if (editingEvent) {
        const { error: updateError } = await supabase.from('platform_events').update({
          title: title.trim(),
          flyer_url: uploadedUrl,
          event_date: new Date(date).toISOString(),
          venue: venue.trim(),
          ticket_price: Number(price),
          description: description.trim(),
          is_active: isActive
        }).eq('id', editingEvent.id);
        if (updateError) throw updateError;
        setNotice('Event updated successfully.');
      } else {
        const { error: insertError } = await supabase.from('platform_events').insert({
          title: title.trim(),
          flyer_url: uploadedUrl,
          event_date: new Date(date).toISOString(),
          venue: venue.trim(),
          ticket_price: Number(price),
          description: description.trim(),
          is_active: true
        });
        if (insertError) throw insertError;
        setNotice('New event published successfully.');
      }

      setShowAddModal(false);
      setEditingEvent(null);
      setTitle(''); setFlyerFile(null); setDate(''); setVenue(''); setPrice('100'); setDescription('');
      void fetchEventsAndTickets();
    } catch (err: any) {
      setActionError(err.message || 'Failed to save event.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteEvent = async (evt: any) => {
    const confirmed = window.confirm(`Permanently delete "${evt.title}" and its flyer image? This action cannot be undone.`);
    if (!confirmed) return;

    setBusy(true);
    setActionError('');
    try {
      if (evt.flyer_url && evt.flyer_url.includes('event-flyers/')) {
        const fileName = evt.flyer_url.split('event-flyers/').pop();
        if (fileName) {
          await supabase.storage.from('event-flyers').remove([fileName]).catch(() => undefined);
        }
      }
      const { error: deleteError } = await supabase.from('platform_events').delete().eq('id', evt.id);
      if (deleteError) throw deleteError;
      setNotice('Event and flyer deleted.');
      void fetchEventsAndTickets();
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete event. Make sure no tickets exist for it.');
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
      void fetchEventsAndTickets();
    } catch (err: any) {
      setActionError(err.message || 'Ticket check-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const filteredTickets = tickets.filter(t => {
    if (selectedEventFilter !== 'all' && t.event_id !== selectedEventFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return t.ticket_code?.toLowerCase().includes(q) 
      || t.payment_id?.toLowerCase().includes(q) 
      || t.user_phone?.includes(q) 
      || t.event?.title?.toLowerCase().includes(q);
  });

  return (
    <AdminLayout
      title="Events Hub & Ticket Gate"
      subtitle="Publish customer events, manage flyers, filter ticket sales and verify gate check-ins"
    >
      <div className="max-w-6xl space-y-6 mt-4">
        {notice && <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-2xl flex items-center gap-2"><CheckCircle2 size={16} /> {notice}</div>}
        {actionError && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl font-bold">{actionError}</div>}
        {loadError && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl font-bold">{loadError}</div>}

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

        {/* Tab 1: Events Overview with Edit & Delete */}
        {currentTab === 'overview' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-base">Active & Scheduled Events</h3>
              <button
                onClick={() => { setEditingEvent(null); setTitle(''); setDate(''); setVenue(''); setPrice('100'); setDescription(''); setFlyerFile(null); setShowAddModal(true); }}
                className="bg-sky-600 hover:bg-sky-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition shadow-sm"
              >
                <Plus size={16} /> Upload & Post Event
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {events.map(evt => {
                const isPast = new Date(evt.event_date) < new Date();
                return (
                  <div key={evt.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col justify-between">
                    <div>
                      <img src={evt.flyer_url || '/logo.png'} alt={evt.title} className="w-full h-44 object-cover bg-slate-100" />
                      <div className="p-5 space-y-2">
                        <div className="flex justify-between items-start">
                          <h4 className="font-bold text-slate-900 text-base leading-snug">{evt.title}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            !evt.is_active ? 'bg-slate-100 text-slate-600' : isPast ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {!evt.is_active ? 'Inactive' : isPast ? 'Past Event' : 'Active'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-2">{evt.description}</p>
                        <div className="space-y-1 text-xs text-slate-600 pt-1 font-medium">
                          <div className="flex items-center gap-1.5"><Calendar size={13} className="text-slate-400" /> {new Date(evt.event_date).toLocaleString()}</div>
                          <div className="flex items-center gap-1.5"><MapPin size={13} className="text-slate-400" /> {evt.venue}</div>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-base font-black text-sky-600">SLE {Number(evt.ticket_price).toLocaleString()}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(evt)}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-1"
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteEvent(evt)}
                          className="px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-lg text-xs font-bold text-rose-700 hover:bg-rose-100 flex items-center gap-1"
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Sales Audit with Event Filter */}
        {currentTab === 'sales' && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h3 className="font-bold text-base text-slate-900">Direct Ticket Sales</h3>
              <div className="flex items-center gap-2">
                <Filter size={15} className="text-slate-400" />
                <select
                  value={selectedEventFilter}
                  onChange={e => setSelectedEventFilter(e.target.value)}
                  className="p-2 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-700 outline-none"
                >
                  <option value="all">All Events</option>
                  {events.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                </select>
              </div>
            </div>

            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase font-bold">
                  <th className="pb-3">Ticket Code</th>
                  <th className="pb-3">Payment ID</th>
                  <th className="pb-3">Event Title</th>
                  <th className="pb-3">Customer Phone</th>
                  <th className="pb-3">Passes</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTickets.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="py-3 font-mono font-bold text-sky-600">{t.ticket_code}</td>
                    <td className="py-3 font-mono text-[11px] text-slate-500">{t.payment_id ? t.payment_id.slice(0, 8) + '…' : '—'}</td>
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

        {/* Tab 3: Check-in with Event Filter */}
        {currentTab === 'checkin' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Scan or enter ticket code (e.g. TKT-ABC123), Payment ID, or phone number..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter size={15} className="text-slate-400" />
                <select
                  value={selectedEventFilter}
                  onChange={e => setSelectedEventFilter(e.target.value)}
                  className="p-2.5 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-700 outline-none"
                >
                  <option value="all">Filter: All Events</option>
                  {events.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              {filteredTickets.map(t => (
                <div key={t.id} className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center justify-between shadow-sm">
                  <div>
                    <span className="font-mono font-black text-sm text-sky-600 block">{t.ticket_code}</span>
                    <span className="font-mono text-[11px] text-slate-400 block mt-0.5">Payment ID: {t.payment_id || 'Direct'}</span>
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

        {/* Modal: Add or Edit Event */}
        {(showAddModal || editingEvent) && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl">
              <h2 className="text-lg font-bold mb-4">{editingEvent ? 'Edit Event' : 'Post New Event with Flyer'}</h2>
              <form onSubmit={handleCreateOrUpdateEvent} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Event Title</label>
                  <input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="w-full p-2.5 border rounded-xl text-xs font-bold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Flyer Image {editingEvent ? '(Optional to replace)' : ''}</label>
                  <input
                    type="file"
                    accept="image/*"
                    required={!editingEvent}
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
                    <label className="block text-xs font-bold text-slate-700 mb-1">Ticket Price (SLE)</label>
                    <input type="number" required value={price} onChange={e => setPrice(e.target.value)} className="w-full p-2.5 border rounded-xl text-xs font-bold" />
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
                {editingEvent && (
                  <div className="flex items-center gap-2 pt-1">
                    <input type="checkbox" id="isActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="rounded" />
                    <label htmlFor="isActive" className="text-xs font-bold text-slate-700">Event is Active (Visible in Customer Portal)</label>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={busy} className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 rounded-xl text-xs shadow-md">
                    {busy ? 'Saving…' : editingEvent ? 'Save Changes' : 'Publish Event'}
                  </button>
                  <button type="button" onClick={() => { setShowAddModal(false); setEditingEvent(null); }} className="px-4 bg-slate-200 text-slate-700 font-bold rounded-xl text-xs">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}