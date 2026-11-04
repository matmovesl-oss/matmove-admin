import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Search, ShieldAlert, User, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';

type SelectedCustomer = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_number?: string | null;
  role?: string | null;
  wallets?: Array<{ currency: string; monime_account_id?: string | null; metadata?: Record<string, unknown> | null }>;
};

export function SpecialOperationsPage() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [userResult, setUserResult] = useState<SelectedCustomer | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [refundBalance, setRefundBalance] = useState<number | null>(null);
  const [refundAccountId, setRefundAccountId] = useState('');
  const [refundBalanceLoading, setRefundBalanceLoading] = useState(true);
  const [refundBalanceError, setRefundBalanceError] = useState('');
  const [refundRequestKey, setRefundRequestKey] = useState<string | null>(null);
  const [refundRequestLocked, setRefundRequestLocked] = useState(false);

  const refreshRefundBalance = async () => {
    setRefundBalanceLoading(true);
    setRefundBalanceError('');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) throw new Error('Sign in again to view the Refund Account.');
      const response = await fetch('/api/admin-wallet-balances', {
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Refund Account balance is unavailable.');
      const accountId = data.platform?.refundAccountId;
      const account = data.accounts?.find((item: any) => item.id === accountId);
      const balance = account?.balance?.available;
      if (!accountId || !account || balance?.currency !== 'SLE' || !Number.isSafeInteger(balance.value) || balance.value < 0) {
        throw new Error('Monime did not return a verified SLE Refund Account balance.');
      }
      setRefundAccountId(accountId);
      setRefundBalance(balance.value);
    } catch (err: any) {
      setRefundAccountId('');
      setRefundBalance(null);
      setRefundBalanceError(err.message || 'Refund Account balance could not be loaded.');
    } finally {
      setRefundBalanceLoading(false);
    }
  };

  useEffect(() => { void refreshRefundBalance(); }, []);

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    setSuccess('');
    setRefundRequestKey(null);
    setRefundRequestLocked(false);
    setUserResult(null);
    try {
      const term = query.trim();
      const { data, error: lookupError } = await supabase
        .from('profiles')
        .select('id,full_name,email,phone,phone_number,role,wallets(currency,monime_account_id,metadata)')
        .or(`email.ilike.%${term}%,phone.ilike.%${term}%,phone_number.ilike.%${term}%,full_name.ilike.%${term}%`)
        .limit(1)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!data) throw new Error('No customer matched that name, email, or phone number.');
      setUserResult(data as SelectedCustomer);
    } catch (err: any) {
      setError(err.message || 'Customer lookup failed.');
    } finally {
      setSearching(false);
    }
  };

  const executeRefund = async () => {
    if (!userResult || !amount || Number(amount) <= 0 || !reason.trim()) return;
    setExecuting(true);
    setError('');
    setSuccess('');
    let transferSubmitted = false;
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) throw new Error('Your Admin session expired. Sign in again.');
      const walletList = userResult.wallets?.filter((wallet) => wallet.currency === 'SLE') || [];
      if (walletList.length !== 1) throw new Error('The customer must have exactly one SLE wallet. The server will verify its Monime account before transferring.');
      const wallet = walletList[0];
      const destinationAccountId = wallet.monime_account_id || String(wallet.metadata?.monime_account_id || '');
      if (!destinationAccountId) throw new Error('The customer SLE wallet is not linked to a Monime account.');

      const requestKey = refundRequestKey || crypto.randomUUID();
      setRefundRequestKey(requestKey);
      transferSubmitted = true;
      const response = await fetch('/api/admin-refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session.access_token}` },
        body: JSON.stringify({
          amount,
          recipientAccountId: destinationAccountId,
          recipientUserId: userResult.id,
          reason: reason.trim(),
          requestKey,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (body.status === 'completed') {
        setSuccess(`Refund completed: SLE ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sent to ${userResult.full_name || 'the customer'}.`);
        setShowConfirmModal(false);
        setAmount('');
        setReason('');
        setUserResult(null);
        setRefundRequestKey(null);
        setRefundRequestLocked(false);
      } else if (['pending', 'processing'].includes(String(body.status || '').toLowerCase())) {
        setSuccess(`Refund is ${body.status}. The same request key has been retained. Check this request again; do not start a second refund.`);
        setRefundRequestLocked(true);
        setShowConfirmModal(false);
      } else if (body.status === 'failed') {
        setRefundRequestKey(null);
        setRefundRequestLocked(false);
        throw new Error(body.error || 'Monime marked this refund as failed. Review the ledger before starting a new request.');
      } else {
        if (response.status >= 400 && response.status < 500 && response.status !== 409) {
          setRefundRequestKey(null);
          setRefundRequestLocked(false);
        } else {
          setRefundRequestLocked(true);
        }
        throw new Error(body.error || `Refund was not confirmed (HTTP ${response.status}). Keep this request key and check the refund ledger before retrying.`);
      }
      await refreshRefundBalance();
    } catch (err: any) {
      if (transferSubmitted) setRefundRequestLocked(true);
      setError(err.message || 'Refund processing failed.');
    } finally {
      setExecuting(false);
    }
  };

  const selectedWallet = userResult?.wallets?.find((wallet) => wallet.currency === 'SLE');
  const selectedAccountId = String(selectedWallet?.monime_account_id || selectedWallet?.metadata?.monime_account_id || '');

  return (
    <AdminLayout title="Customer Refunds" subtitle="Issue and reconcile customer refunds from the dedicated Monime Refund Account. Payroll is managed separately.">
      <div className="max-w-4xl space-y-6 mt-4">
        <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-wrap justify-between items-center gap-3 text-xs font-bold shadow-sm">
          <div><span className="block text-slate-300">Live Refund Account Balance</span><span className="mt-1 block break-all text-[10px] font-mono text-slate-400">{refundAccountId || 'Account ID unavailable'}</span></div>
          <div className="flex items-center gap-3"><span className="text-emerald-400 text-sm font-black">{refundBalanceLoading ? 'Checking Monime…' : refundBalance === null ? 'Unavailable' : `SLE ${(refundBalance / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span><button type="button" onClick={() => void refreshRefundBalance()} disabled={refundBalanceLoading} aria-label="Refresh refund balance" className="rounded-lg border border-white/20 px-3 py-2 disabled:opacity-50"><RefreshCw size={13} className={refundBalanceLoading ? 'animate-spin' : ''} /></button></div>
        </div>
        {refundBalanceError && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{refundBalanceError}</div>}
        {error && <div role="alert" className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl">{error}</div>}
        {success && <div role="status" className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl font-bold">{success}</div>}

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2"><Search size={18} className="text-indigo-600" /> Search customer to refund</h3>
          <p className="text-xs text-slate-500">Search by name, phone number, or email. The server re-verifies the customer's SLE wallet and account before any transfer.</p>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input type="text" placeholder="Name, phone number, or email..." value={query} disabled={refundRequestLocked} onChange={(event) => setQuery(event.target.value)} className="flex-1 p-3 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500" />
            <button type="submit" disabled={searching || refundRequestLocked || !query.trim()} className="px-6 bg-slate-900 text-white font-bold rounded-xl text-xs disabled:opacity-50">{searching ? 'Searching…' : 'Look Up'}</button>
          </form>
        </div>

        {userResult && <div className="bg-white rounded-3xl p-6 border border-indigo-200 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 gap-2"><div><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selected customer</span><h4 className="font-bold text-slate-900 text-lg flex items-center gap-2 mt-0.5"><User size={18} className="text-indigo-600" /> {userResult.full_name || 'Customer'}</h4><p className="text-xs text-slate-500 mt-1">{userResult.email || 'No email'} · {userResult.phone || userResult.phone_number || 'No phone'}</p></div><span className="px-3 py-1 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-full uppercase">{userResult.role || 'Customer'}</span></div>
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs"><div className="flex justify-between gap-2"><span className="text-slate-400 font-bold">SLE Monime Wallet</span><span className="font-mono font-bold text-slate-900 break-all">{selectedAccountId || 'Not linked'}</span></div><div className="flex justify-between"><span className="text-slate-400 font-bold">Verification</span><span className="text-emerald-700 font-bold flex items-center gap-1"><ShieldCheck size={14} /> Server verifies before transfer</span></div></div>
          <div className="space-y-4 pt-2">
            <div><label className="block text-xs font-bold text-slate-700 mb-1">Refund Amount (SLE)</label><input type="number" min="0.01" step="0.01" placeholder="e.g. 50.00" value={amount} disabled={refundRequestLocked} onChange={(event) => setAmount(event.target.value)} className="w-full p-3 border border-slate-200 rounded-xl text-base font-black text-slate-900" /></div>
            <div><label className="block text-xs font-bold text-slate-700 mb-1">Reason / Case Reference</label><input type="text" maxLength={300} placeholder="e.g. Trip reversal or duplicate debit" value={reason} disabled={refundRequestLocked} onChange={(event) => setReason(event.target.value)} className="w-full p-3 border border-slate-200 rounded-xl text-xs font-medium" /></div>
            <button type="button" onClick={() => setShowConfirmModal(true)} disabled={!amount || Number(amount) <= 0 || !reason.trim() || refundBalanceLoading || refundBalance === null || !!refundBalanceError} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-md transition disabled:opacity-50">Review & Confirm Refund</button>
          </div>
        </div>}

        {showConfirmModal && <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"><div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4"><div className="flex items-center gap-3 text-amber-600"><AlertTriangle size={24} /><h3 className="font-bold text-slate-900 text-base">Confirm Customer Refund</h3></div><p className="text-xs text-slate-600 leading-relaxed">You are about to refund <b>SLE {Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> from <b>{refundAccountId}</b> to <b>{userResult?.full_name || 'the selected customer'}</b>. The request will be recorded and its Monime status verified.</p><div className="flex gap-2 pt-2"><button disabled={executing} onClick={executeRefund} className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl text-xs disabled:opacity-50">{executing ? 'Processing…' : refundRequestKey ? 'Check Same Refund Request' : 'Confirm Refund'}</button><button type="button" onClick={() => setShowConfirmModal(false)} disabled={executing} className="px-4 py-3 bg-slate-200 text-slate-700 font-bold rounded-xl text-xs">Cancel</button></div></div></div>}
      </div>
    </AdminLayout>
  );
}
