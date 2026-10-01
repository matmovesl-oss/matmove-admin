import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useWallets, useWithdrawals } from '../lib/hooks';
import AdminLayout from '../components/AdminLayout'; 
import { CheckCircle2, XCircle, Search, RefreshCw, FileText, Truck, Store, User, ShieldCheck, Download, X, Clock3, Users, AlertTriangle, Activity, MapPin, Phone, Mail, CalendarDays, BadgeCheck, Ban, Wallet, LockKeyhole, UnlockKeyhole, ArrowDownToLine, ArrowUpFromLine, CircleDollarSign, Loader2 } from 'lucide-react';

type CustomerRole = 'rider' | 'driver' | 'merchant';
type AccountRole = CustomerRole | 'admin' | 'corporate' | string;
type ProfileKycStatus = 'not_started' | 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'resubmission_required' | string;
type OperationalKycStatus = 'pending' | 'approved' | 'rejected';
type KycDecision = 'approved' | 'rejected' | 'resubmission_required';

interface UserProfile { id: string; email?: string; full_name?: string; phone_number?: string; phone?: string; role?: AccountRole; kyc_status?: ProfileKycStatus; created_at: string; updated_at?: string; address?: string; residential_address?: string; city?: string; vehicle_type?: string; plate_number?: string; driver_license_no?: string; business_name?: string; business_type?: string; tax_id?: string; [key: string]: unknown; }
interface KycSubmission { id: string; profile_id: string; target_role?: CustomerRole | string; status?: ProfileKycStatus; rejection_reason?: string; submitted_at?: string; reviewed_at?: string; reviewer_id?: string; created_at?: string; updated_at?: string; }
interface KycDocument { id: string; submission_id: string; document_type: string; file_name?: string; storage_path: string; file_size_bytes?: number; created_at?: string; }
interface KycReviewResult { submission_id: string; profile_id: string; target_role: string; previous_status: string; new_status: string; reviewed_by: string; reviewed_at: string; }
type Filter = 'pending' | 'approved' | 'rejected' | 'all';

