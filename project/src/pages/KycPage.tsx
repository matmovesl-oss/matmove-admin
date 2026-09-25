import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Download, FileText, Eye, X, ExternalLink } from 'lucide-react';

type KycDecision = 'approved' | 'rejected' | 'resubmission_required';
type KycStatus = 'pending' | 'approved' | 'rejected' | 'resubmission_required';
type TargetRole = 'rider' | 'driver' | 'merchant';

type Profile = { id: string; first_name: string | null; last_name: string | null; full_name: string | null; phone: string | null; phone_number: string | null; email: string | null; date_of_birth: string | null; nationality: string | null; country: string | null; residential_address: string | null; city: string | null; address: string | null; kyc_status: string | null; role: string | null; vehicle_type: string | null; plate_number: string | null; driver_license_no: string | null; business_name: string | null; business_type: string | null; tax_id: string | null; id_card_url: string | null; selfie_url: string | null; license_doc_url: string | null; business_doc_url: string | null; created_at: string | null; updated_at: string | null; };
type KycSubmission = { id: string; profile_id: string | null; target_role: TargetRole | null; status: KycStatus | null; rejection_reason: string | null; submitted_at: string | null; created_at: string | null; profile: Profile | null; };

const statusLabel = (status: KycStatus | null) => { switch (status) { case 'approved': return 'Approved'; case 'rejected': return 'Rejected'; case 'resubmission_required': return 'Resubmission Required'; case 'pending': default: return 'Pending'; } };
const roleLabel = (role: TargetRole | null) => { switch (role) { case 'driver': return 'Driver'; case 'merchant': return 'Merchant'; case 'rider': return 'Rider'; default: return 'Customer'; } };
const statusClass = (status: KycStatus | null) => { switch (status) { case 'approved': return 'bg-green-100 text-green-700'; case 'rejected': return 'bg-red-100 text-red-700'; case 'resubmission_required': return 'bg-yellow-100 text-yellow-700'; case 'pending': default: return 'bg-blue-100 text-blue-700'; } };
const formatDate = (value: string | null) => { if (!value) return '—'; const date = new Date(value); if (Number.isNaN(date.getTime())) return '—'; return date.toLocaleString(); };
const getCustomerName = (profile: Profile | null) => { if (!profile) return 'Unknown customer'; const fullName = profile.full_name?.trim() || `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim(); return fullName || 'Unnamed customer'; };

export function KycPage() {
  const [submissions, setSubmissions] = useState<KycSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | KycStatus>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | TargetRole>('all');

  const [selected, setSelected] = useState<KycSubmission | null>(null);
  const [decision, setDecision] = useState<KycDecision>('approved');
  const [reason, setReason] = useState('');
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);

  const loadSubmissions = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase.from('profiles').select('*').in('role', ['driver', 'merchant']).order('updated_at', { ascending: false });
      if (queryError) throw queryError;

      const normalized = (data ?? []).map((profile: any) => ({
        id: profile.id, profile_id: profile.id, target_role: profile.role, status: profile.kyc_status || 'pending', rejection_reason: null, submitted_at: profile.updated_at || profile.created_at, created_at: profile.created_at, profile: profile
      }));
      setSubmissions(normalized);
    } catch (err: any) { setError(err?.message || 'Unable to load KYC submissions.'); } finally { setLoading(false); }
  };

  useEffect(() => { loadSubmissions(); }, []);

  const filteredSubmissions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return submissions.filter((submission) => {
      const profile = submission.profile;
      const name = getCustomerName(profile).toLowerCase();
      const phone = profile?.phone || profile?.phone_number || '';
      const email = profile?.email || '';
      const matchesSearch = !query || name.includes(query) || phone.toLowerCase().includes(query) || email.toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all' || submission.status === statusFilter;
      const matchesRole = roleFilter === 'all' || submission.target_role === roleFilter;
      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [submissions, search, statusFilter, roleFilter]);

  const openReview = (submission: KycSubmission, selectedDecision: KycDecision = 'approved') => {
    setSelected(submission); setDecision(selectedDecision); setReason(selectedDecision === 'approved' ? '' : submission.rejection_reason || '');
  };

  const closeReview = () => { if (actionLoading) return; setSelected(null); setReason(''); setDecision('approved'); };

  const submitDecision = async () => {
    if (!selected) return;
    if ((decision === 'rejected' || decision === 'resubmission_required') && !reason.trim()) { setError('A reason is required.'); return; }
    setActionLoading(true); setError(null);

    try {
      const { error: updateError } = await supabase.from('profiles').update({ kyc_status: decision }).eq('id', selected.profile_id);
      if (updateError) throw updateError;
      closeReview(); await loadSubmissions(true);
    } catch (err: any) { setError(err?.message || 'Unable to complete the KYC review.'); } finally { setActionLoading(false); }
  };

  const profile = selected?.profile ?? null;

  return (
    <AdminLayout title="KYC Review" subtitle="Review customer identity documents and make secure KYC decisions.">
      <div className="space-y-6 mt-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span><button onClick={() => setError(null)} className="font-semibold hover:underline">Dismiss</button>
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone..." className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as KycStatus | 'all')} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
              <option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="resubmission_required">Resubmission</option>
            </select>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as TargetRole | 'all')} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
              <option value="all">All account types</option><option value="driver">Driver</option><option value="merchant">Merchant</option>
            </select>
            <button onClick={() => loadSubmissions(false)} disabled={loading} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Account</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Submitted</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {loading ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">Loading KYC submissions...</td></tr>
                ) : filteredSubmissions.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">No KYC submissions found.</td></tr>
                ) : (
                  filteredSubmissions.map((submission) => {
                    const itemProfile = submission.profile;
                    const customerName = getCustomerName(itemProfile);
                    const phone = itemProfile?.phone || itemProfile?.phone_number || '—';
                    return (
                      <tr key={submission.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-6 py-4"><div className="font-medium text-gray-900">{customerName}</div><div className="text-sm text-gray-500">{phone}</div></td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{roleLabel(submission.target_role)}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{formatDate(submission.submitted_at)}</td>
                        <td className="whitespace-nowrap px-6 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(submission.status)}`}>{statusLabel(submission.status)}</span></td>
                        <td className="whitespace-nowrap px-6 py-4 text-right"><button onClick={() => openReview(submission)} className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800">Review</button></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5 sticky top-0 bg-white z-10">
                <div><h2 className="text-xl font-bold text-gray-900">KYC Review</h2><p className="mt-1 text-sm text-gray-500">{getCustomerName(profile)} · {roleLabel(selected.target_role)}</p></div>
                <button onClick={closeReview} className="text-2xl leading-none text-gray-400 hover:text-gray-700">×</button>
              </div>

              <div className="space-y-6 p-6">
                <section>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-700">Customer Information</h3>
                  <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-3 bg-slate-50">
                    <Info label="Full name" value={getCustomerName(profile)} />
                    <Info label="Phone" value={profile?.phone || profile?.phone_number || '—'} />
                    <Info label="Email" value={profile?.email || '—'} />
                    <Info label="Date of birth" value={profile?.date_of_birth || '—'} />
                    <Info label="Nationality" value={profile?.nationality || '—'} />
                    <Info label="Country" value={profile?.country || '—'} />
                    <Info label="City" value={profile?.city || '—'} />
                    <Info label="Address" value={profile?.residential_address || profile?.address || '—'} />
                    <Info label="Current KYC status" value={profile?.kyc_status || '—'} />
                  </div>
                </section>

                {selected.target_role === 'driver' && (
                  <section>
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-700">Driver Information</h3>
                    <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-3 bg-slate-50">
                      <Info label="Vehicle type" value={profile?.vehicle_type || '—'} />
                      <Info label="Plate number" value={profile?.plate_number || '—'} />
                      <Info label="Driver license" value={profile?.driver_license_no || '—'} />
                    </div>
                  </section>
                )}

                {selected.target_role === 'merchant' && (
                  <section>
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-700">Business Information</h3>
                    <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-3 bg-slate-50">
                      <Info label="Business name" value={profile?.business_name || '—'} />
                      <Info label="Business type" value={profile?.business_type || '—'} />
                      <Info label="Tax ID" value={profile?.tax_id || '—'} />
                    </div>
                  </section>
                )}

                <section>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-700">Submitted Documents</h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <DocumentCard title="ID Card" path={profile?.id_card_url} onView={setPreviewDoc} />
                    <DocumentCard title="Selfie" path={profile?.selfie_url} onView={setPreviewDoc} />
                    {selected.target_role === 'driver' && <DocumentCard title="Driver License" path={profile?.license_doc_url} onView={setPreviewDoc} />}
                    {selected.target_role === 'merchant' && <DocumentCard title="Business Document" path={profile?.business_doc_url} onView={setPreviewDoc} />}
                  </div>
                </section>

                <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">Admin Decision</h3>
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <DecisionButton active={decision === 'approved'} onClick={() => setDecision('approved')} title="Approve KYC" description="Customer passes KYC review." />
                    <DecisionButton active={decision === 'rejected'} onClick={() => setDecision('rejected')} title="Reject" description="Permanently reject this submission." />
                    <DecisionButton active={decision === 'resubmission_required'} onClick={() => setDecision('resubmission_required')} title="Request Resubmission" description="Customer must submit corrected info." />
                  </div>
                  {decision !== 'approved' && (
                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-semibold text-gray-700">Reason <span className="text-red-600">*</span></label>
                      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none" />
                    </div>
                  )}
                </section>
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
                <button onClick={closeReview} className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold hover:bg-gray-50">Cancel</button>
                <button onClick={submitDecision} disabled={actionLoading || (decision !== 'approved' && !reason.trim())} className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50">
                  {actionLoading ? 'Processing...' : 'Submit Decision'}
                </button>
              </div>
            </div>
          </div>
        )}

        {previewDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
            <div className="relative w-full max-w-4xl bg-transparent flex flex-col items-center">
              <button onClick={() => setPreviewDoc(null)} className="absolute -top-12 right-0 text-white hover:text-slate-300 transition"><X size={36} /></button>
              <img src={previewDoc} alt="Document Preview" className="w-full h-auto max-h-[85vh] object-contain rounded-xl shadow-2xl" />
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function Info({ label, value }: { label: string; value: string; }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p><p className="mt-1 break-words text-sm font-medium text-gray-900">{value}</p></div>;
}

function DocumentCard({ title, path, onView }: { title: string; path: string | null | undefined; onView: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    
    if (path.startsWith('http')) { 
      setUrl(path); 
      return; 
    }
    
    // SECURE FIX: Override internal Supabase SDK pathing by manually constructing the exact root URL
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vultapi.supabase.co'; 
    const cleanPath = path.replace(/^(kyc-documents\/|kyc\/)/, '');
    
    const directUrl = `${supabaseUrl}/storage/v1/object/public/kyc-documents/${encodeURIComponent(cleanPath)}`;
    setUrl(directUrl);
  }, [path]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white group transition hover:shadow-md">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 bg-gray-50">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-indigo-600" />
          <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        </div>
        {url && (
          <div className="flex gap-2">
            <button onClick={() => onView(url)} className="flex items-center gap-1 text-xs font-bold text-indigo-600 group-hover:text-indigo-800 transition bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
              <Eye size={14} /> Preview
            </button>
            <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 transition bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              <ExternalLink size={14} /> Open Link
            </a>
          </div>
        )}
      </div>
      {url ? (
        <div className="relative h-48 w-full bg-slate-100 overflow-hidden flex items-center justify-center p-2 cursor-pointer" onClick={() => onView(url)}>
          <img 
             src={url} 
             alt={title} 
             className="object-contain w-full h-full group-hover:scale-105 transition-transform duration-300 rounded" 
             onError={(e) => { 
               (e.target as HTMLElement).style.display = 'none'; 
               (e.target as HTMLElement).parentElement!.innerHTML = '<span class="text-xs text-red-400 font-medium">File not found in storage bucket</span>';
             }} 
          />
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center bg-gray-50 text-sm text-gray-400">No document submitted</div>
      )}
    </div>
  );
}

function DecisionButton({ active, onClick, title, description }: { active: boolean; onClick: () => void; title: string; description: string; }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-xl border p-4 text-left transition ${active ? 'border-gray-900 bg-white shadow-sm' : 'border-gray-200 bg-white hover:border-gray-400'}`}>
      <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full border ${active ? 'border-gray-900 bg-gray-900' : 'border-gray-300 bg-white'}`} /><span className="text-sm font-bold text-gray-900">{title}</span></div>
      <p className="mt-2 text-xs leading-5 text-gray-500">{description}</p>
    </button>
  );
}