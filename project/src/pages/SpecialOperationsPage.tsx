import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Search, ShieldAlert, User, ShieldCheck, AlertTriangle } from 'lucide-react';

export function SpecialOperationsPage() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [userResult, setUserResult] = useState<any>(null);
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

  const refreshRefundBalance = async () => {
    setRefundBalanceLoading(true);
    setRefundBalanceError('');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) throw new Error('Sign in again to view the Refund Account.');
      const res = await fetch('/api/admin-wallet-balances', {
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        cache: 'no-store',
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Refund Account balance is unavailable.');
      const refundId = d.platform?.refundAccountId;
      if (!refundId) throw new Error('MONIME_REFUND_ACCOUNT_ID is not configured for the Admin production environment.');
      const refAcc = d.accounts?.find((a: any) => a.id === refundId);
      const balance = refAcc?.balance?.available;
      if (!refAcc || balance?.currency !== 'SLE' || !Number.isSafeInteger(balance.value) || balance.value < 0) {
        throw new Error('Monime did not return a verified SLE Refund Account balance.');
      }
      setRefundBalance(`SLE ${(balance.value / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    } catch (err: any) {
      setRefundBalance(null);
      setRefundBalanceError(err.message || 'Refund Account balance could not be loaded.');
    } finally {
      setRefundBalanceLoading(false);
    }
  };

  useEffect(() => { void refreshRefundBalance(); }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setError('');
    setSuccess('');
    setRefundRequestKey(null);
    setUserResult(null);

    try {
      const q = query.trim();
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('*, wallets(*)')
        .or(`email.ilike.%${q}%,phone.ilike.%${q}%,phone_number.ilike.%${q}%,full_name.ilike.%${q}%`)
        .limit(1)
        .maybeSingle();

      if (profileErr) throw profileErr;
      if (!profileData) {
        setError('No profile matched that name, email, or phone number.');
        return;
      }
      setUserResult(profileData);
    } catch (err: any) {
      setError(err.message || 'Lookup failed.');
    } finally {
      setSearching(false);
    }
  };

  const handleExecuteRefund = async () => {
    if (!userResult || !amount || Number(amount) <= 0) return;
    setExecuting(true);
    setError('');
    setSuccess('');

    try {
      const sleWallet = userResult.wallets?.find((w: any) => w.currency === 'SLE');
      const destinationAccountId = sleWallet?.monime_account_id || sleWallet?.metadata?.monime_account_id;

      if (!destinationAccountId) {
        throw new Error('User does not have an active Monime wallet ID on file.');
      }

      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) throw new Error('Your Admin session expired. Sign in again.');
      const requestKey = refundRequestKey || crypto.randomUUID();
      setRefundRequestKey(requestKey);
      const res = await fetch('/api/admin-refund', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session.access_token}`
        },
        body: JSON.stringify({
          amount: Number(amount),
          recipientAccountId: destinationAccountId,
          recipientUserId: userResult.id,
          reason: reason.trim(),
          requestKey,
        })
      });

      const body = await res.json();
      if (!res.ok && res.status !== 202) throw new Error(body.error || 'Refund transfer rejected by gateway.');
      if (body.status === 'completed') {
        setSuccess(`Refund completed: SLE ${Number(amount).toLocaleString()} sent to ${userResult.full_name}.`);
        setShowConfirmModal(false);
        setAmount('');
        setReason('');
        setUserResult(null);
        setRefundRequestKey(null);
        await refreshRefundBalance();
      } else if (body.pending || ['pending', 'processing'].includes(body.status)) {
        setSuccess(`Refund is ${body.status}. Its request has been saved. Use the same refund details and confirmation to check this transfer again; do not start a second refund.`);
        setShowConfirmModal(false);
        await refreshRefundBalance();
      } else {
        throw new Error(body.error || `Refund status: ${body.status || 'not confirmed'}. Check the refund ledger before retrying.`);
      }
    } catch (err: any) {
      setError(err.message || 'Refund transfer failed.');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <AdminLayout
      title="Refunds & Special Operations"
      subtitle="Issue emergency refunds directly from your dedicated Monime Refund Account"
    >
      <div className="max-w-4xl space-y-6 mt-4">
        <div className="p-4 bg-slate-900 text-white rounded-2xl flex justify-between items-center gap-3 text-xs font-bold shadow-sm">
          <span>Live Refund Account Balance</span>
          <span className="text-emerald-400 text-sm font-black">{refundBalanceLoading ? 'Checking Monime…' : refundBalance || 'Unavailable'}</span>
          <button type="button" onClick={() => void refreshRefundBalance()} disabled={refundBalanceLoading} className="rounded-lg border border-white/20 px-3 py-2 text-[10px] disabled:opacity-50">Refresh</button>
        </div>
        {refundBalanceError && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{refundBalanceError}</div>}

        {error && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl">{error}</div>}
        {success && <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl font-bold">{success}</div>}

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <Search size={18} className="text-indigo-600" /> 1. Search Customer to Refund
          </h3>
          <p className="text-xs text-slate-500">Search by customer name, phone number, or email to verify their live wallet.</p>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. Sahr, +23277000000, or user@email.com..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="flex-1 p-3 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={searching}
              className="px-6 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 disabled:opacity-50"
            >
              {searching ? 'Finding…' : 'Look Up'}
            </button>
          </form>
        </div>

        {userResult && (
          <div className="bg-white rounded-3xl p-6 border border-indigo-200 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Verified User</span>
                <h4 className="font-bold text-slate-900 text-lg flex items-center gap-2 mt-0.5">
                  <User size={18} className="text-indigo-600" /> {userResult.full_name || 'Customer'}
                </h4>
                <p className="text-xs text-slate-500 mt-1">{userResult.email} · {userResult.phone || userResult.phone_number}</p>
              </div>
              <span className="px-3 py-1 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-full uppercase">
                {userResult.role || 'Rider'}
              </span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Monime Wallet ID:</span>
                <span className="font-mono font-bold text-slate-900">
                  {userResult.wallets?.[0]?.monime_account_id || 'Not linked'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Verification:</span>
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <ShieldCheck size={14} /> Active Account
                </span>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Refund Amount (SLE)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 50.00"
                  value={amount}
                  onChange={e => { setAmount(e.target.value); setRefundRequestKey(null); }}
                  className="w-full p-3 border border-slate-200 rounded-xl text-base font-black text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason / Case Reference</label>
                <input
                  type="text"
                  placeholder="e.g. Trip reversal #1042 or duplicate debit"
                  value={reason}
                  onChange={e => { setReason(e.target.value); setRefundRequestKey(null); }}
                  className="w-full p-3 border border-slate-200 rounded-xl text-xs font-medium"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={!amount || Number(amount) <= 0 || !reason.trim() || refundBalanceLoading || !refundBalance || !!refundBalanceError}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-md transition disabled:opacity-50"
              >
                Review & Confirm Refund Transfer
              </button>
            </div>
          </div>
        )}

        {showConfirmModal && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3 text-amber-600">
                <AlertTriangle size={24} />
                <h3 className="font-bold text-slate-900 text-base">Confirm Direct Refund</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                You are about to issue a direct reversal of <b>SLE {Number(amount).toLocaleString()}</b> from your Monime Refund Account to <b>{userResult?.full_name}</b>.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  disabled={executing}
                  onClick={handleExecuteRefund}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition disabled:opacity-50"
                >
                  {executing ? 'Checking / Sending Refund…' : refundRequestKey ? 'Check Same Refund Again' : 'Confirm & Send Refund'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-3 bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
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
