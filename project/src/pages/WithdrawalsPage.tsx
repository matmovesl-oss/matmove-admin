import { useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';
import Spinner from '@/components/Spinner';
import EmptyState from '@/components/EmptyState';
import { useWithdrawals } from '@/lib/hooks';
import { formatSLE, timeAgo } from '@/lib/format';
import type { WithdrawalRequest } from '@/lib/types';
import {
  Banknote,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Loader2,
  Send,
  AlertTriangle,
} from 'lucide-react';

type WithdrawalWithCurrency = WithdrawalRequest & {
  currency?: 'SLE' | 'USD' | null;
};

const getStatusTone = (
  status: string
): 'amber' | 'emerald' | 'red' | 'blue' => {
  switch (status) {
    case 'completed':
      return 'emerald';

    case 'failed':
      return 'red';

    case 'processing':
      return 'blue';

    case 'pending':
    default:
      return 'amber';
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'completed':
      return 'Completed';

    case 'failed':
      return 'Failed';

    case 'processing':
      return 'Processing';

    case 'pending':
    default:
      return 'Pending';
  }
};

const formatCurrency = (
  amount: number,
  currency?: string | null
) => {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));
  }

  return formatSLE(Number(amount || 0));
};

export default function WithdrawalsPage() {
  const {
    items,
    loading,
    authorize,
    reject,
  } = useWithdrawals();

  const [busyId, setBusyId] =
    useState<string | null>(null);

  const [err, setErr] =
    useState<string | null>(null);

  const [authorizeTarget, setAuthorizeTarget] =
    useState<string | null>(null);

  const [rejectTarget, setRejectTarget] =
    useState<string | null>(null);

  const [notes, setNotes] =
    useState('');

  const selectedWithdrawal = useMemo(
    () =>
      items.find(
        (item) =>
          item.id ===
          (authorizeTarget || rejectTarget)
      ) as WithdrawalWithCurrency | undefined,
    [items, authorizeTarget, rejectTarget]
  );

  const stats = useMemo(
    () => ({
      pending: items.filter(
        (item) =>
          String(item.status) === 'pending'
      ).length,

      processing: items.filter(
        (item) =>
          String(item.status) === 'processing'
      ).length,

      completed: items.filter(
        (item) =>
          String(item.status) === 'completed'
      ).length,

      failed: items.filter(
        (item) =>
          String(item.status) === 'failed'
      ).length,

      pendingValue: items
        .filter(
          (item) =>
            String(item.status) === 'pending'
        )
        .reduce(
          (sum, item) =>
            sum + Number(item.amount || 0),
          0
        ),
    }),
    [items]
  );

  const handleAuthorize = async () => {
    if (!authorizeTarget) {
      return;
    }

    const id = authorizeTarget;

    setErr(null);
    setBusyId(id);

    try {
      await authorize(
        id,
        'Withdrawal authorized by admin for payout processing'
      );

      setAuthorizeTarget(null);
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : 'Authorization failed'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) {
      return;
    }

    const reason = notes.trim();

    if (!reason) {
      setErr(
        'A rejection reason is required.'
      );
      return;
    }

    const id = rejectTarget;

    setErr(null);
    setBusyId(id);

    try {
      await reject(id, reason);

      setRejectTarget(null);
      setNotes('');
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : 'Rejection failed'
      );
    } finally {
      setBusyId(null);
    }
  };

  const closeAuthorizeModal = () => {
    if (busyId) {
      return;
    }

    setAuthorizeTarget(null);
  };

  const closeRejectModal = () => {
    if (busyId) {
      return;
    }

    setRejectTarget(null);
    setNotes('');
  };

  return (
    <AdminLayout
      title="Payouts & Withdrawals"
      subtitle="Review, authorize and monitor customer withdrawal requests"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard
          label="Pending Requests"
          value={String(stats.pending)}
          icon={Clock}
          tone="amber"
        />

        <StatCard
          label="Pending Value"
          value={formatSLE(stats.pendingValue)}
          icon={Banknote}
          tone="indigo"
        />

        <StatCard
          label="Processing"
          value={String(stats.processing)}
          icon={Send}
          tone="indigo"
        />

        <StatCard
          label="Completed"
          value={String(stats.completed)}
          icon={CheckCircle2}
          tone="emerald"
        />

        <StatCard
          label="Failed"
          value={String(stats.failed)}
          icon={XCircle}
          tone="indigo"
        />
      </div>

      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />

          <div>
            <p className="text-sm font-semibold text-blue-900">
              Withdrawal processing workflow
            </p>

            <p className="text-sm text-blue-800 mt-1">
              Admin authorization moves a withdrawal from
              <strong> Pending</strong> to
              <strong> Processing</strong>. The customer's
              funds remain reserved until the payout provider
              confirms success or failure.
            </p>
          </div>
        </div>
      </div>

      {err && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <Spinner label="Loading withdrawal requests..." />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title="No withdrawal requests"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">
                    Requester
                  </th>

                  <th className="text-left px-5 py-3 font-medium">
                    Amount
                  </th>

                  <th className="text-left px-5 py-3 font-medium">
                    Provider
                  </th>

                  <th className="text-left px-5 py-3 font-medium">
                    Reference
                  </th>

                  <th className="text-left px-5 py-3 font-medium">
                    Status
                  </th>

                  <th className="text-left px-5 py-3 font-medium">
                    Submitted
                  </th>

                  <th className="text-right px-5 py-3 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {items.map((rawWithdrawal) => {
                  const withdrawal =
                    rawWithdrawal as WithdrawalWithCurrency;

                  const status =
                    String(withdrawal.status);

                  const isBusy =
                    busyId === withdrawal.id;

                  return (
                    <tr
                      key={withdrawal.id}
                      className="hover:bg-slate-50"
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">
                          {withdrawal.requester_name ||
                            'Unknown customer'}
                        </p>

                        {withdrawal.admin_notes && (
                          <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1 max-w-xs">
                            <ShieldAlert className="w-3 h-3 shrink-0" />

                            <span className="truncate">
                              {withdrawal.admin_notes}
                            </span>
                          </p>
                        )}
                      </td>

                      <td className="px-5 py-3 font-medium text-slate-900">
                        {formatCurrency(
                          withdrawal.amount,
                          withdrawal.currency
                        )}
                      </td>

                      <td className="px-5 py-3">
                        <Badge tone="blue">
                          {withdrawal.provider ||
                            'Mobile Money'}
                        </Badge>
                      </td>

                      <td className="px-5 py-3 font-mono text-xs text-slate-500">
                        {withdrawal.vult_reference ||
                          '—'}
                      </td>

                      <td className="px-5 py-3">
                        <Badge
                          tone={getStatusTone(
                            status
                          )}
                        >
                          {getStatusLabel(status)}
                        </Badge>
                      </td>

                      <td className="px-5 py-3 text-slate-500">
                        {timeAgo(
                          withdrawal.created_at
                        )}
                      </td>

                      <td className="px-5 py-3 text-right">
                        {status === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              disabled={isBusy}
                              onClick={() => {
                                setErr(null);
                                setAuthorizeTarget(
                                  withdrawal.id
                                );
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              <Send className="w-3.5 h-3.5" />

                              Authorize
                            </button>

                            <button
                              disabled={isBusy}
                              onClick={() => {
                                setErr(null);
                                setRejectTarget(
                                  withdrawal.id
                                );
                                setNotes('');
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : status ===
                          'processing' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-blue-600">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />

                            Awaiting provider
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* AUTHORIZE MODAL                                                  */}
      {/* ---------------------------------------------------------------- */}

      <Modal
        open={Boolean(authorizeTarget)}
        onClose={closeAuthorizeModal}
        title="Authorize Withdrawal"
        maxWidth="max-w-md"
      >
        {selectedWithdrawal && (
          <div className="space-y-5">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />

                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    Authorization is not settlement
                  </p>

                  <p className="text-sm text-amber-800 mt-1">
                    This action will move the withdrawal
                    to <strong>Processing</strong>.
                    The wallet will not be permanently
                    debited until the payout provider
                    confirms the result.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex justify-between gap-4">
                <span className="text-sm text-slate-500">
                  Requester
                </span>

                <span className="text-sm font-medium text-slate-900 text-right">
                  {selectedWithdrawal.requester_name ||
                    'Unknown customer'}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-sm text-slate-500">
                  Amount
                </span>

                <span className="text-sm font-semibold text-slate-900">
                  {formatCurrency(
                    selectedWithdrawal.amount,
                    selectedWithdrawal.currency
                  )}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-sm text-slate-500">
                  Provider
                </span>

                <span className="text-sm font-medium text-slate-900">
                  {selectedWithdrawal.provider ||
                    'Mobile Money'}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-sm text-slate-500">
                  Reference
                </span>

                <span className="text-xs font-mono text-slate-700 text-right break-all">
                  {selectedWithdrawal.vult_reference ||
                    '—'}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                disabled={Boolean(busyId)}
                onClick={closeAuthorizeModal}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                disabled={Boolean(busyId)}
                onClick={handleAuthorize}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              >
                {busyId ===
                selectedWithdrawal.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />

                    Authorizing...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />

                    Move to Processing
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------------------------------------------------------------- */}
      {/* REJECT MODAL                                                     */}
      {/* ---------------------------------------------------------------- */}

      <Modal
        open={Boolean(rejectTarget)}
        onClose={closeRejectModal}
        title="Reject Withdrawal"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />

              <div>
                <p className="text-sm font-semibold text-red-900">
                  Reservation will be released
                </p>

                <p className="text-sm text-red-800 mt-1">
                  Rejecting this pending withdrawal will
                  mark it as failed and release the
                  customer's reserved funds back to their
                  available wallet balance.
                </p>
              </div>
            </div>
          </div>

          {selectedWithdrawal && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex justify-between gap-4">
                <span className="text-sm text-slate-500">
                  Withdrawal
                </span>

                <span className="text-sm font-medium text-slate-900">
                  {formatCurrency(
                    selectedWithdrawal.amount,
                    selectedWithdrawal.currency
                  )}
                </span>
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="withdrawal-rejection-reason"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Rejection reason
            </label>

            <textarea
              id="withdrawal-rejection-reason"
              value={notes}
              onChange={(e) =>
                setNotes(e.target.value)
              }
              rows={4}
              placeholder="Explain why this withdrawal is being rejected..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />

            <p className="text-xs text-slate-500 mt-1.5">
              This reason will be stored with the
              withdrawal and included in the Admin audit
              trail.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              disabled={Boolean(busyId)}
              onClick={closeRejectModal}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              disabled={
                Boolean(busyId) ||
                !notes.trim()
              }
              onClick={handleReject}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {busyId === rejectTarget ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />

                  Rejecting...
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" />

                  Confirm Rejection
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  );
}