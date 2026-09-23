import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Search, RefreshCw, Loader2, ShieldAlert, CheckCircle2, FileText, Eye, X } from 'lucide-react';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // FETCH ALL to bypass case-sensitivity issues
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      
      const customers = (data || []).filter(u => {
        const role = (u.role || '').toLowerCase();
        return role === 'rider' || role === 'driver' || role === 'merchant';
      });
      setUsers(customers);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const filteredUsers = users.filter(u => 
    (u.full_name?.toLowerCase().includes(search.toLowerCase()) || '') || 
    (u.email?.toLowerCase().includes(search.toLowerCase()) || '')
  );

  return (
    <AdminLayout title="Customer Governance" subtitle="Monitor and manage all Riders, Drivers, and Merchants">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 mt-6">
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
          <div className="p-12 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2" size={24} /> Loading all customers...</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No customers found.</div>
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
                      <div className="font-bold text-slate-900">{user.full_name || 'No Name'}</div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{user.id.slice(0, 12)}...</div>
                    </td>
                    <td className="px-6 py-4"><span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider">{user.role}</span></td>
                    <td className="px-6 py-4"><div className="text-slate-700">{user.email || 'No Email'}</div><div className="text-xs text-slate-500 mt-0.5">{user.phone || user.phone_number || 'No Phone'}</div></td>
                    <td className="px-6 py-4">
                      {user.kyc_status === 'approved' ? <span className="flex items-center gap-1 text-emerald-600 font-bold text-xs"><CheckCircle2 size={14}/> Approved</span> : user.kyc_status === 'rejected' ? <span className="flex items-center gap-1 text-red-600 font-bold text-xs"><ShieldAlert size={14}/> Rejected</span> : <span className="flex items-center gap-1 text-amber-600 font-bold text-xs"><ShieldAlert size={14}/> Pending</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button onClick={() => setSelectedUser(user)} className="text-xs font-bold bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition">View Documents</button>
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
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div><h2 className="text-xl font-bold text-slate-900">Customer Documents</h2><p className="mt-1 text-sm text-slate-500">{selectedUser.full_name} · {String(selectedUser.role).toUpperCase()}</p></div>
              <button onClick={() => setSelectedUser(null)} className="text-2xl leading-none text-slate-400 hover:text-slate-700">×</button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                 <DocumentCard title="ID Card" url={selectedUser.id_card_url} onView={() => setPreviewDoc(selectedUser.id_card_url)} />
                 <DocumentCard title="Selfie" url={selectedUser.selfie_url} onView={() => setPreviewDoc(selectedUser.selfie_url)} />
                 {selectedUser.role === 'driver' && <DocumentCard title="Driver License" url={selectedUser.license_doc_url} onView={() => setPreviewDoc(selectedUser.license_doc_url)} />}
                 {selectedUser.role === 'merchant' && <DocumentCard title="Business Document" url={selectedUser.business_doc_url} onView={() => setPreviewDoc(selectedUser.business_doc_url)} />}
              </div>
            </div>
          </div>
        </div>
      )}

      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-4xl bg-transparent flex flex-col items-center">
            <button onClick={() => setPreviewDoc(null)} className="absolute -top-12 right-0 text-white hover:text-gray-300 transition"><X size={36} /></button>
            {previewDoc.toLowerCase().includes('.pdf') ? (
              <iframe src={previewDoc} className="w-full h-[80vh] rounded-xl bg-white shadow-2xl" />
            ) : (
              <img src={previewDoc} alt="Document Preview" className="w-full h-auto max-h-[85vh] object-contain rounded-xl shadow-2xl" />
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function DocumentCard({ title, url, onView }: { title: string; url: string | null | undefined; onView: () => void }) {
  const isPdf = url?.toLowerCase().includes('.pdf');
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white group cursor-pointer transition hover:shadow-md" onClick={() => url && onView()}>
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 bg-slate-50">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-indigo-600" />
          <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        </div>
        {url && (
          <button className="flex items-center gap-1 text-xs font-bold text-indigo-600 group-hover:text-indigo-800 transition bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
            <Eye size={14} /> Enlarge
          </button>
        )}
      </div>
      {url ? (
        isPdf ? (
          <div className="bg-white p-6 flex flex-col items-center justify-center relative">
             <FileText size={48} className="text-red-400 mb-3 group-hover:scale-110 transition-transform" />
             <p className="text-xs font-medium text-indigo-500 text-center uppercase tracking-widest">PDF Document</p>
          </div>
        ) : (
          <div className="relative h-40 w-full bg-slate-100 overflow-hidden flex items-center justify-center">
            <img src={url} alt={title} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300" />
          </div>
        )
      ) : (
        <div className="flex h-32 items-center justify-center bg-slate-50 text-sm text-slate-400">No document submitted</div>
      )}
    </div>
  );
}