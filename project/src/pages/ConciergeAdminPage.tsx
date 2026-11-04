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

type ConciergeReport = {
  range: { from: string; to: string; days: number; trendGrouping: 'day' | 'month' };
  catalogue: { totalServices: number; activeServices: number; pausedServices: number; deletedServices: number };
  enquiries: {
    total: number;
    open: number;
    completed: number;
    cancelled: number;
    byStatus: Record<string, number>;
  };
  serviceBreakdown: Array<{
    serviceId: string | null;
    serviceTitle: string;
    enquiries: number;
    statusCounts: Record<string, number>;
    priceLabels: string[];
  }>;
  trend: Array<{ period: string; enquiries: number; statusCounts: Record<string, number> }>;
  audit: { totalEvents: number; byAction: Record<string, number>; recentEvents: Array<{ action: string; serviceId: string | null; createdAt: string }> };
  revenue: null;
  revenueNote: string;
  complete: boolean;
  generatedAt: string;
};

function dateOffset(value: string, days: number) {
  const date = new Date(value + 'T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const initialReportTo = new Date().toISOString().slice(0, 10);
const initialReportFrom = dateOffset(initialReportTo, -89);

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
  const [report, setReport] = useState<ConciergeReport | null>(null);
  const [reportFrom, setReportFrom] = useState(initialReportFrom);
  const [reportTo, setReportTo] = useState(initialReportTo);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState('');

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


  const loadReport = useCallback(async (from: string, to: string) => {
    setReportLoading(true);
    setReportError('');
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) throw new Error('Sign in again to view Concierge reports.');
      const query = new URLSearchParams({ action: 'reports', from, to });
      const response = await fetch('/api/admin-concierge?' + query.toString(), {
        headers: { Authorization: 'Bearer ' + data.session.access_token },
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Concierge report could not be loaded.');
      if (!body.report || body.report.complete !== true || !Array.isArray(body.report.trend) ||
          !Array.isArray(body.report.serviceBreakdown) || typeof body.report.enquiries?.total !== 'number') {
        throw new Error('Concierge report response could not be verified as complete.');
      }
      setReport(body.report as ConciergeReport);
    } catch (cause) {
      setReport(null);
      setReportError(errorText(cause));
    } finally {
      setReportLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadReport(initialReportFrom, initialReportTo);
  }, [load, loadReport]);

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

        <section aria-label="Concierge reports and analytics" className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">Concierge reports & analytics</h2>
              <p className="mt-1 text-xs text-slate-500">Date-filtered customer enquiries, service interest and service-management audit activity.</p>
            </div>
            <button type="button" onClick={() => void loadReport(reportFrom, reportTo)} disabled={reportLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
              <RefreshCw size={14} className={reportLoading ? 'animate-spin' : ''} />Refresh report
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-slate-50 p-3">
            <label className="text-xs font-bold text-slate-700">
              From
              <input type="date" value={reportFrom} max={reportTo} onChange={event => setReportFrom(event.target.value)}
                className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium" />
            </label>
            <label className="text-xs font-bold text-slate-700">
              To
              <input type="date" value={reportTo} min={reportFrom} onChange={event => setReportTo(event.target.value)}
                className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium" />
            </label>
            <button type="button" onClick={() => void loadReport(reportFrom, reportTo)}
              disabled={reportLoading || !reportFrom || !reportTo || reportFrom > reportTo}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
              {reportLoading ? 'Loading…' : 'Apply date range'}
            </button>
            {report && <p className="text-[11px] text-slate-500">Complete report · {report.range.days} day(s) · generated {new Date(report.generatedAt).toLocaleString()}</p>}
          </div>

          {reportError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{reportError}</p>}
          {reportLoading && !report ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading Concierge analytics…</p>
          ) : !report ? (
            <p className="py-8 text-center text-sm text-slate-500">No verified report is available. Adjust the date range or retry.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Total enquiries</p>
                  <p className="mt-2 text-2xl font-black text-slate-900">{report.enquiries.total.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Open enquiries</p>
                  <p className="mt-2 text-2xl font-black text-amber-700">{report.enquiries.open.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Completed enquiries</p>
                  <p className="mt-2 text-2xl font-black text-emerald-700">{report.enquiries.completed.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Service audit events</p>
                  <p className="mt-2 text-2xl font-black text-indigo-700">{report.audit.totalEvents.toLocaleString()}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Services total</p><p className="mt-1 text-lg font-black text-slate-900">{report.catalogue.totalServices}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Active</p><p className="mt-1 text-lg font-black text-emerald-700">{report.catalogue.activeServices}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Paused</p><p className="mt-1 text-lg font-black text-amber-700">{report.catalogue.pausedServices}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Deleted (retained)</p><p className="mt-1 text-lg font-black text-slate-700">{report.catalogue.deletedServices}</p></div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <h3 className="text-sm font-bold text-slate-900">Enquiry trend ({report.range.trendGrouping === 'day' ? 'daily' : 'monthly'})</h3>
                  {!report.trend.length ? <p className="py-6 text-center text-xs text-slate-500">No enquiries in this date range.</p> : (
                    <div className="mt-4 space-y-3">
                      {report.trend.map(point => {
                        const max = Math.max(1, ...report.trend.map(item => item.enquiries));
                        return (
                          <div key={point.period} className="grid grid-cols-[76px_minmax(0,1fr)_32px] items-center gap-2">
                            <span className="text-[11px] font-semibold text-slate-500">{point.period}</span>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-indigo-500" style={{ width: ((point.enquiries / max) * 100) + '%' }} />
                            </div>
                            <span className="text-right text-xs font-bold tabular-nums text-slate-700">{point.enquiries}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <h3 className="text-sm font-bold text-slate-900">Enquiry status breakdown</h3>
                  <div className="mt-3 space-y-2">
                    {statuses.map(([value, label]) => (
                      <div key={value} className="flex items-center justify-between border-b border-slate-100 py-2 text-xs">
                        <span className="text-slate-600">{label}</span>
                        <span className="font-bold tabular-nums text-slate-900">{(report.enquiries.byStatus[value] || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-slate-500">Cancelled enquiries are tracked separately and are not counted as completed.</p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <div className="p-4">
                  <h3 className="text-sm font-bold text-slate-900">Service interest report</h3>
                  <p className="mt-1 text-[11px] text-slate-500">Price labels are the snapshots customers saw when they enquired.</p>
                </div>
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
                    <tr><th className="p-3">Service</th><th className="p-3">Enquiries</th><th className="p-3">New</th><th className="p-3">In progress</th><th className="p-3">Completed</th><th className="p-3">Cancelled</th><th className="p-3">Price labels</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {!report.serviceBreakdown.length ? (
                      <tr><td colSpan={7} className="p-5 text-center text-slate-500">No service enquiries in this date range.</td></tr>
                    ) : report.serviceBreakdown.map(item => (
                      <tr key={item.serviceId || item.serviceTitle}>
                        <td className="p-3 font-bold text-slate-900">{item.serviceTitle}</td>
                        <td className="p-3 font-bold tabular-nums">{item.enquiries}</td>
                        <td className="p-3 tabular-nums">{item.statusCounts.new || 0}</td>
                        <td className="p-3 tabular-nums">{(item.statusCounts.contacted || 0) + (item.statusCounts.in_progress || 0)}</td>
                        <td className="p-3 tabular-nums">{item.statusCounts.completed || 0}</td>
                        <td className="p-3 tabular-nums">{item.statusCounts.cancelled || 0}</td>
                        <td className="max-w-[220px] whitespace-normal p-3 text-slate-600">{item.priceLabels.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <h3 className="text-sm font-bold text-slate-900">Service management activity</h3>
                  {Object.keys(report.audit.byAction).length === 0 ? <p className="py-5 text-xs text-slate-500">No catalogue changes were audited in this date range.</p> : (
                    <div className="mt-3 space-y-2">
                      {Object.entries(report.audit.byAction).map(([action, count]) => (
                        <div key={action} className="flex items-center justify-between border-b border-slate-100 py-2 text-xs">
                          <span className="capitalize text-slate-600">{action.replace(/_/g, ' ')}</span>
                          <span className="font-bold tabular-nums text-slate-900">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <h3 className="text-sm font-bold text-slate-900">Recent audit events</h3>
                  {!report.audit.recentEvents.length ? <p className="py-5 text-xs text-slate-500">No audit events in this date range.</p> : (
                    <div className="mt-3 space-y-2">
                      {report.audit.recentEvents.map((event, index) => (
                        <div key={event.serviceId + ':' + event.createdAt + ':' + index} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-xs">
                          <span className="font-semibold capitalize text-slate-700">{event.action}</span>
                          <span className="text-right text-slate-500">{new Date(event.createdAt).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <p className="rounded-xl bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
                {report.revenueNote} This report measures enquiries and catalogue activity; it does not claim that a customer paid or that a booking was fulfilled.
              </p>
            </>
          )}
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
