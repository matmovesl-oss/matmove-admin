import { useMemo, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';
import Spinner from '@/components/Spinner';
import EmptyState from '@/components/EmptyState';
import { timeAgo } from '@/lib/format';
import { FileCheck, Clock, CheckCircle2, XCircle, IdCard, User, ShieldCheck, FileSearch } from 'lucide-react';

const statusBadge: Record<string, { tone: 'amber' | 'emerald' | 'red'; label: string }> = {
  pending: { tone: 'amber', label: 'Pending' },
  approved: { tone: 'emerald', label: 'Approved' },
  rejected: { tone: 'red', label: 'Rejected' },
};

export default function KycPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [active, setActive] = useState<any | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fetchLivePendingKYC = async () => {
    setLoading(true);
    try {
      // Pull only drivers and merchants for KYC
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['driver', 'merchant'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error("Error fetching live KYC queue:", err);
      setErr("Failed to load live data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLivePendingKYC();
  }, []);

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.kyc_status === filter)),
    [items, filter]
  );

  const stats = useMemo(() => ({
    pending: items.filter((i) => i.kyc_status === 'pending').length,
    approved: items.filter((i) => i.kyc_status === 'approved').length,
    rejected: items.filter((i) => i.kyc_status === 'rejected').length,
  }), [items]);

  const handleAction = async (id: string, status: string) => {
    setErr(null);
    setBusyId(id);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ kyc_status: status })
        .eq('id', id);

      if (error) throw error;
      
      setActive((prev: any) => (prev && prev.id === id ? { ...prev, kyc_status: status } : prev));
      fetchLivePendingKYC();
    } catch (e: any) {
      setErr(e.message || 'Failed to update status');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminLayout
      title="KYC & Onboarding Approvals"
      subtitle="Verify driver and vendor identity documents before activation"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Pending Review" value={String(stats.pending)} icon={Clock} tone="amber" />
        <StatCard label="Approved" value={String(stats.approved)} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Rejected" value={String(stats.rejected)} icon={XCircle} tone="indigo" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              filter === f ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
          {err}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <Spinner label="Loading verification queue..." />
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileCheck} title="No records" description="No users match this filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Applicant</th>
                  <th className="text-left px-5 py-3 font-medium">Role</th>
                  <th className="text-left px-5 py-3 font-medium">KYC Status</th>
                  <th className="text-left px-5 py-3 font-medium">Submitted</th>
                  <th className="text-right px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => {
                  const sb = statusBadge[item.kyc_status] || statusBadge['pending'];
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-slate-600 text-xs font-semibold">
                            {item.full_name ? item.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2) : 'U'}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{item.full_name || 'No Name'}</p>
                            <p className="text-xs text-slate-400">{item.email || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 capitalize text-slate-600">{item.role ? item.role.replace('_', ' ') : '—'}</td>
                      <td className="px-5 py-3"><Badge tone={sb.tone}>{sb.label}</Badge></td>
                      <td className="px-5 py-3 text-slate-500">{item.created_at ? timeAgo(item.created_at) : '—'}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setActive(item)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 inline-flex items-center gap-1.5"
                          >
                            <FileSearch className="w-3.5 h-3.5" /> Inspect
                          </button>
                          <button
                            disabled={busyId === item.id}
                            onClick={() => handleAction(item.id, 'approved')}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            disabled={busyId === item.id}
                            onClick={() => handleAction(item.id, 'rejected')}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title="Document Inspector"
        maxWidth="max-w-4xl"
      >
        {active && (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-semibold text-slate-900 text-lg">{active.full_name || 'No Name'}</p>
                <p className="text-sm text-slate-500 capitalize">
                  {active.role ? active.role.replace('_', ' ') : 'Unknown'} · {active.email || 'No email'}
                </p>
              </div>
              <Badge tone={statusBadge[active.kyc_status]?.tone || 'amber'}>
                {statusBadge[active.kyc_status]?.label || 'Pending'}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DocCard label="ID Card Document" url={active.id_card_url || null} icon={IdCard} />
              <DocCard label="Selfie Verification" url={active.selfie_url || null} icon={User} />
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
              <button
                disabled={busyId === active.id}
                onClick={() => handleAction(active.id, 'approved')}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" /> Approve & Activate
              </button>
              <button
                disabled={busyId === active.id}
                onClick={() => handleAction(active.id, 'rejected')}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                disabled={busyId === active.id}
                onClick={() => handleAction(active.id, 'pending')}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
              >
                Reset to Pending
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}

function DocCard({ label, url, icon: Icon }: { label: string; url: string | null; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
        <Icon className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
      <div className="aspect-[4/3] bg-slate-100 flex items-center justify-center">
        {url ? (
          <img src={url} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="text-center text-slate-400">
            <Icon className="w-8 h-8 mx-auto mb-1" />
            <p className="text-xs">No document uploaded</p>
          </div>
        )}
      </div>
    </div>
  );
}