function normalizeRole(role?: string): AccountRole { if (!role) return 'rider'; if (role === 'vendor') return 'merchant'; if (role === 'client') return 'rider'; return role; }
function roleLabel(role?: string) { const normalized = normalizeRole(role); switch (normalized) { case 'rider': return 'Rider'; case 'driver': return 'Driver'; case 'merchant': return 'Merchant'; case 'admin': return 'Admin'; case 'corporate': return 'Corporate'; default: return normalized.charAt(0).toUpperCase() + normalized.slice(1); } }
function isCustomerRole(role?: string): role is CustomerRole { const normalized = normalizeRole(role); return normalized === 'rider' || normalized === 'driver' || normalized === 'merchant'; }
function operationalStatus(status?: string): OperationalKycStatus { if (status === 'approved') return 'approved'; if (status === 'rejected') return 'rejected'; return 'pending'; }
function statusLabel(status?: string) { switch (operationalStatus(status)) { case 'approved': return 'Approved'; case 'rejected': return 'Declined'; default: return 'Pending'; } }
function statusClasses(status?: string) { switch (operationalStatus(status)) { case 'approved': return 'bg-emerald-100 text-emerald-700 border-emerald-200'; case 'rejected': return 'bg-red-100 text-red-700 border-red-200'; default: return 'bg-amber-100 text-amber-700 border-amber-200'; } }
function formatDateTime(value?: string) { if (!value) return '—'; const date = new Date(value); if (Number.isNaN(date.getTime())) return '—'; return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function getLatestSubmission(submissions: KycSubmission[], userId: string) { return submissions.filter((submission) => submission.profile_id === userId).sort((a, b) => { const aDate = new Date(a.submitted_at || a.created_at || 0).getTime(); const bDate = new Date(b.submitted_at || b.created_at || 0).getTime(); return bDate - aDate; })[0] || null; }
function getEffectiveKycStatus(profile?: UserProfile | null, submission?: KycSubmission | null) { return operationalStatus(submission?.status || profile?.kyc_status); }
function humanizeDocumentType(value: string) { const normalized = value.replace(/_/g, ' '); return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatSleAmount(value: number) { return `SLE ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))}`; }
function formatUsdAmount(value: number) { return `USD ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))}`; }

// 🔴 FIX: Resolve image URLs natively via Supabase Public URL so they display reliably in the admin panel
const getDocUrl = (path: string | null) => {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanPath = path.replace(/^\/+/, '');
  const { data } = supabase.storage.from('kyc-documents').getPublicUrl(cleanPath);
  return data.publicUrl;
};

export default function AdminDashboard() {
  const { wallets, loading: walletsLoading, error: walletsError, refetch: refetchWallets } = useWallets();
  const { items: withdrawals, loading: withdrawalsLoading, error: withdrawalsError, refetch: refetchWithdrawals } = useWithdrawals();

  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [submissions, setSubmissions] = useState<KycSubmission[]>([]);
  const [documents, setDocuments] = useState<KycDocument[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [financialRefreshing, setFinancialRefreshing] = useState(false);

  const fetchProfiles = useCallback(async () => {
    setLoading(true); setErrorMessage('');
    try {
      const [profileResponse, submissionResponse, documentResponse] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('kyc_submissions').select('*').order('created_at', { ascending: false }),
        supabase.from('kyc_documents').select(`id, submission_id, document_type, file_name, storage_path, file_size_bytes, created_at`).order('created_at', { ascending: false }),
      ]);
      
      const normalizedProfiles = ((profileResponse.data || []) as UserProfile[]).map((profile) => ({ ...profile, role: normalizeRole(profile.role) })).filter((profile) => isCustomerRole(profile.role));
      setProfiles(normalizedProfiles);
      setSubmissions((submissionResponse.data || []) as KycSubmission[]);
      setDocuments((documentResponse.data || []) as KycDocument[]);
      setSelectedUser((current) => current ? normalizedProfiles.find(p => p.id === current.id) || null : null);
    } catch (error) { setErrorMessage('Unable to load verification records.'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const handleFinancialRefresh = async () => {
    setFinancialRefreshing(true);
    try { await Promise.all([refetchWallets(), refetchWithdrawals()]); } 
    finally { setFinancialRefreshing(false); }
  };

  const getSubmissionForUser = useCallback((userId: string) => getLatestSubmission(submissions, userId), [submissions]);
  const getDocumentsForUser = useCallback((userId: string) => {
    const submission = getLatestSubmission(submissions, userId);
    if (!submission) return [];
    return documents.filter((document) => document.submission_id === submission.id);
  }, [documents, submissions]);

  const performKycReview = async (userId: string, decision: KycDecision, reason?: string) => {
    setActionLoading(true); setErrorMessage('');
    try {
      const { error } = await supabase.from('profiles').update({ kyc_status: decision }).eq('id', userId);
      if (error) throw error;
      
      await supabase.from('audit_logs').insert({ action: `KYC_${decision.toUpperCase()}`, details: `Admin reviewed KYC for user ${userId}. Reason: ${reason || 'N/A'}` });
      await fetchProfiles();
      setShowRejectDialog(false); setRejectionReason('');
    } catch (error) { setErrorMessage('Verification action failed.'); } 
    finally { setActionLoading(false); }
  };

  const handleApprove = async () => { if (selectedUser) await performKycReview(selectedUser.id, 'approved'); };
  const handleReject = async () => { if (selectedUser && rejectionReason.trim()) await performKycReview(selectedUser.id, 'rejected', rejectionReason); else setErrorMessage('Reason required.'); };

  const statistics = useMemo(() => {
    const counts = { total: profiles.length, pending: 0, approved: 0, rejected: 0, riders: 0, drivers: 0, merchants: 0 };
    profiles.forEach((profile) => {
      const status = getEffectiveKycStatus(profile, getLatestSubmission(submissions, profile.id));
      const role = normalizeRole(profile.role);
      if (status === 'pending') counts.pending += 1;
      if (status === 'approved') counts.approved += 1;
      if (status === 'rejected') counts.rejected += 1;
      if (role === 'rider') counts.riders += 1;
      if (role === 'driver') counts.drivers += 1;
      if (role === 'merchant') counts.merchants += 1;
    });
    return counts;
  }, [profiles, submissions]);

  const filteredProfiles = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return profiles.filter((profile) => {
      const status = getEffectiveKycStatus(profile, getLatestSubmission(submissions, profile.id));
      if (filter !== 'all' && status !== filter) return false;
      if (!search) return true;
      return [profile.full_name, profile.email, profile.phone || profile.phone_number].filter(Boolean).some((val) => String(val).toLowerCase().includes(search));
    });
  }, [profiles, submissions, filter, searchTerm]);

  const selectedRole = selectedUser ? normalizeRole(selectedUser.role) : null;
  const financialSummary = { sleBalance: 0, sleAvailable: 0, usdBalance: 0, usdAvailable: 0, sleReserved: 0, usdReserved: 0, activeWallets: 0, frozenWallets: 0, pendingWithdrawals: 0, pendingWithdrawalSle: 0, pendingWithdrawalUsd: 0, processingWithdrawals: 0, completedWithdrawals: 0, failedWithdrawals: 0 }; // Simplified mock for layout

  return (
    <div className="flex-1 bg-slate-50 flex flex-col font-sans h-full overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-start gap-6 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><ShieldCheck size={21} /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">MatMove Admin Control Center</h1></div>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" placeholder="Search users..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="px-4 py-2.5 bg-slate-100 rounded-xl text-sm outline-none" />
        </div>
      </header>

      <div className="flex-1 p-8 grid grid-cols-12 gap-6 overflow-hidden">
        <div className="col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex gap-1 overflow-x-auto">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((tab) => (
              <button key={tab} onClick={() => { setFilter(tab); setSelectedUser(null); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${filter === tab ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-200'}`}>{tab}</button>
            ))}
          </div>
          <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
            {filteredProfiles.map((user) => (
              <button key={user.id} onClick={() => setSelectedUser(user)} className={`w-full text-left p-4 hover:bg-slate-50 flex items-center justify-between ${selectedUser?.id === user.id ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : 'border-l-4 border-transparent'}`}>
                <div><div className="font-bold text-sm text-slate-900">{user.full_name || 'Incomplete Profile'}</div></div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${statusClasses(getEffectiveKycStatus(user, getSubmissionForUser(user.id)))}`}>{statusLabel(getEffectiveKycStatus(user, getSubmissionForUser(user.id)))}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-y-auto">
          {selectedUser ? (
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-start border-b border-slate-100 pb-5">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{selectedUser.full_name}</h2>
                  <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full uppercase mt-2 inline-block">{roleLabel(selectedRole || undefined)}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowRejectDialog(true)} className="bg-red-50 text-red-600 px-4 py-2.5 rounded-xl text-sm font-bold"><XCircle size={16} className="inline mr-1"/> Decline</button>
                  <button onClick={handleApprove} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold"><CheckCircle2 size={16} className="inline mr-1"/> Approve</button>
                </div>
              </div>

              <section>
                <h3 className="text-sm font-bold text-slate-400 uppercase mb-3">KYC Documents</h3>
                <div className="grid grid-cols-2 gap-4">
                  <DocumentCard title="ID Card" url={getDocUrl(selectedUser.id_card_url)} />
                  <DocumentCard title="Selfie" url={getDocUrl(selectedUser.selfie_url)} />
                  {selectedRole === 'driver' && <DocumentCard title="Driver License" url={getDocUrl(selectedUser.license_doc_url)} />}
                  {selectedRole === 'merchant' && <DocumentCard title="Business Document" url={getDocUrl(selectedUser.business_doc_url)} />}
                </div>
              </section>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400"><ShieldCheck size={52} className="mb-3 text-slate-200" /><p>Select an application</p></div>
          )}
        </div>
      </div>

      {showRejectDialog && selectedUser && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6">
            <h3 className="text-lg font-bold">Decline KYC Application</h3>
            <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={4} className="w-full mt-4 border p-3 rounded-lg" placeholder="Reason for rejection..." />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowRejectDialog(false)} className="px-4 py-2 bg-slate-100 rounded-lg font-bold">Cancel</button>
              <button onClick={handleReject} className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold">Confirm Decline</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentCard({ title, url }: { title: string; url: string | null }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex flex-col items-center justify-center min-h-[200px]">
      <span className="text-xs font-bold text-slate-500 uppercase mb-2">{title}</span>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full h-32 relative group">
          <img src={url} alt={title} className="w-full h-full object-cover rounded-lg group-hover:opacity-75 transition" />
        </a>
      ) : (
        <div className="text-slate-400 text-xs">No document submitted</div>
      )}
    </div>
  );
}

// ... Additional helper UI components omitted for brevity (SummaryCard, MiniFinancialCard etc) ...