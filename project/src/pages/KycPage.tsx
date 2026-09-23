import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { FileText, Eye, X } from 'lucide-react';

type KycDecision = 'approved' | 'rejected' | 'resubmission_required';
type KycStatus = 'pending' | 'approved' | 'rejected' | 'resubmission_required';

export function KycPage() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | KycStatus>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | string>('all');

  const [selected, setSelected] = useState<any | null>(null);
  const [decision, setDecision] = useState<KycDecision>('approved');
  const [reason, setReason] = useState('');
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);

  const loadSubmissions = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      
      const filtered = (data || []).filter(u => {
        const role = (u.role || '').toLowerCase();
        return role === 'driver' || role === 'merchant';
      });

      const normalized = filtered.map(profile => ({
        id: profile.id, profile_id: profile.id, target_role: profile.role, status: profile.kyc_status || 'pending', rejection_reason: null, submitted_at: profile.updated_at || profile.created_at, profile: profile
      }));
      setSubmissions(normalized);
    } catch (err: any) { setError(err?.message); } finally { setLoading(false); }
  };

  useEffect(() => { loadSubmissions(); }, []);

  const filteredSubmissions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return submissions.filter((sub) => {
      const name = (sub.profile?.full_name || '').toLowerCase();
      const phone = sub.profile?.phone || '';
      const matchesSearch = !query || name.includes(query) || phone.includes(query);
      const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
      const matchesRole = roleFilter === 'all' || sub.target_role === roleFilter;
      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [submissions, search, statusFilter, roleFilter]);

  const stats = useMemo(() => {
    return {
      total: submissions.length,
      pending: submissions.filter((i) => i.status === 'pending').length,
      approved: submissions.filter((i) => i.status === 'approved').length,
      rejected: submissions.filter((i) => i.status === 'rejected').length,
      resubmission: submissions.filter((i) => i.status === 'resubmission_required').length,
    };
  }, [submissions]);

  const submitDecision = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const { error: updateError } = await supabase.from('profiles').update({ kyc_status: decision }).eq('id', selected.profile_id);
      if (updateError) throw updateError;
      setSelected(null);
      await loadSubmissions(true);
    } catch (err: any) { alert(err.message); } finally { setActionLoading(false); }
  };

  return (
    <AdminLayout title="KYC Review" subtitle="Review customer identity documents and make secure KYC decisions.">
      <div className="space-y-6 mt-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-gray-200 bg-white p-5"><p className="text-sm text-gray-500">Total</p><p className="mt-1 text-2xl font-bold text-gray-900">{stats.total}</p></div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5"><p className="text-sm text-blue-700">Pending</p><p className="mt-1 text-2xl font-bold text-blue-800">{stats.pending}</p></div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-5"><p className="text-sm text-green-700">Approved</p><p className="mt-1 text-2xl font-bold text-green-800">{stats.approved}</p></div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-5"><p className="text-sm text-red-700">Rejected</p><p className="mt-1 text-2xl font-bold text-red-800">{stats.rejected}</p></div>
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5"><p className="text-sm text-yellow-700">Resubmission</p><p className="mt-1 text-2xl font-bold text-yellow-800">{stats.resubmission}</p></div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone..." className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none">
              <option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option>
            </select>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none">
              <option value="all">All accounts</option><option value="driver">Driver</option><option value="merchant">Merchant</option>
            </select>
            <button onClick={() => loadSubmissions(false)} disabled={loading} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">{loading ? 'Refreshing...' : 'Refresh'}</button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
                <tr><th className="px-6 py-3 text-left font-semibold">Customer</th><th className="px-6 py-3 text-left font-semibold">Account</th><th className="px-6 py-3 text-left font-semibold">Submitted</th><th className="px-6 py-3 text-left font-semibold">Status</th><th className="px-6 py-3 text-right font-semibold">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {loading ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">Loading KYC...</td></tr>
                ) : filteredSubmissions.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">No KYC submissions found.</td></tr>
                ) : (
                  filteredSubmissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4"><div className="font-medium text-gray-900">{sub.profile.full_name}</div><div className="text-gray-500">{sub.profile.phone}</div></td>
                      <td className="px-6 py-4 uppercase font-bold text-xs text-gray-700">{sub.target_role}</td>
                      <td className="px-6 py-4 text-gray-500">{new Date(sub.submitted_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4"><span className="bg-gray-100 px-2.5 py-1 rounded-full text-xs font-bold uppercase">{sub.status}</span></td>
                      <td className="px-6 py-4 text-right"><button onClick={() => setSelected(sub)} className="bg-gray-900 px-3 py-2 text-white text-xs font-semibold rounded-lg hover:bg-gray-800">Review</button></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
              <div className="flex justify-between border-b px-6 py-5">
                <div><h2 className="text-xl font-bold text-gray-900">KYC Review</h2><p className="text-sm text-gray-500">{selected.profile.full_name}</p></div>
                <button onClick={() => setSelected(null)} className="text-2xl text-gray-400 hover:text-gray-700">×</button>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DocumentCard title="ID Card" url={selected.profile.id_card_url} onView={() => setPreviewDoc(selected.profile.id_card_url)} />
                  <DocumentCard title="Selfie" url={selected.profile.selfie_url} onView={() => setPreviewDoc(selected.profile.selfie_url)} />
                </div>
                <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                  <h3 className="text-sm font-bold uppercase text-gray-700 mb-4">Admin Decision</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <button onClick={() => setDecision('approved')} className={`border p-3 rounded-lg text-left ${decision==='approved'?'bg-white border-black':'bg-white hover:border-gray-400'}`}><span className="font-bold">Approve</span></button>
                    <button onClick={() => setDecision('rejected')} className={`border p-3 rounded-lg text-left ${decision==='rejected'?'bg-white border-black':'bg-white hover:border-gray-400'}`}><span className="font-bold">Reject</span></button>
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                    <button onClick={() => setSelected(null)} className="px-5 py-2.5 bg-white border rounded-lg font-semibold text-sm">Cancel</button>
                    <button onClick={submitDecision} disabled={actionLoading} className="px-5 py-2.5 bg-gray-900 text-white rounded-lg font-semibold text-sm">{actionLoading ? 'Processing...' : 'Submit Decision'}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {previewDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
            <div className="relative w-full max-w-4xl bg-transparent flex flex-col items-center">
              <button onClick={() => setPreviewDoc(null)} className="absolute -top-12 right-0 text-white hover:text-gray-300"><X size={36} /></button>
              <img src={previewDoc} alt="Document" className="w-full h-auto max-h-[85vh] object-contain rounded-xl shadow-2xl" />
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function DocumentCard({ title, url, onView }: { title: string; url: string | null | undefined; onView: () => void }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white cursor-pointer" onClick={() => url && onView()}>
      <div className="flex justify-between border-b px-4 py-3 bg-gray-50">
        <h4 className="text-sm font-semibold">{title}</h4>
        {url && <button className="text-xs font-bold text-indigo-600"><Eye size={14} className="inline"/> Enlarge</button>}
      </div>
      {url ? <div className="h-40 bg-gray-100 overflow-hidden"><img src={url} className="object-cover w-full h-full" /></div> : <div className="h-32 flex items-center justify-center text-gray-400 text-sm">No document</div>}
    </div>
  );
}