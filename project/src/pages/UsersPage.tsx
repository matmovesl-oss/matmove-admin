import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Search, RefreshCw, Loader2, ShieldAlert, CheckCircle2, FileText, Eye, X, ExternalLink } from 'lucide-react';

function Info({ label, value }: { label: string; value: string; }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-medium text-slate-900">{value}</p></div>;
}

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['rider', 'driver', 'merchant'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const filteredUsers = users.filter(u => 
    (u.full_name?.toLowerCase().includes(search.toLowerCase()) || '') || 
    (u.email?.toLowerCase().includes(search.toLowerCase()) || '') ||
    (u.phone?.includes(search) || '')
  );

  return (
    <AdminLayout title="Customer Governance" subtitle="Monitor and manage Riders, Drivers, and Merchants">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-600 outline-none" />
        </div>
        <button onClick={fetchUsers} className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2" size={24} /> Loading customers...</div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide sticky top-0">
                <tr><th className="px-6 py-4 font-medium">Customer</th><th className="px-6 py-4 font-medium">Role</th><th className="px-6 py-4 font-medium">Contact</th><th className="px-6 py-4 font-medium">KYC Status</th><th className="px-6 py-4 font-medium text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'No Name'}</div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{user.id.slice(0, 12)}...</div>
                    </td>
                    <td className="px-6 py-4"><span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider">{user.role}</span></td>
                    <td className="px-6 py-4"><div className="text-slate-700">{user.email || 'No Email'}</div><div className="text-xs text-slate-500 mt-0.5">{user.phone || user.phone_number || 'No Phone'}</div></td>
                    <td className="px-6 py-4">
                      {user.kyc_status === 'approved' ? <span className="flex items-center gap-1 text-emerald-600 font-bold text-xs"><CheckCircle2 size={14}/> Approved</span> : user.kyc_status === 'rejected' ? <span className="flex items-center gap-1 text-red-600 font-bold text-xs"><ShieldAlert size={14}/> Rejected</span> : <span className="flex items-center gap-1 text-amber-600 font-bold text-xs"><ShieldAlert size={14}/> Pending</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button onClick={() => setSelectedUser(user)} className="text-xs font-bold bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition">View Details</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedUser && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Customer Profile & Documents</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedUser.full_name || 'Customer'} · {String(selectedUser.role).toUpperCase()}</p>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-2xl leading-none text-slate-400 hover:text-slate-700">×</button>
            </div>
            
            <div className="p-6 space-y-6">
              <section>
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">Customer Information</h3>
                <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-3 bg-slate-50">
                  <Info label="Full name" value={selectedUser.full_name || `${selectedUser.first_name || ''} ${selectedUser.last_name || ''}`.trim() || '—'} />
                  <Info label="Phone" value={selectedUser.phone || selectedUser.phone_number || '—'} />
                  <Info label="Email" value={selectedUser.email || '—'} />
                  <Info label="Date of birth" value={selectedUser.date_of_birth || '—'} />
                  <Info label="Nationality" value={selectedUser.nationality || '—'} />
                  <Info label="Country" value={selectedUser.country || '—'} />
                  <Info label="City" value={selectedUser.city || '—'} />
                  <Info label="Address" value={selectedUser.residential_address || selectedUser.address || '—'} />
                  <Info label="Current KYC status" value={selectedUser.kyc_status || '—'} />
                </div>
              </section>

              {selectedUser.role === 'driver' && (
                <section>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">Driver Information</h3>
                  <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-3 bg-slate-50">
                    <Info label="Vehicle type" value={selectedUser.vehicle_type || '—'} />
                    <Info label="Plate number" value={selectedUser.plate_number || '—'} />
                    <Info label="Driver license" value={selectedUser.driver_license_no || '—'} />
                  </div>
                </section>
              )}

              {selectedUser.role === 'merchant' && (
                <section>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">Business Information</h3>
                  <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-3 bg-slate-50">
                    <Info label="Business name" value={selectedUser.business_name || '—'} />
                    <Info label="Business type" value={selectedUser.business_type || '—'} />
                    <Info label="Tax ID" value={selectedUser.tax_id || '—'} />
                  </div>
                </section>
              )}

              <section>
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">Submitted Documents</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                   <DocumentCard title="ID Card" path={selectedUser.id_card_url} onView={setPreviewDoc} />
                   <DocumentCard title="Selfie" path={selectedUser.selfie_url} onView={setPreviewDoc} />
                   {selectedUser.role === 'driver' && <DocumentCard title="Driver License" path={selectedUser.license_doc_url} onView={setPreviewDoc} />}
                   {selectedUser.role === 'merchant' && <DocumentCard title="Business Document" path={selectedUser.business_doc_url} onView={setPreviewDoc} />}
                </div>
              </section>
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
    </AdminLayout>
  );
}

function DocumentCard({ title, path, onView }: { title: string; path: string | null | undefined; onView: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!path) return;
    
    if (path.startsWith('http')) { 
      setUrl(path); 
      return; 
    }
    
    const fetchSignedUrl = async () => {
      const cleanPath = path.replace(/^(kyc-documents\/|kyc\/)/, '');
      const { data, error } = await supabase.storage.from('kyc-documents').createSignedUrl(cleanPath, 31536000); 
      
      if (data?.signedUrl) {
        setUrl(data.signedUrl);
      } else {
        const { data: pubData } = supabase.storage.from('kyc-documents').getPublicUrl(cleanPath);
        setUrl(pubData.publicUrl);
      }
    };
    fetchSignedUrl();
  }, [path]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white group transition hover:shadow-md">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 bg-gray-50">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-indigo-600" />
          <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        </div>
        {url && !isError && (
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
        <div className="relative h-48 w-full bg-slate-100 overflow-hidden flex items-center justify-center p-2 cursor-pointer" onClick={() => { if (!isError) onView(url); }}>
          <img 
             src={url} 
             alt={title} 
             className="object-contain w-full h-full group-hover:scale-105 transition-transform duration-300 rounded" 
             onError={(e) => { 
               setIsError(true);
               (e.target as HTMLElement).style.display = 'none'; 
               (e.target as HTMLElement).parentElement!.innerHTML = '<span class="text-xs text-red-500 font-bold">Image not found in Supabase Storage Bucket</span>';
             }} 
          />
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center bg-gray-50 text-sm text-gray-400">No document submitted</div>
      )}
    </div>
  );
}