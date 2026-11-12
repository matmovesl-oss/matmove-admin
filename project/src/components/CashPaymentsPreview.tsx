import { useMemo, useState } from 'react';

type PaymentRow = {
  id: string;
  kind: 'cash_ride' | 'guest_ussd';
  reference: string;
  service: string;
  payer: string;
  channel: string;
  fareMinor: number;
  driverCashMinor: number;
  feeMinor: number;
  feeState: string;
  cashState: string;
  status: 'pending' | 'in_progress' | 'completed' | 'review';
  updated: string;
  note: string;
};

const seed: PaymentRow[] = [
  { id: 'demo-cash-01', kind: 'cash_ride', reference: 'CASH-DEMO-1001', service: 'Ride · Keke', payer: 'Demo rider', channel: 'Cash + SLE wallet', fareMinor: 10000, driverCashMinor: 8500, feeMinor: 1500, feeState: 'Reserved (mock)', cashState: 'Awaiting dual confirmation', status: 'in_progress', updated: 'Today · 09:20', note: 'Awaiting driver and customer confirmation of cash handover.' },
  { id: 'demo-cash-02', kind: 'cash_ride', reference: 'CASH-DEMO-1002', service: 'Ride · Car', payer: 'Demo rider', channel: 'Cash + SLE wallet', fareMinor: 25000, driverCashMinor: 21250, feeMinor: 3750, feeState: 'Captured (mock)', cashState: 'Driver + customer confirmed', status: 'completed', updated: 'Today · 08:45', note: 'Fee capture and cash receipt are mock-only.' },
  { id: 'demo-ussd-01', kind: 'guest_ussd', reference: 'MM-GUEST-8A3K', service: 'WhatsApp · Package', payer: 'Guest · +232 *** **21', channel: 'Afrimoney USSD', fareMinor: 6500, driverCashMinor: 0, feeMinor: 0, feeState: 'Provider pending (mock)', cashState: 'Not applicable', status: 'pending', updated: 'Today · 08:51', note: 'Guest entered reference. Waiting for verified provider payment event.' },
  { id: 'demo-ussd-02', kind: 'guest_ussd', reference: 'MM-GUEST-4M2Q', service: 'Merchant order · Food', payer: 'Guest · +232 *** **84', channel: 'Orange Money USSD', fareMinor: 12500, driverCashMinor: 0, feeMinor: 0, feeState: 'Paid (mock)', cashState: 'Not applicable', status: 'completed', updated: 'Yesterday · 17:12', note: 'Mock completed payment; no merchant settlement was initiated.' },
  { id: 'demo-cash-03', kind: 'cash_ride', reference: 'CASH-DEMO-1003', service: 'Ride · Bike', payer: 'Demo rider', channel: 'Cash + SLE wallet', fareMinor: 8000, driverCashMinor: 6800, feeMinor: 1200, feeState: 'Review required (mock)', cashState: 'Cash amount disputed', status: 'review', updated: 'Yesterday · 15:30', note: 'Dispute mock. Fee must remain held until an audited resolution.' },
];

