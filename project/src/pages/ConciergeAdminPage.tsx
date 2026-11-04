import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness, Plus, Pencil, Trash2, RotateCcw, PauseCircle,
  PlayCircle, RefreshCw, MessageSquare, Save, X, Clock3, CheckCircle2,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';

type ConciergeService = {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  price_label: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type ConciergeInterest = {
  id: string;
  service_id: string | null;
  service_title: string;
  price_label_snapshot: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  message: string;
  status: 'new' | 'contacted' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
};

type ServiceForm = {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  priceLabel: string;
  displayOrder: string;
};

const blankForm: ServiceForm = {
  id: '', slug: '', title: '', category: 'Concierge',
  description: '', priceLabel: '', displayOrder: '100',
};

const statuses = [
  ['new', 'New'],
  ['contacted', 'Contacted'],
  ['in_progress', 'In progress'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
] as const;

function slugify(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function errorText(value: unknown) {
  return value instanceof Error ? value.message : 'The Concierge request could not be completed.';
}

export function ConciergeAdminPage() {
  const [services, setServices] = useState<ConciergeService[]>([]);
  const [interests, setInterests] = useState<ConciergeInterest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<ServiceForm>(blankForm);
  const [showForm, setShowForm] = useState(false);
  const [interestFilter, setInterestFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) throw new Error('Sign in again to manage Concierge.');
      const response = await fetch('/api/admin-concierge', {
        headers: { Authorization: 'Bearer ' + data.session.access_token },
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Concierge catalogue could not be loaded.');
      if (!Array.isArray(body.services) || !Array.isArray(body.interests)) {
        throw new Error('Concierge response could not be verified.');
      }
      setServices(body.services);
      setInterests(body.interests);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeServices = useMemo(() => services.filter(item => item.is_active && !item.deleted_at), [services]);
  const newInterests = useMemo(() => interests.filter(item => item.status === 'new'), [interests]);
  const openInterests = useMemo(() => interests.filter(item => ['new', 'contacted', 'in_progress'].includes(item.status)), [interests]);
  const filteredInterests = useMemo(() => interestFilter === 'all'
    ? interests
    : interests.filter(item => item.status === interestFilter), [interests, interestFilter]);

  async function post(action: string, fields: Record<string, unknown>) {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.access_token) throw new Error('Your Admin session expired. Sign in again.');
    const response = await fetch('/api/admin-concierge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + data.session.access_token,
      },
      body: JSON.stringify({ action, ...fields }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Concierge change could not be saved.');
    return body;
  }

  function startNew() {
    setForm(blankForm);
    setShowForm(true);
    setNotice('');
    setError('');
  }

  function startEdit(item: ConciergeService) {
    if (item.deleted_at) return;
    setForm({
      id: item.id,
      slug: item.slug,
      title: item.title,
      category: item.category,
      description: item.description,
      priceLabel: item.price_label,
      displayOrder: String(item.display_order),
    });
    setShowForm(true);
    setNotice('');
    setError('');
  }

  async function saveService(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await post('save', {
        ...(form.id ? { id: form.id } : {}),
        slug: form.slug || slugify(form.title),
        title: form.title,
        category: form.category,
        description: form.description,
        priceLabel: form.priceLabel,
        displayOrder: Number(form.displayOrder),
      });
      setShowForm(false);
      setForm(blankForm);
      setNotice(form.id ? 'Concierge service updated.' : 'Concierge service added to the customer catalogue.');
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function serviceAction(action: 'archive' | 'restore' | 'set-active', item: ConciergeService, active?: boolean) {
    if (busy) return;
    const description = action === 'archive'
      ? 'Delete this service from the customer catalogue? Its history and previous enquiries will be retained.'
      : action === 'restore'
        ? 'Restore this service to the customer catalogue?'
        : active ? 'Make this service visible to customers?' : 'Pause this service for customers?';
    if (!window.confirm(description)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await post(action, { id: item.id, ...(action === 'set-active' ? { active } : {}) });
      setNotice(action === 'archive' ? 'Service deleted from the live catalogue. Historical records were preserved.' :
        action === 'restore' ? 'Service restored.' : active ? 'Service is now visible to customers.' : 'Service paused.');
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function updateInterest(id: string, status: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await post('set-interest-status', { id, status });
      setNotice('Customer enquiry status updated.');
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout title="MatMove Concierge" subtitle="Manage the customer-facing concierge catalogue, display prices, and customer enquiries.">
      <div className="mx-auto mt-5 max-w-7xl space-y-6">
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
        {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active services</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{activeServices.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">New enquiries</p>
            <p className="mt-2 text-3xl font-black text-indigo-700">{newInterests.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open enquiries</p>
            <p className="mt-2 text-3xl font-black text-amber-700">{openInterests.length}</p>
          </div>
        </div>

        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <BriefcaseBusiness className="text-indigo-600" size={24} />
              <div>
                <h2 className="font-bold text-slate-900">Customer Concierge services</h2>
                <p className="mt-1 text-xs text-slate-500">Changes here update the offers shown in the customer app.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void load()} disabled={loading || busy}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh
              </button>
              <button type="button" onClick={startNew} disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                <Plus size={16} />Add service
              </button>
            </div>
          </div>

          {showForm && (
            <form onSubmit={saveService} className="grid grid-cols-1 gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 md:grid-cols-2">
              <div className="md:col-span-2 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">{form.id ? 'Edit Concierge service' : 'Add Concierge service'}</h3>
                <button type="button" onClick={() => { setShowForm(false); setForm(blankForm); }}
                  className="rounded-lg p-2 text-slate-500 hover:bg-white" aria-label="Close service form"><X size={17} /></button>
              </div>
              <label className="block text-xs font-bold text-slate-700">
                Service name
                <input required minLength={2} maxLength={120} value={form.title}
                  onChange={event => setForm(value => ({
                    ...value, title: event.target.value,
                    slug: value.id ? value.slug : slugify(event.target.value),
                  }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium" />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Service link (slug)
                <input required maxLength={100} value={form.slug}
                  onChange={event => setForm(value => ({ ...value, slug: slugify(event.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium" />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Category
                <input required minLength={2} maxLength={60} value={form.category}
                  onChange={event => setForm(value => ({ ...value, category: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium" />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Display price
                <input required maxLength={120} value={form.priceLabel}
                  onChange={event => setForm(value => ({ ...value, priceLabel: event.target.value }))}
                  placeholder="e.g. US$3,900 or US$20/kg"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium" />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Display order
                <input type="number" min="0" max="10000" step="1" required value={form.displayOrder}
                  onChange={event => setForm(value => ({ ...value, displayOrder: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium" />
              </label>
              <label className="block text-xs font-bold text-slate-700 md:col-span-2">
                Customer-facing description
                <textarea maxLength={1000} rows={3} value={form.description}
                  onChange={event => setForm(value => ({ ...value, description: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium" />
              </label>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <button type="submit" disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-xs font-bold text-white disabled:opacity-50">
                  <Save size={15} />{busy ? 'Saving…' : 'Save service'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setForm(blankForm); }}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-bold text-slate-700">Cancel</button>
              </div>
            </form>
          )}

          {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading Concierge catalogue…</p> :
            !services.length ? <p className="py-8 text-center text-sm text-slate-500">No Concierge services yet. Add the first service above.</p> :
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {services.map(item => (
                  <article key={item.id} className={'rounded-2xl border p-4 ' +
                    (item.deleted_at ? 'border-slate-200 bg-slate-50 opacity-75' : 'border-slate-200 bg-white')}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-900">{item.title}</h3>
                          <span className={'rounded-full px-2 py-1 text-[10px] font-bold ' +
                            (item.deleted_at ? 'bg-slate-200 text-slate-700' : item.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>
                            {item.deleted_at ? 'Deleted' : item.is_active ? 'Live' : 'Paused'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{item.category} · /{item.slug}</p>
                      </div>
                      <p className="text-sm font-black text-indigo-700">{item.price_label}</p>
                    </div>
                    {item.description && <p className="mt-3 text-sm text-slate-600">{item.description}</p>}
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      {!item.deleted_at && <button type="button" onClick={() => startEdit(item)} disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
                        <Pencil size={13} />Edit
                      </button>}
                      {item.deleted_at ? (
                        <button type="button" onClick={() => void serviceAction('restore', item)} disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700">
                          <RotateCcw size={13} />Restore
                        </button>
                      ) : (
                        <>
                          <button type="button" onClick={() => void serviceAction('set-active', item, !item.is_active)} disabled={busy}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
                            {item.is_active ? <PauseCircle size={13} /> : <PlayCircle size={13} />}
                            {item.is_active ? 'Pause' : 'Publish'}
                          </button>
                          <button type="button" onClick={() => void serviceAction('archive', item)} disabled={busy}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">
                            <Trash2 size={13} />Delete
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
          }
        </section>

        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <MessageSquare className="text-indigo-600" size={23} />
              <div>
                <h2 className="font-bold text-slate-900">Customer enquiries</h2>
                <p className="mt-1 text-xs text-slate-500">Enquiries are captured when customers select a Concierge service.</p>
              </div>
            </div>
            <select aria-label="Filter Concierge enquiries" value={interestFilter} onChange={event => setInterestFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
              <option value="all">All enquiries</option>
              {statuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </div>

          {loading ? <p className="py-6 text-center text-sm text-slate-500">Loading customer enquiries…</p> :
            !filteredInterests.length ? <p className="py-6 text-center text-sm text-slate-500">No enquiries match this filter yet.</p> :
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Service / quoted price</th>
                      <th className="p-3">Submitted</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInterests.map(item => (
                      <tr key={item.id}>
                        <td className="p-3">
                          <p className="font-bold text-slate-900">{item.customer_name || 'Customer'}</p>
                          <p className="mt-1 text-slate-500">{item.customer_email || item.customer_phone || 'No contact details'}</p>
                          {item.message && <p className="mt-1 max-w-xs whitespace-normal text-slate-500">{item.message}</p>}
                        </td>
                        <td className="p-3">
                          <p className="font-bold text-slate-900">{item.service_title}</p>
                          <p className="mt-1 text-indigo-700">{item.price_label_snapshot}</p>
                        </td>
                        <td className="whitespace-nowrap p-3 text-slate-500">
                          <span className="inline-flex items-center gap-1"><Clock3 size={12} />{new Date(item.created_at).toLocaleString()}</span>
                        </td>
                        <td className="p-3">
                          <select value={item.status} disabled={busy}
                            onChange={event => void updateInterest(item.id, event.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700">
                            {statuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          }
        </section>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          Deleting a service removes it from the customer catalogue but preserves its record and historic enquiries for audit and reporting.
        </p>
      </div>
    </AdminLayout>
  );
}
