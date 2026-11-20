import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Leg = {
  status: string;
  transferId: string | null;
  verifiedAt: string | null;
  errorCode: string | null;
};
type Person = { id: string; name: string; phoneLastFour: string | null };
type AuditEvent = { eventType: string; actorType: string; actorName: string; createdAt: string; reasonCode: string | null; legKind: string | null };
type CashRecord = {
  bookingReference: string;
  rider: Person | null;
  driver: Person | null;
  auditEvents: AuditEvent[];
  fareMinor: number;
  driverCashMinor: number;
  feeMinor: number;
  currency: 'SLE';
  status: string;
  driverCashConfirmedAt: string | null;
  riderCashConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reserve: Leg | null;
  capture: Leg | null;
  refund: Leg | null;
};
type Summary = {
  recordCount: number;
  settledCount: number;
  reviewCount: number;
  settledFareMinor: number;
  confirmedDriverCashMinor: number;
  reservedFeeMinor: number;
  capturedFeeMinor: number;
  refundedFeeMinor: number;
};

const CASH_BOOKING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money = (minor: number) => `SLE ${(minor / 100).toLocaleString('en-SL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const time = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not confirmed';
const emptySummary: Summary = {
  recordCount: 0, settledCount: 0, reviewCount: 0, settledFareMinor: 0,
  confirmedDriverCashMinor: 0, reservedFeeMinor: 0, capturedFeeMinor: 0, refundedFeeMinor: 0
};

function State({ value }: { value: string }) {
  const tone = value === 'settled' || value === 'completed'
    ? 'bg-emerald-50 text-emerald-800'
    : value === 'review_required' || value === 'failed'
      ? 'bg-red-50 text-red-800'
      : 'bg-amber-50 text-amber-800';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{value.replace(/_/g, ' ')}</span>;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <div className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</div>
  </div>;
}

function LegDetail({ title, leg }: { title: string; leg: Leg | null }) {
  return <div className="rounded-xl border border-slate-200 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-bold text-slate-900">{title}</p>
      <State value={leg?.status || 'not_created'} />
    </div>
    <p className="mt-2 break-all text-xs text-slate-600">Provider reference: {leg?.transferId || 'Not available'}</p>
    <p className="mt-1 text-xs text-slate-600">Verified: {time(leg?.verifiedAt || null)}</p>
    {leg?.errorCode && <p className="mt-1 text-xs font-semibold text-rose-700">Provider error: {leg.errorCode}</p>}
  </div>;
}

export default function CashCollectionsManager() {
  const [records, setRecords] = useState<CashRecord[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(false);
  const [cashEnabled, setCashEnabled] = useState(false);
  const [providerEnvironment, setProviderEnvironment] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchNotice, setSearchNotice] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<CashRecord | null>(null);
  const [feeAccounts, setFeeAccounts] = useState<{ holdingAccount: string | null; revenueAccount: string | null; escrowMatchesDeployment: boolean; revenueMatchesDeployment: boolean }>({
    holdingAccount: null, revenueAccount: null, escrowMatchesDeployment: false, revenueMatchesDeployment: false
  });

  const load = useCallback(async (bookingReference = '') => {
    setLoading(true);
    setError('');
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) throw new Error('Sign in again to view cash collections.');
      const query = new URLSearchParams({ view: 'cash-collections' });
      if (bookingReference) query.set('bookingReference', bookingReference);
      const response = await fetch(`/api/get-all-transactions?${query.toString()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: 'no-store'
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.available !== true) {
        throw new Error(result?.error || 'Cash collection report is unavailable.');
      }
      if (!Array.isArray(result.records) || !result.summary) {
        throw new Error('Cash collection report returned an invalid response.');
      }
      setRecords(result.records);
      setSummary(result.summary);
      setCashEnabled(result.cashEnabled === true);
      setProviderEnvironment(typeof result.providerEnvironment === 'string' ? result.providerEnvironment : null);
      const configured = result.feeAccounts;
      setFeeAccounts({
        holdingAccount: typeof configured?.holdingAccount === 'string' ? configured.holdingAccount : null,
        revenueAccount: typeof configured?.revenueAccount === 'string' ? configured.revenueAccount : null,
        escrowMatchesDeployment: configured?.escrowMatchesDeployment === true,
        revenueMatchesDeployment: configured?.revenueMatchesDeployment === true
      });
      setAvailable(true);
      setSearchNotice(bookingReference ? 'Exact booking-reference lookup completed.' : '');
    } catch (err) {
      // Keep the last successful report on screen during connection or provider outages.
      setError(err instanceof Error ? err.message : 'Cash collection report is unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return records;
    return records.filter(row => [
      row.bookingReference, row.rider?.name, row.driver?.name, row.status,
      row.rider?.phoneLastFour ? `rider ${row.rider.phoneLastFour}` : '',
      row.driver?.phoneLastFour ? `driver ${row.driver.phoneLastFour}` : '',
      row.reserve?.transferId, row.capture?.transferId, row.refund?.transferId
    ].some(value => String(value || '').toLowerCase().includes(term)));
  }, [records, search]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = search.trim();
    if (!term) {
      setSearchNotice('');
      void load();
      return;
    }
    if (CASH_BOOKING_ID.test(term)) {
      void load(term);
      return;
    }
    setSearchNotice(`Showing matches in the latest ${records.length} loaded cash records. Enter a complete booking reference to search older records too.`);
  }

  return (
    <section aria-label="Cash collection manager" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Physical Cash Collection Manager</h2>
          <p className="mt-1 text-xs text-slate-500">Latest 100 SLE cash rides · View each payment's full details and audit trail · Read-only reconciliation</p>
        </div>
        <button type="button" onClick={() => void load(CASH_BOOKING_ID.test(search.trim()) ? search.trim() : '')} disabled={loading} className="min-h-10 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50">
          {loading ? 'Refreshing…' : 'Refresh collections'}
        </button>
      </div>

      <form onSubmit={submitSearch} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search cash payments</span>
          <span className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
            <Search size={17} className="shrink-0 text-slate-400" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Booking reference, rider, driver or phone ending" className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm outline-none focus:ring-0" />
            {search && <button type="button" aria-label="Clear search" onClick={() => { setSearch(''); setSearchNotice(''); void load(); }} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={16}/></button>}
          </span>
        </label>
        <button type="submit" disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white disabled:opacity-50">Search payments</button>
      </form>
      <p className="mt-2 text-[11px] leading-5 text-slate-500">Name and phone searches filter the latest 100 records. A complete booking reference searches that specific payment, including records outside the latest 100.</p>
      {searchNotice && <p role="status" className="mt-2 text-xs text-slate-600">{searchNotice}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error} {available ? 'Showing the last successfully loaded report.' : ''}</p>}

      {available && <>
        <p className={cashEnabled ? "mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" : "mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"}>
          {cashEnabled ? 'Cash collection is enabled and the Admin deployment matches the shared fee-account configuration in ' + (providerEnvironment || 'Monime') + '.' : 'Cash collection is disabled or its fee-account configuration does not match. No new physical-cash rides should be dispatched.'}
        </p>
        <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
          <div className="rounded-lg border p-3"><p className="text-slate-500">Restricted holding account</p><p className="mt-1 break-all font-mono font-semibold">{feeAccounts.holdingAccount || 'Not configured'}</p></div>
          <div className="rounded-lg border p-3"><p className="text-slate-500">Final MatMove fee account</p><p className="mt-1 break-all font-mono font-semibold">{feeAccounts.revenueAccount || 'Not configured'}</p></div>
          <div className="rounded-lg border p-3"><p className="text-slate-500">Admin / deployment match</p><p className={feeAccounts.escrowMatchesDeployment && feeAccounts.revenueMatchesDeployment ? 'mt-1 font-semibold text-emerald-700' : 'mt-1 font-semibold text-amber-800'}>{feeAccounts.escrowMatchesDeployment && feeAccounts.revenueMatchesDeployment ? 'Both accounts confirmed' : 'Account mismatch'}</p></div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Confirmed cash rides</p><p className="mt-1 text-xl font-bold">{summary.settledCount}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Physical cash confirmed to drivers</p><p className="mt-1 text-lg font-bold">{money(summary.confirmedDriverCashMinor)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">MatMove fee currently reserved</p><p className="mt-1 text-lg font-bold">{money(summary.reservedFeeMinor)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">MatMove fee captured</p><p className="mt-1 text-lg font-bold">{money(summary.capturedFeeMinor)}</p></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600"><span>Records: {summary.recordCount}</span><span>Review required: {summary.reviewCount}</span><span>Fees refunded: {money(summary.refundedFeeMinor)}</span><span>Confirmed fare total: {money(summary.settledFareMinor)}</span></div>

        <div className="mt-4 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr>
              <th className="p-3">Booking reference</th><th className="p-3">Rider</th><th className="p-3">Driver</th>
              <th className="p-3">Fare</th><th className="p-3">Ledger state</th><th className="p-3">Last updated</th><th className="p-3">Details</th>
            </tr></thead>
            <tbody className="divide-y">
              {visibleRecords.map(row => <tr key={row.bookingReference}>
                <td className="p-3 font-mono text-xs">{row.bookingReference.slice(0, 8)}…</td>
                <td className="p-3 text-xs"><span className="block max-w-40 truncate font-semibold">{row.rider?.name || 'Unavailable'}</span><span className="text-slate-500">{row.rider?.phoneLastFour ? `•••• ${row.rider.phoneLastFour}` : 'Phone unavailable'}</span></td>
                <td className="p-3 text-xs"><span className="block max-w-40 truncate font-semibold">{row.driver?.name || 'Not assigned'}</span><span className="text-slate-500">{row.driver?.phoneLastFour ? `•••• ${row.driver.phoneLastFour}` : 'Phone unavailable'}</span></td>
                <td className="p-3 font-semibold">{money(row.fareMinor)}</td>
                <td className="p-3"><State value={row.status}/></td>
                <td className="p-3 text-xs text-slate-600">{time(row.updatedAt)}</td>
                <td className="p-3"><button type="button" onClick={() => setSelectedRecord(row)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"><Eye size={14}/> View</button></td>
              </tr>)}
              {!visibleRecords.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">{search ? 'No cash payments match your search.' : 'No cash collection records have been recorded.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">This report separates physical cash confirmed to drivers from MatMove digital fee reservations, captures and refunds. Opening a payment is read-only; it does not initiate transfers or resolve reviews.</p>
      </>}

      {loading && <p className="mt-4 text-sm text-slate-500">Loading verified cash collection records…</p>}

      {selectedRecord && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-3 sm:p-5" onClick={event => { if (event.target === event.currentTarget) setSelectedRecord(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="cash-payment-detail-title" className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Physical cash payment</p><h3 id="cash-payment-detail-title" className="mt-1 text-lg font-black text-slate-950">Payment details</h3><p className="mt-1 break-all font-mono text-xs text-slate-500">{selectedRecord.bookingReference}</p></div>
            <button type="button" aria-label="Close payment details" onClick={() => setSelectedRecord(null)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><X size={19}/></button>
          </header>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-3"><State value={selectedRecord.status}/><span className="text-xs text-slate-500">Created {time(selectedRecord.createdAt)} · Updated {time(selectedRecord.updatedAt)}</span></div>
            <section><h4 className="mb-2 text-sm font-bold text-slate-900">People and fare</h4><div className="grid gap-2 sm:grid-cols-2">
              <Detail label="Rider" value={<>{selectedRecord.rider?.name || 'Unavailable'}<span className="block text-xs font-normal text-slate-500">{selectedRecord.rider?.id || 'Rider ID unavailable'} · {selectedRecord.rider?.phoneLastFour ? `Phone ending ${selectedRecord.rider.phoneLastFour}` : 'Phone unavailable'}</span></>}/>
              <Detail label="Driver" value={<>{selectedRecord.driver?.name || 'Not assigned'}<span className="block text-xs font-normal text-slate-500">{selectedRecord.driver?.id || 'Driver ID unavailable'} · {selectedRecord.driver?.phoneLastFour ? `Phone ending ${selectedRecord.driver.phoneLastFour}` : 'Phone unavailable'}</span></>}/>
              <Detail label="Total fare" value={money(selectedRecord.fareMinor)}/>
              <Detail label="Cash due to driver" value={money(selectedRecord.driverCashMinor)}/>
              <Detail label="MatMove fee allocation" value={money(selectedRecord.feeMinor)}/>
              <Detail label="Currency" value={selectedRecord.currency}/>
            </div></section>
            <section><h4 className="mb-2 text-sm font-bold text-slate-900">Cash handover confirmations</h4><div className="grid gap-2 sm:grid-cols-2">
              <Detail label="Driver confirmed" value={time(selectedRecord.driverCashConfirmedAt)}/>
              <Detail label="Rider confirmed" value={time(selectedRecord.riderCashConfirmedAt)}/>
            </div></section>
            <section><h4 className="mb-2 text-sm font-bold text-slate-900">Fee reserve, capture and refund</h4><div className="grid gap-2 md:grid-cols-3">
              <LegDetail title="Reserve" leg={selectedRecord.reserve}/>
              <LegDetail title="Capture" leg={selectedRecord.capture}/>
              <LegDetail title="Refund" leg={selectedRecord.refund}/>
            </div></section>
            <section><h4 className="mb-2 text-sm font-bold text-slate-900">Audit history</h4>
              {selectedRecord.auditEvents.length ? <div className="space-y-2">{selectedRecord.auditEvents.map((event,index) => <article key={event.eventType + event.createdAt + index} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-slate-900">{event.eventType.replace(/_/g, ' ')}</p><span className="text-[11px] text-slate-500">{time(event.createdAt)}</span></div>
                <p className="mt-1 text-xs text-slate-600">Actor: {event.actorName} · {event.actorType}{event.legKind ? ` · ${event.legKind}` : ''}</p>
                {event.reasonCode && <p className="mt-1 text-xs font-semibold text-rose-700">Reason: {event.reasonCode}</p>}
              </article>)}</div> : <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">No audit events are recorded for this payment.</p>}
            </section>
          </div>
          <footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-3 text-right sm:px-6"><button type="button" onClick={() => setSelectedRecord(null)} className="min-h-10 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white">Close details</button></footer>
        </section>
      </div>}
    </section>
  );
}
