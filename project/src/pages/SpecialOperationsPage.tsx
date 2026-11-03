import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Search, ShieldAlert, User, ShieldCheck, AlertTriangle, X, Users, CreditCard } from 'lucide-react';

export function SpecialOperationsPage() {
  const [mode, setMode] = useState<'refund' | 'pay_staff'>('refund');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [userResult, setUserResult] = useState<any>(null); // For single refund
  const [staffSelected, setStaffSelected] = useState<any[]>([]); // For bulk staff pay
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState('');

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
    if (mode === 'refund') setUserResult(null);

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

      if (mode === 'refund') {
        setUserResult(profileData);
      } else {
        // Staff Mode: Add to bulk array if not already there
        if (!staffSelected.find(s => s.id === profileData.id)) {
          setStaffSelected([...staffSelected, profileData]);
        }
        setQuery('');
      }
    } catch (err: any) {
      setError(err.message || 'Lookup failed.');
    } finally {
      setSearching(false);
    }
  };

  const removeStaff = (id: string) => {
    setStaffSelected(staffSelected.filter(s => s.id !== id));
  };

  const handleExecuteOperations = async () => {
    if (!amount || Number(amount) <= 0) return;
    setExecuting(true);
    setError('');
    setSuccess('');
    setBulkProgress('');

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) throw new Error('Your Admin session expired. Sign in again.');

      // MODE 1: REFUND
      if (mode === 'refund') {
        if (!userResult) throw new Error("No user selected for refund.");
        const sleWallet = userResult.wallets?.find((w: any) => w.currency === 'SLE');
        const destinationAccountId = sleWallet?.monime_account_id || sleWallet?.metadata?.monime_account_id;
        if (!destinationAccountId) throw new Error('User does not have an active Monime wallet ID on file.');

        const requestKey = refundRequestKey || crypto.randomUUID();
        setRefundRequestKey(requestKey);

        const res = await fetch('/api/admin-refund', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
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
          setAmount(''); setReason(''); setUserResult(null); setRefundRequestKey(null);
        } else if (body.pending || ['pending', 'processing'].includes(body.status)) {
          setSuccess(`Refund is ${body.status}. Request saved.`);
          setShowConfirmModal(false);
        } else {
          throw new Error(body.error || `Refund status: ${body.status || 'not confirmed'}. Check ledger.`);
        }
      } 
      // MODE 2: PAY STAFF (BULK INTERNAL TRANSFER)
      else {
        if (staffSelected.length === 0) throw new Error("No staff selected.");
        let successes = 0;
        let failures = 0;

        for (const staff of staffSelected) {
          setBulkProgress(`Processing internal transfer for ${staff.full_name || staff.phone}...`);
          
          try {
            const sleWallet = staff.wallets?.find((w: any) => w.currency === 'SLE');
            const destId = sleWallet?.monime_account_id || sleWallet?.metadata?.monime_account_id;
            if (!destId) throw new Error('No Monime wallet ID.');

            const res = await fetch('/api/admin-pay-staff', { 
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
              body: JSON.stringify({
                amount: Number(amount),
                recipientAccountId: destId,
                reason: `Staff Payment: ${reason.trim()}`
              })
            });

            const body = await res.json();
            if (res.ok && body.success) successes++;
            else failures++;
          } catch (e) {
            failures++;
          }
        }

        setSuccess(`Bulk payments complete: ${successes} successful, ${failures} failed.`);
        setShowConfirmModal(false);
        setAmount(''); setReason(''); setStaffSelected([]); setBulkProgress('');
      }

      await refreshRefundBalance();
    } catch (err: any) {
      setError(err.message || 'Operation failed.');
    } finally {
      setExecuting(false);
      setBulkProgress('');
    }
  };

  return (
    <AdminLayout
      title="Refunds & Pay Staff"
      subtitle="Issue emergency refunds or distribute staff payments directly from the central operational account."
    >
      <div className="max-w-4xl space-y-6 mt-4">
        {/* Toggle Mode */}
        <div className="flex gap-2">
          <button 
            onClick={() => { setMode('refund'); setError(''); setSuccess(''); }}
            className={`flex-1 py-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${mode === 'refund' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
          >
            <ShieldAlert size={16} /> Issue Customer Refund
          </button>
          <button 
            onClick={() => { setMode('pay_staff'); setError(''); setSuccess(''); }}
            className={`flex-1 py-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${mode === 'pay_staff' ? 'bg-emerald-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
          >
            <CreditCard size={16} /> Pay Staff
          </button>
        </div>

        <div className="p-4 bg-slate-900 text-white rounded-2xl flex justify-between items-center gap-3 text-xs font-bold shadow-sm">
          <span>Live Operations Account Balance</span>
          <span className="text-emerald-400 text-sm font-black">{refundBalanceLoading ? 'Checking Monime…' : refundBalance || 'Unavailable'}</span>
          <button type="button" onClick={() => void refreshRefundBalance()} disabled={refundBalanceLoading} className="rounded-lg border border-white/20 px-3 py-2 text-[10px] disabled:opacity-50">Refresh</button>
        </div>
        {refundBalanceError && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{refundBalanceError}</div>}

        {error && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl">{error}</div>}
        {success && <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl font-bold">{success}</div>}

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <Search size={18} className={mode === 'refund' ? "text-indigo-600" : "text-emerald-600"} /> 
            1. Search {mode === 'refund' ? 'Customer to Refund' : 'Staff Members to Pay'}
          </h3>
          <p className="text-xs text-slate-500">Search by name, phone number, or email to verify their live wallet.</p>
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
              {searching ? 'Finding…' : mode === 'refund' ? 'Look Up' : 'Add to Pay List'}
            </button>
          </form>
        </div>

        {/* --- REFUND MODE UI --- */}
        {mode === 'refund' && userResult && (
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

        {/* --- PAY STAFF MODE UI --- */}
        {mode === 'pay_staff' && staffSelected.length > 0 && (
          <div className="bg-white rounded-3xl p-6 border border-emerald-200 shadow-sm space-y-5">
            <h3 className="font-bold text-slate-900 text-base border-b border-slate-100 pb-3 flex items-center gap-2">
              <Users size={18} className="text-emerald-600" /> Selected Staff ({staffSelected.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-2">
              {staffSelected.map(staff => (
                <div key={staff.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{staff.full_name || staff.email}</h4>
                    <p className="text-[10px] text-slate-500">{staff.phone || staff.phone_number}</p>
                  </div>
                  <button onClick={() => removeStaff(staff.id)} className="text-slate-400 hover:text-rose-500"><X size={16} /></button>
                </div>
              ))}
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Amount Per Person (SLE)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 500.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-xl text-base font-black text-slate-900 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Note / Memo</label>
                <input
                  type="text"
                  placeholder="e.g. November Salary, Bonus, Stipend..."
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-xl text-xs font-medium focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl text-xs font-bold text-emerald-800 flex justify-between items-center">
                <span>Total Payout:</span>
                <span className="text-sm">SLE {(Number(amount || 0) * staffSelected.length).toLocaleString()}</span>
              </div>

              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={!amount || Number(amount) <= 0 || !reason.trim() || refundBalanceLoading || !refundBalance || !!refundBalanceError}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md transition disabled:opacity-50"
              >
                Review & Disburse Bulk Payment
              </button>
            </div>
          </div>
        )}

        {/* MODAL (Handles both Refund and Staff Pay) */}
        {showConfirmModal && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3 text-amber-600">
                <AlertTriangle size={24} />
                <h3 className="font-bold text-slate-900 text-base">Confirm {mode === 'refund' ? 'Refund' : 'Bulk Payment'}</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {mode === 'refund' ? (
                  <>You are about to issue a direct reversal of <b>SLE {Number(amount).toLocaleString()}</b> from the operational account to <b>{userResult?.full_name}</b>.</>
                ) : (
                  <>You are about to send <b>SLE {Number(amount).toLocaleString()}</b> each to <b>{staffSelected.length}</b> staff members. (Total deduction: SLE {(Number(amount) * staffSelected.length).toLocaleString()}).</>
                )}
              </p>
              
              {bulkProgress && <p className="text-xs font-bold text-emerald-600 pt-2 animate-pulse">{bulkProgress}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  disabled={executing}
                  onClick={handleExecuteOperations}
                  className={`flex-1 py-3 text-white font-bold rounded-xl text-xs transition disabled:opacity-50 ${mode === 'refund' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                >
                  {executing ? 'Processing…' : (mode === 'refund' && refundRequestKey) ? 'Check Refund Again' : 'Confirm & Disburse'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={executing}
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