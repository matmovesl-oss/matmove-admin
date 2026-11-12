import { useCallback, useEffect, useState } from 'react';
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

const money = (minor: number) => `SLE ${(minor / 100).toLocaleString('en-SL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const time = (value: string | null) => value
  ? new Date(value).toLocaleString()
  : 'Not confirmed';

const emptySummary: Summary = {
  recordCount: 0,
  settledCount: 0,
  reviewCount: 0,
  settledFareMinor: 0,
  confirmedDriverCashMinor: 0,
  reservedFeeMinor: 0,
  capturedFeeMinor: 0,
  refundedFeeMinor: 0
};

function State({value}:{value:string}) {
  const tone = value === 'settled' || value === 'completed'
    ? 'bg-emerald-50 text-emerald-800'
    : value === 'review_required' || value === 'failed'
      ? 'bg-red-50 text-red-800'
      : 'bg-amber-50 text-amber-800';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{value.replace(/_/g,' ')}</span>;
}

export default function CashCollectionsManager() {
  const [records,setRecords] = useState<CashRecord[]>([]);
  const [summary,setSummary] = useState<Summary>(emptySummary);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [available,setAvailable] = useState(false);
  const [cashEnabled,setCashEnabled] = useState(false);
  const [providerEnvironment,setProviderEnvironment] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const {data,error:sessionError} = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) throw new Error('Sign in again to view cash collections.');
      const response = await fetch('/api/get-all-transactions?view=cash-collections', {
        method:'GET',
        headers:{Authorization:`Bearer ${data.session.access_token}`},
        cache:'no-store'
      });
      const result = await response.json().catch(()=>null);
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
      setAvailable(true);
    } catch (err) {
      setRecords([]);
      setSummary(emptySummary);
      setCashEnabled(false);
      setProviderEnvironment(null);
      setAvailable(false);
      setError(err instanceof Error ? err.message : 'Cash collection report is unavailable.');
    } finally {
      setLoading(false);
    }
  },[]);

  useEffect(()=>{ void load(); },[load]);

  return (
    <section aria-label="Cash collection manager" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Physical Cash Collection Manager</h2>
          <p className="mt-1 text-xs text-slate-500">Latest 100 SLE cash rides · Participant details and audit trail · Read-only reconciliation view</p>
        </div>
        <button type="button" onClick={()=>void load()} disabled={loading} className="min-h-10 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50">
          {loading ? 'Refreshing…' : 'Refresh collections'}
        </button>
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}

      {available && <>
        <p className={cashEnabled ? "mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" : "mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"}>
          {cashEnabled ? 'Cash collection is enabled in the configured ' + (providerEnvironment || 'Monime') + ' environment.' : 'Cash collection is disabled. No new physical-cash rides should be dispatched.'}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Confirmed cash rides</p><p className="mt-1 text-xl font-bold">{summary.settledCount}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Physical cash confirmed to drivers</p><p className="mt-1 text-lg font-bold">{money(summary.confirmedDriverCashMinor)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">MatMove fee currently reserved</p><p className="mt-1 text-lg font-bold">{money(summary.reservedFeeMinor)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">MatMove fee captured</p><p className="mt-1 text-lg font-bold">{money(summary.capturedFeeMinor)}</p></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
          <span>Records: {summary.recordCount}</span>
          <span>Review required: {summary.reviewCount}</span>
          <span>Fees refunded: {money(summary.refundedFeeMinor)}</span>
          <span>Confirmed fare total: {money(summary.settledFareMinor)}</span>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[1250px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="p-3">Booking reference</th>
                <th className="p-3">Rider</th>
                <th className="p-3">Driver</th>
                <th className="p-3">Fare</th>
                <th className="p-3">Driver cash</th>
                <th className="p-3">MatMove fee</th>
                <th className="p-3">Ledger state</th>
                <th className="p-3">Reserve / capture / refund</th>
                <th className="p-3">Cash confirmations</th>
                <th className="p-3">Recent audit events</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {records.map(row=><tr key={row.bookingReference}>
                <td className="p-3 font-mono text-xs">{row.bookingReference.slice(0,8)}…</td>
                <td className="p-3 text-xs">
                  <div className="font-semibold">{row.rider?.name || 'Unavailable'}</div>
                  <div className="text-slate-500">ID: {row.rider?.id ? row.rider.id.slice(0,8) + '…' : '—'}</div>
                  {row.rider?.phoneLastFour && <div className="text-slate-500">Phone ending {row.rider.phoneLastFour}</div>}
                </td>
                <td className="p-3 text-xs">
                  <div className="font-semibold">{row.driver?.name || 'Not assigned'}</div>
                  <div className="text-slate-500">ID: {row.driver?.id ? row.driver.id.slice(0,8) + '…' : '—'}</div>
                  {row.driver?.phoneLastFour && <div className="text-slate-500">Phone ending {row.driver.phoneLastFour}</div>}
                </td>
                <td className="p-3 font-semibold">{money(row.fareMinor)}</td>
                <td className="p-3">{money(row.driverCashMinor)}</td>
                <td className="p-3">{money(row.feeMinor)}</td>
                <td className="p-3"><State value={row.status}/></td>
                <td className="p-3 text-xs">
                  <div>Reserve: {row.reserve?.status || 'not created'}</div>
                  <div>Capture: {row.capture?.status || 'not created'}</div>
                  <div>Refund: {row.refund?.status || 'not created'}</div>
                  {row.reserve?.transferId && <div className="mt-1 text-slate-500">Reserve ref: {row.reserve.transferId}</div>}
                  {row.capture?.transferId && <div className="text-slate-500">Capture ref: {row.capture.transferId}</div>}
                  {row.refund?.transferId && <div className="text-slate-500">Refund ref: {row.refund.transferId}</div>}
                </td>
                <td className="p-3 text-xs">
                  <div>Driver: {time(row.driverCashConfirmedAt)}</div>
                  <div>Rider: {time(row.riderCashConfirmedAt)}</div>
                </td>
                <td className="p-3 text-xs">
                  {row.auditEvents.length ? row.auditEvents.slice(0,4).map((event,index)=><div key={event.eventType + event.createdAt + index} className="mb-1 last:mb-0">
                    <span className="font-semibold">{event.eventType.replace(/_/g,' ')}</span>
                    <span className="text-slate-500"> · {event.actorName} · {time(event.createdAt)}</span>
                    {event.reasonCode && <span className="block text-rose-700">Reason: {event.reasonCode}</span>}
                  </div>) : <span className="text-slate-500">No audit events</span>}
                </td>
              </tr>)}
              {!records.length && <tr><td colSpan={10} className="p-6 text-center text-slate-500">No cash collection records have been recorded.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">This report distinguishes physical cash confirmed to drivers from MatMove digital fee reservations, captures and refunds. It does not initiate transfers or approve manual-review cases.</p>
      </>}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading verified cash collection records…</p>}
    </section>
  );
}
