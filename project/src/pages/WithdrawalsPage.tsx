import { useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';
import Spinner from '@/components/Spinner';
import EmptyState from '@/components/EmptyState';
import { useWithdrawals } from '@/lib/hooks';
import { formatSLE, timeAgo } from '@/lib/format';
import type { WithdrawalStatus } from '@/lib/types';
import {
  Banknote,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Smartphone,
  User,
  DollarSign,
} from 'lucide-react';

type DisplayStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

const statusTone: Record<
  DisplayStatus,
  'amber' | 'emerald' | 'red' | 'blue'
> = {
  pending: 'amber',
  processing: 'blue',
  completed: 'emerald',
  failed: 'red',
};

const statusLabel: Record<DisplayStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
};

function normalizeStatus(
  status: WithdrawalStatus | string,
): DisplayStatus {
  if (status === 'processing') return 'processing';
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';

  return 'pending';
}

function getCurrencyLabel(currency?: string) {
  return currency === 'USD' ? 'USD' : 'SLE';
}

function formatMoney(
  amount: number,
  currency?: string,
) {
  if (getCurrencyLabel(currency) === 'USD') {
    return `$${Number(amount || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return formatSLE(amount);
}

function getPhone(item: {
  phone?: string;
  phone_number?: string;
}) {
  return item.phone || item.phone_number || 'Phone on file';
}

export default function WithdrawalsPage() {
  const {
    items,
    loading,
    error,
    authorize,
    reject,
    refetch,
  } = useWithdrawals();

  const [busyId, setBusyId] =
    useState<string | null>(null);

  const [err, setErr] =
    useState<string | null>(null);

  const [rejectTarget, setRejectTarget] =
    useState<string | null>(null);

  const [notes, setNotes] = useState('');

  const [filter, setFilter] =
    useState<'all' | DisplayStatus>('all');

  const stats = useMemo(() => {
    const normalized = items.map((item) => ({
      ...item,
      normalizedStatus: normalizeStatus(item.status),
      currency: getCurrencyLabel(
        (item as typeof item & {
          currency?: string;
        }).currency,
      ),
    }));

    const pendingItems = normalized.filter(
      (item) =>
        item.normalizedStatus === 'pending',
    );

    const processingItems = normalized.filter(
      (item) =>
        item.normalizedStatus === 'processing',
    );

    return {
      pending: pendingItems.length,

      processing: processingItems.length,

      completed: normalized.filter(
        (item) =>
          item.normalizedStatus === 'completed',
      ).length,

      failed: normalized.filter(
        (item) =>
          item.normalizedStatus === 'failed',
      ).length,

      pendingSle: pendingItems
        .filter((item) => item.currency === 'SLE')
        .reduce(
          (sum, item) =>
            sum + Number(item.amount || 0),
          0,
        ),

      pendingUsd: pendingItems
        .filter((item) => item.currency === 'USD')
        .reduce(
          (sum, item) =>
            sum + Number(item.amount || 0),
          0,
        ),

      processingSle: processingItems
        .filter((item) => item.currency === 'SLE')
        .reduce(
          (sum, item) =>
            sum + Number(item.amount || 0),
          0,
        ),

      processingUsd: processingItems
        .filter((item) => item.currency === 'USD')
        .reduce(
          (sum, item) =>
            sum + Number(item.amount || 0),
          0,
        ),
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filter === 'all') {
      return items;
    }

    return items.filter(
      (item) =>
        normalizeStatus(item.status) === filter,
    );
  }, [items, filter]);

  const rejectItem = useMemo(
    () =>
      items.find(
        (item) => item.id === rejectTarget,
      ) || null,
    [items, rejectTarget],
  );

  const handleAuthorize = async (
    id: string,
  ) => {
    setErr(null);
    setBusyId(id);

    try {
      await authorize(id);
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : 'Authorization failed. No funds were released.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;

    setErr(null);
    setBusyId(rejectTarget);

    try {
      await reject(
        rejectTarget,
        notes.trim() || 'Rejected by admin',
      );

      setRejectTarget(null);
      setNotes('');
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : 'Rejection failed. The withdrawal was not changed.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleRefresh = async () => {
    setErr(null);

    try {
      await refetch();
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : 'Unable to refresh withdrawal data.',
      );
    }
  };

  return (
    <AdminLayout
      title="Payouts & Withdrawals"
      subtitle="Review, authorize, and monitor customer withdrawal requests"
    >
      {/* =====================================================
          FINANCIAL SUMMARY
          ===================================================== */}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        <StatCard
          label="Pending Requests"
          value={String(stats.pending)}
          icon={Clock}
          tone="amber"
        />

        <StatCard
          label="Pending SLE"
          value={formatSLE(stats.pendingSle)}
          icon={Banknote}
          tone="indigo"
        />

        <StatCard
          label="Pending USD"
          value={`$${stats.pendingUsd.toLocaleString(
            'en-US',
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            },
          )}`}
          icon={DollarSign}
          tone="indigo"
        />

        <StatCard
          label="Processing"
          value={String(stats.processing)}
          icon={RefreshCw}
          tone="indigo"
        />

        <StatCard
          label="Completed"
          value={String(stats.completed)}
          icon={CheckCircle2}
          tone="emerald"
        />
      </div>

      {/* =====================================================
          PROCESSING / FAILED SUMMARY
          ===================================================== */}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-4">
          <div className="flex items-start gap-3">
            <RefreshCw className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Processing SLE
              </p>

              <p className="text-xl font-bold text-blue-900 mt-1">
                {formatSLE(stats.processingSle)}
              </p>

              <p className="text-xs text-blue-700 mt-1">
                Reserved while awaiting final settlement
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-4">
          <div className="flex items-start gap-3">
            <DollarSign className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Processing USD
              </p>

              <p className="text-xl font-bold text-blue-900 mt-1">
                ${stats.processingUsd.toLocaleString(
                  'en-US',
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  },
                )}
              </p>

              <p className="text-xs text-blue-700 mt-1">
                Reserved while awaiting final settlement
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Failed Withdrawals
              </p>

              <p className="text-xl font-bold text-red-900 mt-1">
                {stats.failed}
              </p>

              <p className="text-xs text-red-700 mt-1">
                Failed or rejected requests
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================
          FINANCIAL CONTROL NOTICE
          ===================================================== */}

      <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />

          <div>
            <p className="text-sm font-semibold text-indigo-900">
              Withdrawal funds are reserved before payout settlement
            </p>

            <p className="text-sm text-indigo-700 mt-1">
              Authorizing a withdrawal moves it into
              processing. The customer&apos;s reserved balance
              remains protected until the payout provider confirms
              settlement. A failed or rejected withdrawal releases
              the reservation.
            </p>
          </div>
        </div>
      </div>

      {/* =====================================================
          ERRORS
          ===================================================== */}

      {(err || error) && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />

          <span>{err || error}</span>
        </div>
      )}

      {/* =====================================================
          TOOLBAR
          ===================================================== */}

      <div className="mb-4 bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['all', 'All', items.length],
                ['pending', 'Pending', stats.pending],
                [
                  'processing',
                  'Processing',
                  stats.processing,
                ],
                [
                  'completed',
                  'Completed',
                  stats.completed,
                ],
                ['failed', 'Failed', stats.failed],
              ] as const
            ).map(
              ([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setFilter(value)
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    filter === value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label} ({count})
                </button>
              ),
            )}
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}

            Refresh
          </button>
        </div>
      </div>

      {/* =====================================================
          WITHDRAWAL TABLE
          ===================================================== */}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <Spinner label="Loading withdrawal requests..." />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title={
              filter === 'all'
                ? 'No withdrawal requests'
                : `No ${
                    statusLabel[
                      filter as DisplayStatus
                    ]
                  } withdrawals`
            }
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
                    Destination
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
                {filteredItems.map((w) => {
                  const normalizedStatus =
                    normalizeStatus(w.status);

                  const currency =
                    getCurrencyLabel(
                      (
                        w as typeof w & {
                          currency?: string;
                        }
                      ).currency,
                    );

                  const isBusy =
                    busyId === w.id;

                  const phone = getPhone(
                    w as typeof w & {
                      phone?: string;
                      phone_number?: string;
                    },
                  );

                  return (
                    <tr
                      key={w.id}
                      className="hover:bg-slate-50"
                    >
                      {/* Requester */}
                      <td className="px-5 py-4 min-w-[190px]">
                        <div className="flex items-start gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-slate-500" />
                          </div>

                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">
                              {w.requester_name ||
                                'Unknown customer'}
                            </p>

                            {w.admin_notes && (
                              <p className="text-xs text-amber-600 mt-1 flex items-start gap-1">
                                <ShieldAlert className="w-3 h-3 mt-0.5 shrink-0" />

                                <span>
                                  {w.admin_notes}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <p className="font-semibold text-slate-900">
                          {formatMoney(
                            w.amount,
                            currency,
                          )}
                        </p>

                        <p className="text-xs text-slate-500 mt-0.5">
                          {currency}
                        </p>
                      </td>

                      {/* Destination */}
                      <td className="px-5 py-4 min-w-[150px]">
                        <div className="flex items-center gap-2 text-slate-700">
                          <Smartphone className="w-4 h-4 text-slate-400" />

                          <span>
                            {phone}
                          </span>
                        </div>
                      </td>

                      {/* Provider */}
                      <td className="px-5 py-4">
                        <Badge tone="blue">
                          {w.provider ||
                            'Mobile Money'}
                        </Badge>
                      </td>

                      {/* Reference */}
                      <td className="px-5 py-4">
                        <span className="font-mono text-xs text-slate-500">
                          {w.vult_reference || '—'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <Badge
                          tone={
                            statusTone[
                              normalizedStatus
                            ]
                          }
                        >
                          {
                            statusLabel[
                              normalizedStatus
                            ]
                          }
                        </Badge>
                      </td>

                      {/* Submitted */}
                      <td className="px-5 py-4 text-slate-500 whitespace-nowrap">
                        {timeAgo(w.created_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        {normalizedStatus ===
                        'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                handleAuthorize(
                                  w.id,
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              {isBusy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}

                              Authorize
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setRejectTarget(
                                  w.id,
                                );
                                setNotes('');
                                setErr(null);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />

                              Reject
                            </button>
                          </div>
                        ) : normalizedStatus ===
                          'processing' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-blue-600">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />

                            Awaiting settlement
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">
                            No action
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

      {/* =====================================================
          PROCESSING EXPLANATION
          ===================================================== */}

      {stats.processing > 0 && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <RefreshCw className="w-4 h-4 text-blue-600 mt-0.5" />

            <div className="text-sm text-blue-800">
              <p className="font-semibold">
                {stats.processing}{' '}
                withdrawal
                {stats.processing === 1
                  ? ''
                  : 's'} awaiting settlement
              </p>

              <div className="mt-1 space-y-0.5">
                {stats.processingSle > 0 && (
                  <p>
                    SLE:{' '}
                    <strong>
                      {formatSLE(
                        stats.processingSle,
                      )}
                    </strong>
                  </p>
                )}

                {stats.processingUsd > 0 && (
                  <p>
                    USD:{' '}
                    <strong>
                      $
                      {stats.processingUsd.toLocaleString(
                        'en-US',
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        },
                      )}
                    </strong>
                  </p>
                )}

                <p className="pt-1">
                  These customer reservations should
                  remain protected until the payment
                  provider returns a final result.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          REJECTION MODAL
          ===================================================== */}

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => {
          if (!busyId) {
            setRejectTarget(null);
            setNotes('');
          }
        }}
        title="Reject Withdrawal"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs text-slate-500">
              Withdrawal
            </p>

            <p className="font-medium text-slate-900 mt-0.5">
              {rejectItem?.requester_name ||
                'Unknown customer'}
            </p>

            {rejectItem && (
              <p className="text-sm text-slate-700 mt-1">
                {formatMoney(
                  rejectItem.amount,
                  (
                    rejectItem as typeof rejectItem & {
                      currency?: string;
                    }
                  ).currency,
                )}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />

              <p className="text-sm text-amber-800">
                Rejecting this request should release
                the customer&apos;s reserved withdrawal
                balance through the secure backend
                workflow.
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-600">
            Add an admin note explaining why this
            withdrawal is being rejected. The secure
            backend operation records the decision in
            the audit trail.
          </p>

          <textarea
            value={notes}
            onChange={(e) =>
              setNotes(e.target.value)
            }
            rows={4}
            disabled={Boolean(busyId)}
            placeholder="e.g. Duplicate payout reference detected. Please contact support."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={Boolean(busyId)}
              onClick={() => {
                setRejectTarget(null);
                setNotes('');
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={Boolean(busyId)}
              onClick={handleReject}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {busyId ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}

              Confirm Rejection
            </button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  );
}