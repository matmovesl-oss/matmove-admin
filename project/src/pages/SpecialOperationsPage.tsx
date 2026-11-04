import { useEffect, useState } from 'react';
import { Search, ShieldAlert, User, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';

type RefundCustomer = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  phone_number: string | null;
  role: string | null;
  kyc_status: string | null;
  wallets?: Array<{
    id: string;
    currency: string;
    monime_account_id: string | null;
    metadata: Record<string, unknown> | null;
  }>;
};

type RefundHistoryItem = {
  id: string;
  recipient_user_id: string;
  amount_minor: number | string;
  currency: string;
  reason: string;
  provider_transfer_id: string | null;
  provider_status: string;
  state: string;
  created_at: string;
  completed_at: string | null;
};

function walletAccountId(customer: RefundCustomer): string {
  const wallet = customer.wallets?.filter(item => item.currency === 'SLE') ?? [];
  if (wallet.length !== 1) return '';
  const direct = wallet[0].monime_account_id;
  const metadata = wallet[0].metadata?.monime_account_id;
  return typeof direct === 'string' && direct ? direct :
    typeof metadata === 'string' ? metadata : '';
}

export function SpecialOperationsPage() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [userResult, setUserResult] = useState<RefundCustomer | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [executing, setExecuting] = useState(false);

  const [refundBalance, setRefundBalance] = useState<string | null>(null);
  const [refundBalanceLoading, setRefundBalanceLoading] = useState(true);
  const [refundBalanceError, setRefundBalanceError] = useState('');
  const [refundRequestKey, setRefundRequestKey] = useState<string | null>(null);
  const [refundHistory, setRefundHistory] = useState<RefundHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');

  const refreshRefundBalance = async () => {
    setRefundBalanceLoading(true);
    setRefundBalanceError('');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Sign in again to view the Refund Account.');
      }
      const response = await fetch('/api/admin-wallet-balances', {
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Refund Account balance is unavailable.');

      const refundId = data.platform?.refundAccountId;
      if (!refundId) {
        throw new Error('MONIME_REFUND_ACCOUNT_ID is not configured for the Admin production environment.');
      }
      const account = data.accounts?.find((item: any) => item.id === refundId);
      const balance = account?.balance?.available;
      if (!account || balance?.currency !== 'SLE' || !Number.isSafeInteger(balance.value) || balance.value < 0) {
        throw new Error('Monime did not return a verified SLE Refund Account balance.');
      }
      setRefundBalance(`SLE ${(balance.value / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`);
    } catch (cause) {
      setRefundBalance(null);
      setRefundBalanceError(cause instanceof Error ? cause.message : 'Refund Account balance could not be loaded.');
    } finally {
      setRefundBalanceLoading(false);
    }
  };

  const refreshRefundHistory = async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Sign in again to view refund history.');
      }
      const response = await fetch('/api/admin-refund', {
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Refund history could not be loaded.');
      if (!Array.isArray(body.refunds)) throw new Error('Refund history response could not be verified.');
      setRefundHistory(body.refunds);
    } catch (cause) {
      setRefundHistory([]);
      setHistoryError(cause instanceof Error ? cause.message : 'Refund history could not be loaded.');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    void refreshRefundBalance();
    void refreshRefundHistory();
  }, []);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    if (!term || searching) return;

    setSearching(true);
    setError('');
    setSuccess('');
    setRefundRequestKey(null);
    setUserResult(null);
    try {
      const { data, error: lookupError } = await supabase
        .from('profiles')
        .select('id,full_name,email,phone,phone_number,role,kyc_status,wallets(id,currency,monime_account_id,metadata)')
        .or(`email.ilike.%${term}%,phone.ilike.%${term}%,phone_number.ilike.%${term}%,full_name.ilike.%${term}%`)
        .limit(1)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (!data) throw new Error('No profile matched that name, email, or phone number.');
      setUserResult(data as RefundCustomer);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Customer lookup failed.');
    } finally {
      setSearching(false);
    }
  };

  const accountId = userResult ? walletAccountId(userResult) : '';
  const handleExecuteRefund = async () => {
    if (!userResult || !accountId || !amount.trim() || !reason.trim() || executing) return;

    setExecuting(true);
    setError('');
    setSuccess('');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Your Admin session expired. Sign in again.');
      }

      const requestKey = refundRequestKey || crypto.randomUUID();
      setRefundRequestKey(requestKey);
      const response = await fetch('/api/admin-refund', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          amount,
          recipientAccountId: accountId,
          recipientUserId: userResult.id,
          reason: reason.trim(),
          requestKey,
        }),
      });
      const body = await response.json();
      if (!response.ok && response.status !== 202) {
        throw new Error(body.error || 'Refund transfer was rejected.');
      }

      if (body.status === 'completed') {
        setSuccess(`Refund completed: SLE ${amount} sent to ${userResult.full_name || 'the customer'}.`);
        setShowConfirmModal(false);
        setAmount('');
        setReason('');
        setUserResult(null);
        setRefundRequestKey(null);
        await refreshRefundBalance();
        await refreshRefundHistory();
      } else if (body.pending || ['pending', 'processing'].includes(String(body.status || '').toLowerCase())) {
        setSuccess(`Refund is ${body.status}. The request is saved. Use “Check Refund Again” to recheck this same request.`);
        setShowConfirmModal(false);
        await refreshRefundHistory();
      } else {
        throw new Error(body.error || `Refund status was not confirmed: ${body.status || 'unknown'}.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Refund processing failed. Check the refund ledger before retrying.');
    } finally {
      setExecuting(false);
    }
  };

  const resetRefund = () => {
    setUserResult(null);
    setAmount('');
    setReason('');
    setRefundRequestKey(null);
    setError('');
    setSuccess('');
  };

  return (
    <AdminLayout
      title="Customer Refunds"
      subtitle="Issue and track verified SLE customer refunds from the designated Refund Account."
    >
      <div className="mx-auto mt-4 max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-900 p-4 text-xs font-bold text-white shadow-sm">
          <span>Live Refund Account Balance</span>
          <span className="text-sm font-black text-emerald-400">
            {refundBalanceLoading ? 'Checking Monime…' : refundBalance || 'Unavailable'}
          </span>
          <button
            type="button"
            onClick={() => void refreshRefundBalance()}
            disabled={refundBalanceLoading}
            className="rounded-lg border border-white/20 px-3 py-2 text-[10px] disabled:opacity-50"
          >
            <RefreshCw size={14} className={refundBalanceLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {refundBalanceError && (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {refundBalanceError}
          </div>
        )}
        {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">{error}</div>}
        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent refund history</h2>
              <p className="mt-1 text-xs text-slate-500">Latest recorded refunds from the dedicated refund ledger (up to 100 records).</p>
            </div>
            <button type="button" onClick={() => void refreshRefundHistory()} disabled={historyLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
              <RefreshCw size={13} className={historyLoading ? 'animate-spin' : ''} />Refresh history
            </button>
          </div>
          {historyError && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{historyError}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Customer reference</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Reason / case</th>
                  <th className="p-3">Provider status</th>
                  <th className="p-3">Transfer reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyLoading ? (
                  <tr><td colSpan={6} className="p-5 text-center text-slate-500">Loading refund history…</td></tr>
                ) : historyError && refundHistory.length === 0 ? (
                  <tr><td colSpan={6} className="p-5 text-center text-amber-800">Refund history is unavailable. Retry the refresh.</td></tr>
                ) : !refundHistory.length ? (
                  <tr><td colSpan={6} className="p-5 text-center text-slate-500">No refunds have been recorded yet.</td></tr>
                ) : refundHistory.map(item => {
                  const minor = Number(item.amount_minor);
                  const amountText = Number.isSafeInteger(minor) && minor >= 0
                    ? item.currency + ' ' + (minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : 'Amount unavailable';
                  return (
                    <tr key={item.id}>
                      <td className="whitespace-nowrap p-3 text-slate-500">{new Date(item.created_at).toLocaleString()}</td>
                      <td className="p-3 font-mono text-slate-700">{item.recipient_user_id?.slice(0, 8) || 'Unverified'}…</td>
                      <td className="whitespace-nowrap p-3 font-bold text-slate-900">{amountText}</td>
                      <td className="max-w-[180px] whitespace-normal p-3 text-slate-600">{item.reason || '—'}</td>
                      <td className="p-3">
                        <span className="rounded-full bg-slate-100 px-2 py-1 font-bold uppercase text-slate-700">{item.provider_status || item.state}</span>
                      </td>
                      <td className="max-w-[150px] break-all p-3 font-mono text-[10px] text-slate-500">{item.provider_transfer_id || 'Not yet assigned'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        {success && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-800">{success}</div>}

        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Search size={18} className="text-indigo-600" /> 1. Search Customer to Refund
          </h2>
          <p className="text-xs text-slate-500">Search by name, phone number, or email to verify the customer’s SLE wallet.</p>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Name, phone number, or email address"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 p-3 text-xs font-medium outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="rounded-xl bg-slate-900 px-6 text-xs font-bold text-white disabled:opacity-50"
            >
              {searching ? 'Finding…' : 'Look Up'}
            </button>
          </form>
        </section>

        {userResult && (
          <section className="space-y-5 rounded-3xl border border-indigo-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer account</span>
                <h3 className="mt-1 flex items-center gap-2 text-lg font-bold text-slate-900">
                  <User size={18} className="text-indigo-600" />
                  {userResult.full_name || 'Customer'}
                </h3>
                <p className="mt-1 text-xs text-slate-500">{userResult.email} · {userResult.phone || userResult.phone_number || 'No phone'}</p>
              </div>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase text-indigo-700">
                {userResult.role || 'Customer'}
              </span>
            </div>

            <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-bold text-slate-400">SLE Monime Wallet ID</span>
                <span className="font-mono font-bold text-slate-900">{accountId || 'Not uniquely linked'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="font-bold text-slate-400">KYC status</span>
                <span className="flex items-center gap-1 font-bold text-slate-700">
                  <ShieldCheck size={14} /> {userResult.kyc_status || 'Not recorded'}
                </span>
              </div>
            </div>

            {!accountId && (
              <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                This customer does not have exactly one SLE wallet with a linked Monime account. No refund can be submitted.
              </p>
            )}

            <div className="space-y-4">
              <label className="block text-xs font-bold text-slate-700">
                Refund Amount (SLE)
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 50.00"
                  value={amount}
                  onChange={event => { setAmount(event.target.value); setRefundRequestKey(null); }}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-base font-black text-slate-900"
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Reason / Case Reference
                <input
                  type="text"
                  placeholder="Trip reversal, duplicate debit, or case reference"
                  value={reason}
                  onChange={event => { setReason(event.target.value); setRefundRequestKey(null); }}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-xs font-medium"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={!accountId || !/^\d+(?:\.\d{1,2})?$/.test(amount.trim()) || Number(amount) <= 0 ||
                    !reason.trim() || refundBalanceLoading || !refundBalance || !!refundBalanceError}
                  className="flex-1 rounded-xl bg-indigo-600 py-4 text-xs font-bold text-white shadow-md transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {refundRequestKey ? 'Check Refund Again' : 'Review & Confirm Refund'}
                </button>
                <button type="button" onClick={resetRefund} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-600">
                  Clear
                </button>
              </div>
            </div>
          </section>
        )}

        {showConfirmModal && userResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
              <div className="flex items-center gap-3 text-amber-600">
                <AlertTriangle size={24} />
                <h3 className="text-base font-bold text-slate-900">Confirm Customer Refund</h3>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">
                You are about to send <b>SLE {Number(amount).toLocaleString()}</b> from the Refund Account to
                <b> {userResult.full_name || 'the selected customer'}</b>. This transfer will be recorded in the refund ledger.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={executing}
                  onClick={() => void handleExecuteRefund()}
                  className="flex-1 rounded-xl bg-rose-600 py-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  {executing ? 'Processing…' : refundRequestKey ? 'Check Refund Again' : 'Confirm & Send Refund'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={executing}
                  className="rounded-xl bg-slate-200 px-4 py-3 text-xs font-bold text-slate-700 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
