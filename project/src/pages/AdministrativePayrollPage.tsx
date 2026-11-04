import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Search, CreditCard, AlertTriangle, Loader2, RefreshCw, RotateCcw } from 'lucide-react';

type PayrollStatus = 'completed' | 'pending' | 'failed';
type PendingPayrollBatch = {
  keys: Record<string, string>;
  staffIds: string[];
  amount: string;
  reason: string;
  statuses: Record<string, PayrollStatus>;
};

const PENDING_BATCH_KEY = 'matmove.admin.payroll.pending.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readPendingBatch(): PendingPayrollBatch | null {
  try {
    const raw = sessionStorage.getItem(PENDING_BATCH_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    if (typeof value.amount !== 'string' || typeof value.reason !== 'string' ||
        !Array.isArray(value.staffIds) || !value.staffIds.every(id => typeof id === 'string' && UUID.test(id)) ||
        !value.keys || typeof value.keys !== 'object' || Array.isArray(value.keys) ||
        !value.statuses || typeof value.statuses !== 'object' || Array.isArray(value.statuses)) return null;

    const keys: Record<string, string> = {};
    for (const [id, key] of Object.entries(value.keys as Record<string, unknown>)) {
      if (UUID.test(id) && typeof key === 'string' && UUID.test(key)) keys[id] = key;
    }
    const statuses: Record<string, PayrollStatus> = {};
    for (const [id, status] of Object.entries(value.statuses as Record<string, unknown>)) {
      if (UUID.test(id) && ['completed', 'pending', 'failed'].includes(String(status))) {
        statuses[id] = status as PayrollStatus;
      }
    }
    if (!value.staffIds.length || value.staffIds.some(id => !keys[id as string])) return null;
    return {
      keys,
      staffIds: [...new Set(value.staffIds as string[])],
      amount: value.amount,
      reason: value.reason,
      statuses,
    };
  } catch {
    return null;
  }
}

