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
import { Banknote, Clock, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';

const statusTone: Record<WithdrawalStatus, 'amber' | 'emerald' | 'red'> = {
  pending: 'amber',
  completed: 'emerald',
  failed: 'red',
};

export default function WithdrawalsPage() {
  const { items, loading, authorize, reject } = useWithdrawals();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const stats = useMemo(() => ({
    pending: items.filter((i) => i.status === 'pending').length,
    completed: items.filter((i) => i.status === 'completed').length,
    failed: items.filter((i) => i.status === 'failed').length,
    pendingValue: items.filter((i) => i.status === 'pending').reduce((s, i) => s + i.amount, 0),
  }), [items]);

  const handleAuthorize = async (id: string) => {
    setErr(null);
    setBusyId(id);
    try {
      await authorize(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Authorization failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setErr(null);
    setBusyId(rejectTarget);
    try {
      await reject(rejectTarget, notes.trim() || 'Rejected by admin');
      setRejectTarget(null);
      setNotes('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Rejection failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminLayout
      title="Payouts & Withdrawals"
      subtitle="Authorize or reject pending Vult payout requests"
    >
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Pending Requests" value={String(stats.pending)} icon={Clock} tone="amber" />
        <StatCard label="Pending Value" value={formatSLE(stats.pendingValue)} icon={Banknote} tone="indigo" />
        <StatCard label="Completed" value={String(stats.completed)} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Failed" value={String(stats.failed)} icon={XCircle} tone="indigo" />
      </div>

      {err && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{err}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <Spinner label="Loading withdrawal requests..." />
        ) : items.length === 0 ? (
          <EmptyState icon={Banknote} title="No withdrawal requests" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Requester</th>
                  <th className="text-left px-5 py-3 font-medium">Amount</th>
                  <th className="text-left px-5 py-3 font-medium">Provider</th>
                  <th className="text-left px-5 py-3 font-medium">Reference</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-left px-5 py-3 font-medium">Submitted</th>
                  <th className="text-right px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{w.requester_name}</p>
                      {w.admin_notes && <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1"><ShieldAlert className="w-3 h-3" />{w.admin_notes}</p>}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900">{formatSLE(w.amount)}</td>
                    <td className="px-5 py-3"><Badge tone="blue">{w.provider}</Badge></td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{w.vult_reference || '—'}</td>
                    <td className="px-5 py-3"><Badge tone={statusTone[w.status]}>{w.status}</Badge></td>
                    <td className="px-5 py-3 text-slate-500">{timeAgo(w.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      {w.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            disabled={busyId === w.id}
                            onClick={() => handleAuthorize(w.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Authorize Payout
                          </button>
                          <button
                            disabled={busyId === w.id}
                            onClick={() => { setRejectTarget(w.id); setNotes(''); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)} title="Reject Withdrawal" maxWidth="max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Add an admin note explaining why this payout is being rejected. This will be stored with the request and visible in audit logs.</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="e.g. Duplicate vult reference detected. Please contact support."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setRejectTarget(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200">Cancel</button>
            <button onClick={handleReject} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700">Confirm Rejection</button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  );
}
