import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Search, ShieldAlert, User, Wallet, CheckCircle2, AlertTriangle, ArrowRightLeft, ShieldCheck } from 'lucide-react';

export function SpecialOperationsPage() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [userResult, setUserResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Transfer / Refund Inputs
  const [amount, setAmount] = useState('');
  const [sourceAccount, setSourceAccount] = useState<'escrow' | 'fee'>('escrow');
  const [reason, setReason] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [executing, setExecuting] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setError('');
    setSuccess('');
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
        setError('No customer or driver profile matched that name, email, or phone.');
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
      const sleWallet = userResult.wallets?.find((w: any) => w.currency === 'SLE') || userResult.wallets?.[0];
      const destinationAccountId = sleWallet?.monime_account_id || sleWallet?.metadata?.monime_account_id;

      if (!destinationAccountId) {
        throw new Error('User does not have a verified Monime wallet account ID on file.');
      }

      const { data: session } = await supabase.auth.getSession();
      const res = await fetch('/api/create-monime-transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session?.access_token}`
        },
        body: JSON.stringify({
          amount: Number(amount) * 100,
          destinationId: destinationAccountId,
          description: `Admin Refund: ${reason.trim()}`
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Refund transfer rejected by gateway.');
      }

      setSuccess(`Successfully transferred SLE ${Number(amount).toLocaleString()} refund to ${userResult.full_name}.`);
      setShowConfirmModal(false);
      setAmount('');
      setReason('');
      setUserResult(null);
    } catch (err: any) {
      setError(err.message || 'Refund transfer failed.');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <AdminLayout
      title="Refunds & Special Operations"
      subtitle="Issue emergency refunds and internal transfers with customer verification"
    >
      <div className="max-w-4xl space-y-6 mt-4">
        {error && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl">{error}</div>}
        {success && <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl font-bold">{success}</div>}

        {/* Step 1: Search */}
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

        {/* Step 2: Verification Card */}
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

            {/* Step 3: Refund Form */}
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Refund Amount (SLE)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 50.00"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="w-full p-3 border border-slate-200 rounded-xl text-base font-black text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Source Account</label>
                  <select
                    value={sourceAccount}
                    onChange={e => setSourceAccount(e.target.value as any)}
                    className="w-full p-3 border border-slate-200 rounded-xl text-xs font-bold bg-white"
                  >
                    <option value="escrow">Escrow & Platform Holdings</option>
                    <option value="fee">Company Fee Account</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason / Case Reference</label>
                <input
                  type="text"
                  placeholder="e.g. Ride cancellation refund #1042 or overcharge"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-xl text-xs font-medium"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={!amount || Number(amount) <= 0 || !reason.trim()}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-md transition disabled:opacity-50"
              >
                Review & Confirm Refund Transfer
              </button>
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {showConfirmModal && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3 text-amber-600">
                <AlertTriangle size={24} />
                <h3 className="font-bold text-slate-900 text-base">Confirm Direct Refund</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                You are about to issue a direct credit of <b>SLE {Number(amount).toLocaleString()}</b> to <b>{userResult?.full_name}</b> ({userResult?.phone || userResult?.phone_number}).
              </p>
              <div className="p-3 bg-slate-50 rounded-xl text-xs font-mono text-slate-600">
                Destination: {userResult?.wallets?.[0]?.monime_account_id}
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  disabled={executing}
                  onClick={handleExecuteRefund}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition"
                >
                  {executing ? 'Executing…' : 'Confirm & Send Refund'}
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