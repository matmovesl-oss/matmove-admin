import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import {
  AlertTriangle,
  CreditCard,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';

type StaffWallet = {
  id: string;
  currency: string;
  monime_account_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type StaffProfile = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_number?: string | null;
  wallets?: StaffWallet[];
};

type PayrollBalance = {
  currency: 'SLE';
  value: number;
};

type PayrollResult = {
  staffId: string;
  name: string;
  status: string;
  message?: string;
  payrollId?: string;
  transferId?: string;
};

type PendingPayrollBatch = {
  keys: Record<string, string>;
  amount: string;
  reason: string;
};

const PAYROLL_PENDING_KEYS = 'matmove.admin.payroll.pending.v1';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    isRecord(error) &&
    typeof error.message === 'string' &&
    error.message.length > 0
  ) {
    return error.message;
  }

  return fallback;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Reads any saved in-progress payroll request keys.
 * Invalid or malformed browser storage is ignored rather than trusted.
 */
function readPendingBatch(): PendingPayrollBatch {
  const emptyBatch: PendingPayrollBatch = {
    keys: {},
    amount: '',
    reason: '',
  };

  try {
    if (typeof window === 'undefined') {
      return emptyBatch;
    }

    const storedValue = window.sessionStorage.getItem(PAYROLL_PENDING_KEYS);
    if (!storedValue) {
      return emptyBatch;
    }

    const parsed: unknown = JSON.parse(storedValue);

    if (!isRecord(parsed) || !isRecord(parsed.keys)) {
      return emptyBatch;
    }

    // Explicitly build a string-to-string map. Object.entries() otherwise
    // produces unknown values for data parsed from JSON.
    const keys: Record<string, string> = {};

    for (const [staffId, requestKey] of Object.entries(parsed.keys)) {
      if (
        UUID_PATTERN.test(staffId) &&
        typeof requestKey === 'string' &&
        UUID_PATTERN.test(requestKey)
      ) {
        keys[staffId] = requestKey;
      }
    }

    return {
      keys,
      amount: typeof parsed.amount === 'string' ? parsed.amount : '',
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    };
  } catch {
    // Browser storage can be unavailable or contain invalid JSON.
    return emptyBatch;
  }
}

