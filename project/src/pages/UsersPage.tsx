import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Search, RefreshCw, Loader2, ShieldAlert, CheckCircle2, FileText, X, ExternalLink } from 'lucide-react';

function Info({ label, value }: { label: string; value: string; }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-bold text-slate-900">{value}</p></div>;
}

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all'|'rider'|'driver'|'merchant'>('all');
  const [selectedUser, setSelectedUser] = useState<any>(null);

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

  const filteredUsers = users.filter(u => {
    const matchSearch = (u.full_name?.toLowerCase().includes(search.toLowerCase()) || '') || 
                        (u.email?.toLowerCase().includes(search.toLowerCase()) || '') ||
                        (u.phone?.includes(search) || '');
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  return (
    <AdminLayout title="Customer Governance" subtitle="Monitor and manage Riders, Drivers, and Merchants">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 mt-6">
        <div className="flex flex-1 gap-3 w-full max-w-xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-600 outline-none shadow-sm" />
          </div>
          <select value={roleFilter} onChange={(e: any) => setRoleFilter(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm cursor-pointer">
            <option value="all">All Roles</option>
            <option value="rider">Riders</option>
            <option value="driver">Drivers</option>
            <option value="merchant">Merchants</option>
          </select>
        </div>
        <button onClick={fetchUsers} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-bold shadow-sm">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500"><Loader2 className="animate-spin mx-auto mb-2 text-indigo-600" size={24} /> Loading customers...</div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider sticky top-0">
                <tr><th className="px-6 py-4">Customer</th><th className="px-6 py-4">Role</th><th className="px-6 py-4">Contact</th><th className="px-6 py-4">KYC Status</th><th className="px-6 py-4 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <div className="font-bold text-base text-slate-900">{user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'No Name'}</div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{user.id.slice(0, 12)}...</div>
                    </td>
                    <td className="px-6 py-4"><span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-sm">{user.role}</span></td>
                    <td className="px-6 py-4"><div className="text-slate-700 font-bold">{user.email || 'No Email'}</div><div className="text-xs text-slate-500 mt-0.5">{user.phone || user.phone_number || 'No Phone'}</div></td>
                    <td className="px-6 py-4">
                      {user.kyc_status === 'approved' ? <span className="flex items-center gap-1 text-emerald-600 font-bold text-xs"><CheckCircle2 size={16}/> Approved</span> : user.kyc_status === 'rejected' ? <span className="flex items-center gap-1 text-red-600 font-bold text-xs"><ShieldAlert size={16}/> Rejected</span> : <span className="flex items-center gap-1 text-amber-600 font-bold text-xs"><ShieldAlert size={16}/> Pending</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button onClick={() => setSelectedUser(user)} className="text-xs font-bold bg-slate-900 text-white px-4 py-2.5 rounded-xl hover:bg-slate-800 transition shadow-sm">View Profile</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedUser && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-8 py-6 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Customer Profile & Documents</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedUser.full_name || 'Customer'} · <span className="uppercase font-bold text-indigo-600">{String(selectedUser.role)}</span></p>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-2xl leading-none text-slate-400 hover:text-slate-700 p-2 bg-slate-100 rounded-full"><X size={20} /></button>
            </div>
            
            <div className="p-8 space-y-8">
              <section>
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">Customer Information</h3>
                <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 p-6 md:grid-cols-3 bg-slate-50 shadow-sm">
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
                  <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">Driver Information</h3>
                  <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 p-6 md:grid-cols-3 bg-slate-50 shadow-sm">
                    <Info label="Vehicle type" value={selectedUser.vehicle_type || '—'} />
                    <Info label="Plate number" value={selectedUser.plate_number || '—'} />
                    <Info label="Driver license" value={selectedUser.driver_license_no || '—'} />
                  </div>
                </section>
              )}

              {selectedUser.role === 'merchant' && (
                <section>
                  <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">Business Information</h3>
                  <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 p-6 md:grid-cols-3 bg-slate-50 shadow-sm">
                    <Info label="Business name" value={selectedUser.business_name || '—'} />
                    <Info label="Business type" value={selectedUser.business_type || '—'} />
                    <Info label="Tax ID" value={selectedUser.tax_id || '—'} />
                  </div>
                </section>
              )}

              <section>
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">Submitted Documents</h3>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                   <DocumentCard title="ID Card" path={selectedUser.id_card_url} userId={selectedUser.id} />
                   <DocumentCard title="Selfie" path={selectedUser.selfie_url} userId={selectedUser.id} />
                   {selectedUser.role === 'driver' && <DocumentCard title="Driver License" path={selectedUser.license_doc_url} userId={selectedUser.id} />}
                   {selectedUser.role === 'merchant' && <DocumentCard title="Business Document" path={selectedUser.business_doc_url} userId={selectedUser.id} />}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

// 🔴 THE SECURE API DOCUMENT CARD
function DocumentCard({ title, path, userId }: { title: string; path?: string | null; userId?: string | null; }) {
  const [loading, setLoading] = useState(false);

  const handleViewDocument = async () => {
    if (!path) return;
    setLoading(true);
    try {
      const response = await fetch('/api/admin-kyc-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, userId })
      });
      const data = await response.json();

      if (data.signedUrl2) window.open(data.signedUrl2, '_blank');
      else if (data.signedUrl1) window.open(data.signedUrl1, '_blank');
      else alert("Document not found in bucket or access denied.");
    } catch (err) {
      console.error(err);
      alert('Error generating secure link.');
    } finally {
      setLoading(false);
    }
  };

  if (!path) {
    return (
      <div className="border border-slate-200 rounded-3xl p-6 bg-slate-50 flex flex-col justify-center items-center text-center shadow-sm h-[160px]">
        <FileText size={32} className="text-slate-300 mb-3" />
        <h4 className="text-sm font-bold text-slate-500 mb-2">{title}</h4>
        <span className="text-[10px] font-bold text-slate-400 bg-slate-200 px-3 py-1.5 rounded-lg uppercase tracking-wider">Not Submitted</span>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-3xl p-6 bg-white shadow-sm flex flex-col justify-center items-center text-center hover:border-indigo-300 transition h-[160px]">
      <FileText size={28} className="text-indigo-500 mb-3" />
      <h4 className="text-sm font-bold text-slate-900 mb-3">{title}</h4>
      <button 
        onClick={handleViewDocument}
        disabled={loading}
        className="w-full bg-indigo-600 text-white hover:bg-indigo-700 transition px-4 py-2.5 rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
        {loading ? 'Generating...' : 'View Secure Document'}
      </button>
    </div>
  );
}