export function AdministrativePayrollPage() {
  const [pendingBatch, setPendingBatch] = useState<PendingPayrollBatch | null>(() => readPendingBatch());
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(() => readPendingBatch()?.staffIds || []);

  const [amount, setAmount] = useState(() => readPendingBatch()?.amount || '');
  const [reason, setReason] = useState(() => readPendingBatch()?.reason || 'Administrative Payroll');
  const [showConfirm, setShowConfirm] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [payrollBalance, setPayrollBalance] = useState<string | null>(null);
  const [payrollAccountId, setPayrollAccountId] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState('');

  useEffect(() => {
    if (pendingBatch) sessionStorage.setItem(PENDING_BATCH_KEY, JSON.stringify(pendingBatch));
    else sessionStorage.removeItem(PENDING_BATCH_KEY);
  }, [pendingBatch]);

  const refreshPayrollBalance = async () => {
    setBalanceLoading(true);
    setBalanceError('');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Sign in again to view the Payroll Account.');
      }

      const response = await fetch('/api/admin-pay-staff', {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + sessionData.session.access_token },
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Payroll Account balance is unavailable.');

      const balance = data.balance;
      if (!data.accountId || balance?.currency !== 'SLE' ||
          !Number.isSafeInteger(balance.value) || balance.value < 0) {
        throw new Error('Monime returned an invalid SLE payroll account or balance.');
      }
      setPayrollAccountId(data.accountId);
      setPayrollBalance('SLE ' + (balance.value / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }));
    } catch (cause) {
      setPayrollBalance(null);
      setPayrollAccountId(null);
      setBalanceError(cause instanceof Error ? cause.message : 'Balance could not be loaded.');
    } finally {
      setBalanceLoading(false);
    }
  };

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setLoadingError('');
    try {
      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('id,full_name,email,phone,phone_number,role,is_wallet_frozen,wallets(id,currency,monime_account_id,metadata,is_frozen)')
        .eq('role', 'staff')
        .order('full_name');
      if (queryError) throw queryError;
      setStaffList(data || []);
    } catch (cause) {
      setStaffList([]);
      setLoadingError(cause instanceof Error ? cause.message : 'Staff records could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStaff();
    void refreshPayrollBalance();
  }, [fetchStaff]);

  const filtered = staffList.filter(staff => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return staff.full_name?.toLowerCase().includes(term) ||
      staff.email?.toLowerCase().includes(term) ||
      staff.phone?.includes(term) ||
      staff.phone_number?.includes(term);
  });

  const toggleSelection = (id: string) => {
    if (pendingBatch) {
      setError('Resolve the saved payroll batch before changing its staff selection.');
      return;
    }
    setSelectedIds(previous => previous.includes(id)
      ? previous.filter(item => item !== id)
      : [...previous, id]);
  };

  const toggleAll = () => {
    if (pendingBatch) {
      setError('Resolve the saved payroll batch before changing its staff selection.');
      return;
    }
    if (selectedIds.length === filtered.length) setSelectedIds([]);
    else setSelectedIds(filtered.map(staff => staff.id));
  };

  const closeReviewedBatch = () => {
    if (!pendingBatch || executing) return;
    if (Object.values(pendingBatch.statuses).includes('pending')) {
      setError('A payment is still pending or uncertain. Check the same request again before closing this batch.');
      return;
    }
    setPendingBatch(null);
    setSelectedIds([]);
    setAmount('');
    setReason('Administrative Payroll');
    setError('');
    setSuccess('Reviewed payroll batch closed. A new batch can now be prepared.');
  };

  const executePayroll = async () => {
    if (!amount.trim() || !/^\d+(?:\.\d{1,2})?$/.test(amount.trim()) ||
        Number(amount) <= 0 || selectedIds.length === 0 || executing) return;

    if (pendingBatch && (
      pendingBatch.amount !== amount.trim() ||
      pendingBatch.reason !== reason.trim() ||
      pendingBatch.staffIds.length !== selectedIds.length ||
      pendingBatch.staffIds.some(id => !selectedIds.includes(id))
    )) {
      setError('A saved payroll batch is unresolved. Resume it using the original amount, memo, and staff list.');
      return;
    }

    const batch: PendingPayrollBatch = pendingBatch || {
      keys: Object.fromEntries(selectedIds.map(id => [id, crypto.randomUUID()])),
      staffIds: [...selectedIds],
      amount: amount.trim(),
      reason: reason.trim(),
      statuses: {},
    };
    setPendingBatch(batch);
    setExecuting(true);
    setError('');
    setSuccess('');
    setProgress('');

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Session expired. Sign in again. The saved payroll request keys have been kept.');
      }

      let completed = 0;
      let pending = 0;
      let failed = 0;
      const nextStatuses = { ...batch.statuses };

      for (let index = 0; index < batch.staffIds.length; index++) {
        const staffId = batch.staffIds[index];
        if (nextStatuses[staffId] === 'completed' || nextStatuses[staffId] === 'failed') {
          if (nextStatuses[staffId] === 'completed') completed++;
          else failed++;
          continue;
        }
        const staff = staffList.find(item => item.id === staffId);
        if (!staff) {
          nextStatuses[staffId] = 'failed';
          failed++;
          continue;
        }

        setProgress('Checking ' + (index + 1) + '/' + batch.staffIds.length + ': ' +
          (staff.full_name || staff.email || 'Staff member') + '…');

        try {
          const response = await fetch('/api/admin-pay-staff', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + sessionData.session.access_token,
            },
            body: JSON.stringify({
              amount: batch.amount,
              staffUserId: staff.id,
              reason: batch.reason,
              requestKey: batch.keys[staff.id],
            }),
          });
          const body = await response.json().catch(() => ({}));
          const status = String(body.status || '').toLowerCase();

          if (response.ok && status === 'completed') {
            nextStatuses[staffId] = 'completed';
            completed++;
          } else if (response.status === 202 || body.pending ||
              ['pending', 'processing', 'review_required'].includes(status) ||
              response.status >= 500) {
            nextStatuses[staffId] = 'pending';
            pending++;
          } else {
            nextStatuses[staffId] = 'failed';
            failed++;
          }
        } catch {
          // A browser/network interruption can occur after Monime accepted the request.
          // Keep the same idempotency key and recheck it; never generate a replacement.
          nextStatuses[staffId] = 'pending';
          pending++;
        }

        setPendingBatch({ ...batch, statuses: { ...nextStatuses } });
      }

      const resultBatch = { ...batch, statuses: nextStatuses };
      setPendingBatch(resultBatch);
      setSuccess(
        completed + ' completed, ' + pending + ' pending/recheck, ' + failed +
        ' failed. Pending entries retain their original request keys; do not create a second batch.'
      );
      setShowConfirm(false);
      if (pending === 0 && failed === 0) {
        setPendingBatch(null);
        setSelectedIds([]);
        setAmount('');
        setReason('Administrative Payroll');
        setSuccess('Payroll completed successfully for all ' + completed + ' staff payment(s).');
        await refreshPayrollBalance();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message :
        'Payroll could not be confirmed. The saved request keys have been retained.');
    } finally {
      setExecuting(false);
      setProgress('');
    }
  };

  const completedCount = pendingBatch
    ? Object.values(pendingBatch.statuses).filter(status => status === 'completed').length
    : 0;
  const pendingCount = pendingBatch
    ? Object.values(pendingBatch.statuses).filter(status => status === 'pending').length
    : 0;
  const failedCount = pendingBatch
    ? Object.values(pendingBatch.statuses).filter(status => status === 'failed').length
    : 0;

  return (
    <AdminLayout title="Administrative Payroll" subtitle="Disburse salaries and stipends from the verified SLE Staff Payroll Account.">
      <div className="mt-6 max-w-6xl space-y-6">
        {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">{error}</div>}
        {success && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-800">{success}</div>}

        {pendingBatch && (
          <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-amber-950">Saved payroll batch — reconciliation required</h2>
                <p className="mt-1 text-xs text-amber-900">
                  {completedCount} completed · {pendingCount} pending/recheck · {failedCount} failed.
                  The original request keys are saved in this browser session.
                </p>
              </div>
              <button type="button" onClick={closeReviewedBatch} disabled={executing || pendingCount > 0}
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-50">
                Close reviewed batch
              </button>
            </div>
          </section>
        )}

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <Search size={18} className="text-slate-400" />
          <input type="text" placeholder="Search staff members…" value={search}
            onChange={event => setSearch(event.target.value)}
            className="w-full text-sm font-medium outline-none" />
          <button type="button" onClick={() => void fetchStaff()} disabled={loading}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-50" aria-label="Refresh staff list">
            <RefreshCw size={15} />
          </button>
        </div>

        {loadingError && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{loadingError}</div>}

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
            {loading ? (
              <div className="p-8 text-center text-slate-400"><Loader2 className="mx-auto mb-2 animate-spin" />Loading Staff Database…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="w-12 p-4 text-center">
                        <input type="checkbox" checked={selectedIds.length === filtered.length && filtered.length > 0}
                          onChange={toggleAll} disabled={!!pendingBatch}
                          className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-600" />
                      </th>
                      <th className="p-4">Staff Member Profile</th>
                      <th className="p-4">Contact Info</th>
                      <th className="p-4">SLE Wallet ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(staff => {
                      const sleWallets = (staff.wallets || []).filter((wallet: any) => wallet.currency === 'SLE');
                      const wallet = sleWallets.length === 1 ? sleWallets[0] : null;
                      const walletId = wallet?.monime_account_id || wallet?.metadata?.monime_account_id;
                      const frozen = staff.is_wallet_frozen === true || wallet?.is_frozen === true;
                      return (
                        <tr key={staff.id} className="transition-colors hover:bg-slate-50">
                          <td className="p-4 text-center">
                            <input type="checkbox" checked={selectedIds.includes(staff.id)}
                              onChange={() => toggleSelection(staff.id)} disabled={!!pendingBatch || frozen}
                              className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-600" />
                          </td>
                          <td className="p-4">
                            <div className="text-sm font-bold text-slate-900">{staff.full_name || 'Staff User'}</div>
                            <div className="mt-1 inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">STAFF</div>
                            {frozen && <div className="mt-1 text-[10px] font-bold text-rose-600">FROZEN — cannot receive payroll</div>}
                          </td>
                          <td className="p-4 font-medium text-slate-500">
                            {staff.email}<br />{staff.phone || staff.phone_number || 'No Phone'}
                          </td>
                          <td className="p-4 font-mono text-[11px] text-slate-500">
                            {walletId || (sleWallets.length > 1 ? 'Multiple SLE wallets — review' : 'Not linked')}
                          </td>
                        </tr>
                      );
                    })}
                    {!filtered.length && <tr><td colSpan={4} className="p-8 text-center text-slate-400">No staff profiles found.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <aside className="sticky top-6 space-y-5 rounded-3xl bg-slate-950 p-6 text-white">
            <h3 className="flex items-center gap-2 font-bold text-emerald-400"><CreditCard size={18} />Execute Payroll</h3>
            <div className="rounded-2xl border border-white/5 bg-white/10 p-4">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Live Payroll Balance</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xl font-black text-emerald-400">{balanceLoading ? 'Checking…' : payrollBalance || 'Unavailable'}</p>
                <button type="button" onClick={() => void refreshPayrollBalance()} disabled={balanceLoading}
                  className="rounded-lg bg-slate-800 p-2 transition hover:bg-slate-700 disabled:opacity-50" aria-label="Refresh payroll balance">
                  <RefreshCw size={14} className={balanceLoading ? 'animate-spin' : ''} />
                </button>
              </div>
              {balanceError && <p className="mt-2 text-xs text-rose-400">{balanceError}</p>}
              {payrollAccountId && <p className="mt-2 break-all font-mono text-[10px] text-slate-300">Account: {payrollAccountId}</p>}
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/10 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selected Staff</p>
              <p className="text-xl font-black">{selectedIds.length}</p>
            </div>

            <label className="block text-xs font-bold text-slate-400">
              Base Amount Per Staff (SLE)
              <input type="text" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)}
                disabled={!!pendingBatch}
                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-900 p-3 text-lg font-bold outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                placeholder="0.00" />
            </label>

            <label className="block text-xs font-bold text-slate-400">
              Internal Memo
              <input type="text" value={reason} onChange={event => setReason(event.target.value)}
                disabled={!!pendingBatch}
                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm font-medium outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
            </label>

            <div className="flex items-center justify-between border-t border-slate-800 pt-4 font-bold">
              <span className="text-slate-300">Total Deduction:</span>
              <span className="text-emerald-400">SLE {(Number(amount || 0) * selectedIds.length).toLocaleString()}</span>
            </div>

            <button type="button" onClick={() => setShowConfirm(true)}
              disabled={selectedIds.length === 0 || !/^\d+(?:\.\d{1,2})?$/.test(amount.trim()) || Number(amount) <= 0 ||
                balanceLoading || !payrollBalance || !payrollAccountId}
              className="w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-bold shadow-md transition hover:bg-emerald-500 disabled:opacity-50">
              {pendingBatch ? 'Recheck Saved Payroll Batch' : 'Review Transfer'}
            </button>
          </aside>
        </div>

        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 text-slate-900 shadow-2xl">
              <div className="mb-2 flex items-center gap-3 text-amber-600">
                <AlertTriangle size={24} />
                <h3 className="text-base font-bold">{pendingBatch ? 'Recheck Payroll Batch' : 'Confirm Payroll'}</h3>
              </div>
              <p className="text-sm leading-relaxed">
                {pendingBatch
                  ? 'This will recheck only the same unresolved payment requests using their original idempotency keys.'
                  : <>You are about to transfer <b>SLE {Number(amount).toLocaleString()}</b> each to <b>{selectedIds.length} staff members</b> from the designated payroll account.</>}
              </p>
              {progress && <p className="animate-pulse text-xs font-bold text-emerald-600">{progress}</p>}
              <div className="flex gap-2 pt-4">
                <button type="button" disabled={executing} onClick={() => void executePayroll()}
                  className="flex-1 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white transition disabled:opacity-50">
                  {executing ? 'Checking…' : pendingBatch ? 'Recheck Same Requests' : 'Confirm & Disburse'}
                </button>
                <button type="button" disabled={executing} onClick={() => setShowConfirm(false)}
                  className="rounded-xl bg-slate-100 px-4 py-3 text-xs font-bold text-slate-700">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