export function AdministrativePayrollPage() {
  const [savedBatch] = useState<PendingPayrollBatch>(() => readPendingBatch());
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    Object.keys(savedBatch.keys),
  );
  const [amount, setAmount] = useState(savedBatch.amount);
  const [reason, setReason] = useState(
    savedBatch.reason || 'Administrative Payroll',
  );
  const [showConfirm, setShowConfirm] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [payrollBalance, setPayrollBalance] =
    useState<PayrollBalance | null>(null);
  const [payrollAccountId, setPayrollAccountId] = useState('');
  const [payrollAccountName, setPayrollAccountName] = useState(
    'Staff Payroll Account',
  );
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState('');
  const [results, setResults] = useState<PayrollResult[]>([]);

  // Keep the same idempotency key while a transfer is pending or uncertain.
  const requestKeys = useRef<Record<string, string>>(savedBatch.keys);
  const [pendingRequestIds, setPendingRequestIds] = useState<string[]>(() =>
    Object.keys(savedBatch.keys),
  );

  const saveRequestKeys = () => {
    try {
      if (Object.keys(requestKeys.current).length > 0) {
        window.sessionStorage.setItem(
          PAYROLL_PENDING_KEYS,
          JSON.stringify({
            keys: requestKeys.current,
            amount,
            reason,
          }),
        );
      } else {
        window.sessionStorage.removeItem(PAYROLL_PENDING_KEYS);
      }
    } catch {
      // Session storage may be unavailable in private or restricted contexts.
    }
  };

  const refreshPayrollBalance = useCallback(async () => {
    setBalanceLoading(true);
    setBalanceError('');

    try {
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Sign in again to view the Payroll Account.');
      }

      const response = await fetch('/api/admin-pay-staff', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        cache: 'no-store',
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const message = isRecord(data) ? stringValue(data.error) : undefined;
        throw new Error(message || 'Payroll Account balance is unavailable.');
      }

      if (!isRecord(data) || !isRecord(data.balance)) {
        throw new Error(
          'Monime did not return a verified SLE payroll account and balance.',
        );
      }

      const balance = data.balance;
      if (
        data.currency !== 'SLE' ||
        balance.currency !== 'SLE' ||
        typeof balance.value !== 'number' ||
        !Number.isSafeInteger(balance.value) ||
        balance.value < 0 ||
        typeof data.accountId !== 'string' ||
        data.accountId.length === 0
      ) {
        throw new Error(
          'Monime did not return a verified SLE payroll account and balance.',
        );
      }

      setPayrollAccountId(data.accountId);
      setPayrollAccountName(
        typeof data.accountName === 'string' && data.accountName
          ? data.accountName
          : 'Staff Payroll Account',
      );
      setPayrollBalance({
        currency: 'SLE',
        value: balance.value,
      });
    } catch (caughtError: unknown) {
      setPayrollBalance(null);
      setPayrollAccountId('');
      setBalanceError(
        errorMessage(caughtError, 'Payroll balance could not be loaded.'),
      );
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const { data, error: queryError } = await supabase
        .from('profiles')
        .select(
          'id,full_name,email,phone,phone_number,wallets(id,currency,monime_account_id,metadata)',
        )
        .eq('role', 'staff')
        .order('full_name');

      if (queryError) {
        throw queryError;
      }

      setStaffList((data || []) as StaffProfile[]);
    } catch (caughtError: unknown) {
      setError(
        errorMessage(caughtError, 'Staff directory could not be loaded.'),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStaff();
    void refreshPayrollBalance();
  }, [fetchStaff, refreshPayrollBalance]);

  const filtered = staffList.filter((staff) => {
    if (!search.trim()) {
      return true;
    }

    const term = search.toLowerCase();
    return (
      staff.full_name?.toLowerCase().includes(term) ||
      staff.email?.toLowerCase().includes(term) ||
      (staff.phone || staff.phone_number || '').includes(term)
    );
  });

  const toggleSelection = (staffId: string) => {
    if (pendingRequestIds.length > 0 || executing) {
      return;
    }

    setSelectedIds((previous) =>
      previous.includes(staffId)
        ? previous.filter((id) => id !== staffId)
        : [...previous, staffId],
    );
  };

  const toggleAll = () => {
    if (pendingRequestIds.length > 0 || executing) {
      return;
    }

    setSelectedIds((previous) =>
      filtered.length > 0 &&
      filtered.every((staff) => previous.includes(staff.id))
        ? previous.filter(
            (id) => !filtered.some((staff) => staff.id === id),
          )
        : [...new Set([...previous, ...filtered.map((staff) => staff.id)])],
    );
  };

  const executePayroll = async () => {
    const numericAmount = Number(amount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0 ||
      selectedIds.length === 0 ||
      !reason.trim() ||
      executing
    ) {
      return;
    }

    setExecuting(true);
    setError('');
    setSuccess('');
    setProgress('');

    try {
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Session expired. Sign in again.');
      }

      const token = sessionData.session.access_token;
      const staffToPay = staffList.filter((staff) =>
        selectedIds.includes(staff.id),
      );

      let completed = 0;
      let pending = 0;
      let failed = 0;

      const nextResults: PayrollResult[] = [];
      const pendingIds: string[] = [];

      for (let index = 0; index < staffToPay.length; index += 1) {
        const staff = staffToPay[index];
        const staffName =
          staff.full_name || staff.email || 'Staff member';

        setProgress(
          `Processing ${index + 1}/${staffToPay.length}: ${
            staff.full_name || staff.email || staff.id
          }`,
        );

        const requestKey =
          requestKeys.current[staff.id] || crypto.randomUUID();

        requestKeys.current[staff.id] = requestKey;
        saveRequestKeys();

        try {
          const response = await fetch('/api/admin-pay-staff', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              staffUserId: staff.id,
              amount,
              reason: reason.trim(),
              requestKey,
            }),
          });

          const parsedBody: unknown = await response
            .json()
            .catch(() => ({}));
          const body = isRecord(parsedBody) ? parsedBody : {};
          const status = (stringValue(body.status) || '').toLowerCase();
          const payrollId = stringValue(body.payrollId);
          const transferId = stringValue(body.providerTransferId);
          const responseMessage =
            stringValue(body.error) || stringValue(body.message);

          if (status === 'completed') {
            completed += 1;
            delete requestKeys.current[staff.id];

            nextResults.push({
              staffId: staff.id,
              name: staffName,
              status,
              payrollId,
              transferId,
            });
          } else if (
            ['pending', 'processing', 'review_required'].includes(status)
          ) {
            pending += 1;
            pendingIds.push(staff.id);

            nextResults.push({
              staffId: staff.id,
              name: staffName,
              status,
              message:
                responseMessage ||
                'Use the same payment request to check its status.',
              payrollId,
              transferId,
            });
          } else if (status === 'failed') {
            failed += 1;
            delete requestKeys.current[staff.id];

            nextResults.push({
              staffId: staff.id,
              name: staffName,
              status,
              message:
                responseMessage || 'Monime marked this payment as failed.',
              payrollId,
            });
          } else if (response.status >= 500 || response.status === 429) {
            // The provider may have accepted the transfer before the server
            // or network failed. Retain the key and require reconciliation.
            pending += 1;
            pendingIds.push(staff.id);

            nextResults.push({
              staffId: staff.id,
              name: staffName,
              status: 'review_required',
              message:
                responseMessage ||
                `The server returned HTTP ${response.status}. Check this same request before starting another payment.`,
              payrollId,
              transferId,
            });
          } else {
            delete requestKeys.current[staff.id];
            failed += 1;

            nextResults.push({
              staffId: staff.id,
              name: staffName,
              status: 'error',
              message:
                responseMessage ||
                `Payroll request failed (HTTP ${response.status}).`,
            });
          }
        } catch (caughtError: unknown) {
          // Keep the request key because the transfer may have reached Monime.
          pending += 1;
          pendingIds.push(staff.id);

          nextResults.push({
            staffId: staff.id,
            name: staffName,
            status: 'review_required',
            message: errorMessage(
              caughtError,
              'Connection interrupted. Check using the same request.',
            ),
          });
        }
      }

      setResults(nextResults);
      setPendingRequestIds(pendingIds);
      setSelectedIds(pendingIds);
      saveRequestKeys();

      setSuccess(
        `Payroll run: ${completed} completed, ${pending} pending or requiring review, ${failed} failed.`,
      );

      if (pending === 0) {
        setShowConfirm(false);
        setAmount('');
        setReason('Administrative Payroll');
        requestKeys.current = {};
        saveRequestKeys();
      }

      await refreshPayrollBalance();
    } catch (caughtError: unknown) {
      setError(errorMessage(caughtError, 'Payroll operation failed.'));
    } finally {
      setExecuting(false);
      setProgress('');
    }
  };

  const totalRequested = Number(amount || 0) * selectedIds.length;

  return (
    <AdminLayout
      title="Administrative Payroll"
      subtitle="Pay staff from the verified Monime Payroll Account. Transfers are recorded and reconciled individually."
    >
      <div className="mt-6 max-w-6xl space-y-6">
        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-800"
          >
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <Search size={18} className="text-slate-400" />
              <input
                type="text"
                placeholder="Search staff members..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full text-sm font-medium outline-none"
              />
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              {loading ? (
                <div className="p-8 text-center text-slate-400">
                  <Loader2 className="mx-auto mb-2 animate-spin" />
                  Loading Staff Database...
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="w-12 p-4 text-center">
                        <input
                          type="checkbox"
                          checked={
                            selectedIds.length > 0 &&
                            filtered.length > 0 &&
                            filtered.every((staff) =>
                              selectedIds.includes(staff.id),
                            )
                          }
                          disabled={
                            pendingRequestIds.length > 0 || executing
                          }
                          onChange={toggleAll}
                          aria-label="Select all filtered staff"
                          className="h-4 w-4 cursor-pointer rounded text-emerald-600"
                        />
                      </th>
                      <th className="p-4">Staff Member</th>
                      <th className="p-4">Contact</th>
                      <th className="p-4">SLE Wallet</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((staff) => {
                      const sleWallets =
                        staff.wallets?.filter(
                          (wallet) => wallet.currency === 'SLE',
                        ) || [];

                      const linked =
                        sleWallets.length === 1 &&
                        Boolean(
                          sleWallets[0].monime_account_id ||
                            sleWallets[0].metadata?.monime_account_id,
                        );

                      return (
                        <tr
                          key={staff.id}
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={() => toggleSelection(staff.id)}
                        >
                          <td className="p-4 text-center">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(staff.id)}
                              disabled={
                                pendingRequestIds.length > 0 || executing
                              }
                              readOnly
                              aria-label={`Select ${staff.full_name || staff.email || 'staff member'}`}
                              className="h-4 w-4 cursor-pointer rounded text-emerald-600"
                            />
                          </td>

                          <td className="p-4">
                            <div className="text-sm font-bold text-slate-900">
                              {staff.full_name || 'Staff User'}
                            </div>
                            <div className="mt-1 inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                              STAFF
                            </div>
                          </td>

                          <td className="p-4 font-medium text-slate-500">
                            {staff.email || '—'}
                            <br />
                            {staff.phone || staff.phone_number || 'No phone'}
                          </td>

                          <td className="p-4">
                            {linked ? (
                              <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                                <ShieldCheck size={13} />
                                Linked — server verifies
                              </span>
                            ) : (
                              <span className="font-semibold text-amber-700">
                                Not verified
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {filtered.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="p-8 text-center text-slate-400"
                        >
                          No staff members found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="sticky top-6 space-y-5 rounded-3xl bg-slate-950 p-6 text-white">
            <h3 className="flex items-center gap-2 font-bold text-emerald-400">
              <CreditCard size={18} />
              Execute Payroll
            </h3>

            <div className="rounded-2xl border border-white/5 bg-white/10 p-4">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Live Payroll Account
              </p>

              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-black text-emerald-400">
                  {balanceLoading
                    ? 'Checking...'
                    : payrollBalance
                      ? `SLE ${(payrollBalance.value / 100).toLocaleString(
                          undefined,
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          },
                        )}`
                      : 'Unavailable'}
                </p>

                <button
                  type="button"
                  onClick={() => void refreshPayrollBalance()}
                  disabled={balanceLoading}
                  aria-label="Refresh payroll balance"
                  className="rounded-lg bg-slate-800 p-2 hover:bg-slate-700 disabled:opacity-50"
                >
                  <RefreshCw
                    size={14}
                    className={balanceLoading ? 'animate-spin' : ''}
                  />
                </button>
              </div>

              <p className="mt-2 break-all text-[10px] text-slate-400">
                {payrollAccountName}
                {payrollAccountId ? ` · ${payrollAccountId}` : ''}
              </p>

              {balanceError && (
                <p className="mt-2 text-xs text-rose-300">{balanceError}</p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/10 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Selected Staff
              </p>
              <p className="text-xl font-black">{selectedIds.length}</p>
            </div>

            <div>
              <label
                htmlFor="payroll-amount"
                className="mb-2 block text-xs font-bold text-slate-400"
              >
                Amount Per Staff (SLE)
              </label>
              <input
                id="payroll-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                disabled={pendingRequestIds.length > 0 || executing}
                onChange={(event) => setAmount(event.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 p-3 text-lg font-bold outline-none focus:border-emerald-500"
                placeholder="0.00"
              />
            </div>

            <div>
              <label
                htmlFor="payroll-reason"
                className="mb-2 block text-xs font-bold text-slate-400"
              >
                Payroll Memo / Period
              </label>
              <input
                id="payroll-reason"
                type="text"
                maxLength={140}
                value={reason}
                disabled={pendingRequestIds.length > 0 || executing}
                onChange={(event) => setReason(event.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm font-medium outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 pt-4 font-bold">
              <span className="text-slate-300">Total Requested:</span>
              <span className="text-emerald-400">
                SLE{' '}
                {totalRequested.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={
                selectedIds.length === 0 ||
                !amount ||
                !Number.isFinite(Number(amount)) ||
                Number(amount) <= 0 ||
                !reason.trim() ||
                balanceLoading ||
                !payrollBalance ||
                executing
              }
              className="w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-bold shadow-md transition hover:bg-emerald-500 disabled:opacity-50"
            >
              Review Transfer
            </button>
          </div>
        </div>

        {pendingRequestIds.length > 0 && (
          <p className="text-xs font-semibold text-amber-700">
            There are payments still pending or requiring review. The same
            request keys are retained in this browser tab; do not start a
            second payment for these staff members.
          </p>
        )}

        {results.length > 0 && (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="font-bold text-slate-900">Latest payroll run</h3>

            {results.map((result) => (
              <div
                key={result.staffId}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-800">
                    {result.name}
                  </div>

                  {result.message && (
                    <div className="mt-1 text-slate-500">
                      {result.message}
                    </div>
                  )}

                  {result.transferId && (
                    <div className="mt-1 font-mono text-slate-400">
                      {result.transferId}
                    </div>
                  )}
                </div>

                <span
                  className={`rounded-full px-2 py-1 font-bold ${
                    result.status === 'completed'
                      ? 'bg-emerald-50 text-emerald-700'
                      : result.status === 'failed' ||
                          result.status === 'error'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {result.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}

        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 text-slate-900 shadow-2xl">
              <div className="mb-2 flex items-center gap-3 text-amber-600">
                <AlertTriangle size={24} />
                <h3 className="text-base font-bold">Confirm Payroll</h3>
              </div>

              <p className="text-sm leading-relaxed">
                You are about to transfer{' '}
                <b>
                  SLE{' '}
                  {Number(amount).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </b>{' '}
                each to <b>{selectedIds.length} staff members</b> from{' '}
                <b>{payrollAccountId}</b>.
              </p>

              {progress && (
                <p className="animate-pulse text-xs font-bold text-emerald-600">
                  {progress}
                </p>
              )}

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  disabled={executing}
                  onClick={() => void executePayroll()}
                  className="flex-1 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  {executing ? 'Processing...' : 'Confirm & Disburse'}
                </button>

                <button
                  type="button"
                  disabled={executing}
                  onClick={() => setShowConfirm(false)}
                  className="rounded-xl bg-slate-100 px-4 py-3 text-xs font-bold text-slate-700"
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