const money = (minor: number) => 'SLE ' + (minor / 100).toLocaleString('en-SL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusClass = (status: PaymentRow['status']) => status === 'completed' ? 'bg-emerald-50 text-emerald-800' : status === 'review' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800';

export default function CashPaymentsPreview() {
  const [rows, setRows] = useState(seed);
  const [filter, setFilter] = useState<'all' | 'cash_ride' | 'guest_ussd'>('all');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const visible = useMemo(() => rows.filter(row => {
    const matchesKind = filter === 'all' || row.kind === filter;
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [row.reference, row.service, row.payer, row.channel, row.status].some(v => v.toLowerCase().includes(term));
    return matchesKind && matchesSearch;
  }), [rows, filter, search]);
  const cashRows = rows.filter(r => r.kind === 'cash_ride');
  const guestRows = rows.filter(r => r.kind === 'guest_ussd');
  const totals = cashRows.reduce((sum, r) => ({ fare: sum.fare + r.fareMinor, cash: sum.cash + r.driverCashMinor, fee: sum.fee + r.feeMinor }), { fare: 0, cash: 0, fee: 0 });
  const guestPaid = guestRows.filter(r => r.status === 'completed').reduce((sum, r) => sum + r.fareMinor, 0);
  const reviewCount = rows.filter(r => r.status === 'review').length;

  function simulateReview(id: string) {
    setRows(current => current.map(row => row.id === id && row.status === 'review' ? { ...row, note: 'Reviewed in local demo only; no settlement action was performed.' } : row));
    setNotice('Demo note updated locally. No database, wallet, payment or cash ledger was changed.');
  }

  return (
    <section aria-label="Cash and USSD payment preview" className="mb-6 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Cash & Guest USSD Collections</h2>
          <p className="mt-1 text-xs text-slate-500">Finance overview · Cash due to drivers is separate from MatMove digital fees.</p>
        </div>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900">Mock data only</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Cash ride gross fare</p><p className="mt-1 text-lg font-bold">{money(totals.fare)}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Physical cash due to drivers</p><p className="mt-1 text-lg font-bold text-emerald-700">{money(totals.cash)}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">MatMove fee allocation (15%)</p><p className="mt-1 text-lg font-bold text-blue-700">{money(totals.fee)}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Guest USSD paid (mock)</p><p className="mt-1 text-lg font-bold">{money(guestPaid)}</p><p className="text-[10px] text-slate-500">{reviewCount} cash/USSD exception(s)</p></div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">Search reference, service or payer
          <input value={search} onChange={e => setSearch(e.target.value)} className="mt-1 w-full rounded-lg border p-2.5 text-sm font-normal" placeholder="e.g. CASH-DEMO-1001" />
        </label>
        <label className="text-xs font-semibold text-slate-600">Collection type
          <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)} className="mt-1 min-h-10 rounded-lg border bg-white px-3 text-sm">
            <option value="all">All mock records</option>
            <option value="cash_ride">Cash rides</option>
            <option value="guest_ussd">Guest USSD</option>
          </select>
        </label>
      </div>

      <div className="mt-4 space-y-3">
        {visible.map(row => (
          <article key={row.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-all text-sm font-bold text-slate-900">{row.reference}</p>
                <p className="mt-0.5 text-xs text-slate-500">{row.service} · {row.payer} · {row.updated}</p>
              </div>
              <span className={'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ' + statusClass(row.status)}>{row.status.replace('_', ' ')}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div><p className="text-slate-500">Payment channel</p><p className="mt-0.5 font-semibold">{row.channel}</p></div>
              <div><p className="text-slate-500">Fare / order total</p><p className="mt-0.5 font-semibold">{money(row.fareMinor)}</p></div>
              {row.kind === 'cash_ride' ? <>
                <div><p className="text-slate-500">Cash due to driver</p><p className="mt-0.5 font-semibold text-emerald-700">{money(row.driverCashMinor)}</p></div>
                <div><p className="text-slate-500">MatMove fee</p><p className="mt-0.5 font-semibold text-blue-700">{money(row.feeMinor)} · {row.feeState}</p></div>
              </> : <div className="col-span-2"><p className="text-slate-500">Provider confirmation</p><p className="mt-0.5 font-semibold">{row.feeState}</p></div>}
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">{row.note}</p>
            {row.status === 'review' && <button type="button" onClick={() => simulateReview(row.id)} className="mt-2 min-h-10 rounded-lg border px-3 text-xs font-bold">Add local demo review note</button>}
          </article>
        ))}
        {!visible.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No mock records match this filter.</p>}
      </div>
      {notice && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{notice}</p>}
      <p className="mt-4 border-t pt-3 text-[11px] leading-5 text-amber-900">This preview uses seeded demonstration records only. It is not connected to the live admin feed, Supabase, Monime or settlement controls. Live finance access and posting remain disabled until the dedicated cash/USSD ledgers, API verification and migration gates are completed.</p>
    </section>
  );
}
