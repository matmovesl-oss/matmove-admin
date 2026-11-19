import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, Save, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { useAdminAccess } from '@/lib/adminAccess';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';

type Overview = {
  actor: string;
  owner: boolean;
  campaign: { revision: string; enabled: boolean; minimumTopupMinor: string; cashbackBps: 100; budgetMinor: string; source: string | null };
  totals: { rewards: string; pendingMinor: string; completedMinor: string; reviewMinor: string; reservedMinor: string };
};

function toMinor(value: string) {
  const clean = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) throw new Error('Enter an amount with up to two decimal places.');
  const [whole, fraction = ''] = clean.split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (result > 9000000000000000n) throw new Error('Amount is too large.');
  return result.toString();
}
function fromMinor(value: string) {
  if (!/^\d+$/.test(value)) return '0.00';
  const n = BigInt(value);
  return `${(n / 100n).toString()}.${(n % 100n).toString().padStart(2, '0')}`;
}
function money(value: string) { return `SLE ${fromMinor(value)}`; }

export default function LoadingBonanzaPage() {
  const access = useAdminAccess();
  const actor = access?.id || '';
  const [overview, setOverview] = useState<Overview | null>(null);
  const [minimum, setMinimum] = useState('50.00');
  const [budget, setBudget] = useState('0.00');
  const [enabled, setEnabled] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [fundingAmount, setFundingAmount] = useState('0.00');
  const [fundingConfirmed, setFundingConfirmed] = useState(false);
  const [fundingBusy, setFundingBusy] = useState(false);
  const [fundingRequestId, setFundingRequestId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const request = useCallback(async (view: string, method = 'GET', body?: unknown) => {
    const before = await supabase.auth.getSession();
    const session = before.data.session;
    if (before.error || !session || session.user.id !== actor) throw new Error('Your Admin sign-in changed. Reopen Loading Bonanza.');
    const response = await fetch(`/api/admin-staff?view=${view}&actor=${encodeURIComponent(actor)}`, {
      method,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    const after = await supabase.auth.getSession();
    if (after.error || after.data.session?.user.id !== actor) throw new Error('Your Admin sign-in changed. Reopen Loading Bonanza.');
    if (!response.ok) throw new Error(result.error || 'Loading Bonanza request failed.');
    return result;
  }, [actor]);

  const reload = useCallback(async () => {
    if (!actor) return;
    setLoading(true); setError('');
    try {
      const data = await request('loading-bonanza-overview');
      if (data.actor !== actor || !data.campaign || data.campaign.cashbackBps !== 100) throw new Error('Loading Bonanza settings could not be verified.');
      setOverview(data);
      setMinimum(fromMinor(data.campaign.minimumTopupMinor));
      setBudget(fromMinor(data.campaign.budgetMinor));
      setEnabled(data.campaign.enabled);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load Loading Bonanza.'); }
    finally { setLoading(false); }
  }, [actor, request]);

  useEffect(() => { void reload(); }, [reload]);

  async function save() {
    if (!overview || !access?.is_owner || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const minimumTopupMinor = toMinor(minimum);
      const budgetMinor = toMinor(budget);
      if (!reason.trim() || reason.trim().length < 3) throw new Error('Enter a reason for this campaign change.');
      if (!confirmed) throw new Error('Confirm the exact settings before saving.');
      const data = await request('loading-bonanza-settings', 'POST', {
        requestId: crypto.randomUUID(),
        expectedRevision: overview.campaign.revision,
        enabled,
        minimumTopupMinor,
        budgetMinor,
        reason: reason.trim(),
        confirmed: true
      });
      if (data.saved !== true || data.actor !== actor) throw new Error('Settings save was not confirmed.');
      setNotice('Loading Bonanza settings saved.');
      setReason(''); setConfirmed(false);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save Loading Bonanza settings.'); }
    finally { setBusy(false); }
  }


  async function fundTreasury() {
    if (!editable || fundingBusy) return;
    setFundingBusy(true); setError(''); setNotice('');
    const requestId = fundingRequestId || crypto.randomUUID();
    setFundingRequestId(requestId);
    try {
      const amountMinor = toMinor(fundingAmount);
      if (BigInt(amountMinor) <= 0n) throw new Error('Enter a funding amount greater than zero.');
      if (!fundingConfirmed) throw new Error('Confirm the exact transfer from the MatMove main account to the referral account.');
      const result = await request('loading-bonanza-fund', 'POST', {
        requestId, amountMinor, confirmed: true
      });
      if (result.id !== requestId || !['processing','completed','failed','review_required'].includes(result.state)) {
        throw new Error('Referral treasury funding receipt was not confirmed.');
      }
      setNotice(result.state === 'completed' ? 'Referral treasury funding completed and verified by Monime.' :
        result.state === 'processing' ? 'Funding transfer is processing. MatMove will reconcile the original transfer; do not submit it again.' :
        'Funding needs receipt review. No replacement transfer was created.');
      setFundingRequestId('');
      setFundingConfirmed(false);
      if (result.state === 'completed') setFundingAmount('0.00');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Referral treasury funding could not be confirmed.');
    } finally { setFundingBusy(false); }
  }

  const editable = access?.is_owner === true;
  return <AdminLayout title="Loading Bonanza" subtitle="Manage the fixed 1% cashback promotion for completed Monime wallet top-ups.">
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><Sparkles size={22}/></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-slate-950">Cashback rules</h2>
            <p className="mt-1 text-sm text-slate-600">Customers receive 1% of the amount actually credited to their SLE wallet, only after Monime and MatMove both confirm the top-up as completed.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[['SLE 50.00','SLE 0.50'],['SLE 100.00','SLE 1.00'],['SLE 500.00','SLE 5.00']].map(([topup,reward])=><div key={topup} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500">Top-up {topup}</p><p className="mt-1 text-lg font-black text-emerald-700">{reward}</p><p className="text-[11px] text-slate-500">1% cashback</p></div>)}
            </div>
          </div>
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{notice}</div>}

      <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-black text-slate-950">Campaign settings</h2><p className="text-sm text-slate-500">The cashback rate is fixed at 1%. Only eligibility and campaign budget are adjustable.</p></div>
          <button type="button" onClick={() => void reload()} disabled={loading || busy} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-slate-600 disabled:opacity-50" aria-label="Refresh campaign"><RefreshCw size={17}/></button>
        </div>
        {loading ? <p className="py-8 text-sm text-slate-500">Loading campaign settings…</p> : overview ? <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">Minimum qualifying top-up (SLE)</span><input inputMode="decimal" value={minimum} onChange={e=>setMinimum(e.target.value)} disabled={!editable || busy} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-emerald-600 disabled:bg-slate-100" placeholder="50.00"/></label>
            <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">Campaign cashback budget (SLE)</span><input inputMode="decimal" value={budget} onChange={e=>setBudget(e.target.value)} disabled={!editable || busy} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-emerald-600 disabled:bg-slate-100" placeholder="0.00"/></label>
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3"><div><p className="font-bold text-slate-800">Promotion status</p><p className="text-xs text-slate-500">Disabled by default. Completed top-ups only.</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${enabled?'bg-emerald-100 text-emerald-800':'bg-slate-100 text-slate-600'}`}>{enabled?'Enabled':'Paused'}</span></div>
            <label className={`mt-4 flex items-center gap-3 ${editable?'cursor-pointer':'cursor-not-allowed opacity-60'}`}><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} disabled={!editable || busy} className="h-5 w-5 accent-emerald-700"/><span className="text-sm font-semibold text-slate-700">Enable Loading Bonanza cashback</span></label>
          </div>
          <div className="mt-4 flex items-start gap-3 rounded-xl bg-slate-50 p-4"><Wallet size={19} className="mt-0.5 shrink-0 text-slate-500"/><div className="min-w-0"><p className="text-sm font-bold text-slate-800">Funding source</p><p className="break-all text-xs text-slate-500">{overview.campaign.source || 'Referral treasury not configured'}</p><p className="mt-1 text-xs text-slate-500">Cashback transfers are paid from the separate Monime referral account. The budget limits total rewards; it does not move money into that account.</p></div></div>
          {editable && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <h3 className="font-bold text-slate-900">Fund referral treasury</h3>
            <p className="mt-1 text-xs text-slate-600">Transfer funds from the MatMove main Monime account into the dedicated referral account. This is a real money movement and is separate from the campaign reward budget.</p>
            <label className="mt-3 block"><span className="mb-1.5 block text-sm font-bold text-slate-700">Amount to transfer (SLE)</span><input inputMode="decimal" value={fundingAmount} onChange={e=>setFundingAmount(e.target.value)} disabled={fundingBusy} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-emerald-600" placeholder="100.00"/></label>
            <label className="mt-3 flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={fundingConfirmed} onChange={e=>setFundingConfirmed(e.target.checked)} disabled={fundingBusy} className="mt-0.5 h-4 w-4 accent-emerald-700"/><span>I authorize this exact amount to move from the MatMove main account to the referral treasury. I understand an uncertain provider response will be held for receipt review, not resent.</span></label>
            <button type="button" onClick={()=>void fundTreasury()} disabled={fundingBusy || !fundingConfirmed} className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-700 px-5 font-bold text-white disabled:opacity-50">{fundingBusy?<RefreshCw size={16} className="animate-spin"/>:<Wallet size={16}/>}Fund referral account</button>
          </div>}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Completed cashback</p><p className="mt-1 text-xl font-black">{money(overview.totals.completedMinor)}</p></div>
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Pending cashback</p><p className="mt-1 text-xl font-black">{money(overview.totals.pendingMinor)}</p></div>
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Reserved cashback</p><p className="mt-1 text-xl font-black">{money(overview.totals.reservedMinor)}</p></div>
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Review required</p><p className="mt-1 text-xl font-black">{money(overview.totals.reviewMinor)}</p></div>
          </div>
          {editable && <div className="mt-5 space-y-3 border-t pt-5">
            <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">Reason for change</span><textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} maxLength={500} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-600" placeholder="Explain why the campaign settings are changing."/></label>
            <label className="flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-700"/><span>I confirm the minimum top-up, 1% cashback rate, campaign budget and promotion status shown above.</span></label>
            <button type="button" onClick={()=>void save()} disabled={busy || !confirmed} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 font-bold text-white disabled:opacity-50">{busy?<RefreshCw size={16} className="animate-spin"/>:<Save size={16}/>}Save campaign settings</button>
          </div>}
          {!editable && <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={15}/>Only the account owner can change these settings.</p>}
        </> : <p className="py-8 text-sm text-slate-500">Campaign settings are unavailable.</p>}
      </section>
    </div>
  </AdminLayout>;
}
