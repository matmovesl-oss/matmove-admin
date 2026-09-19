import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import Modal from '@/components/Modal';
import { supabase } from '@/lib/supabase';
import { Search, RefreshCw, Loader2, UserPlus, ShieldCheck } from 'lucide-react';

export default function StaffGovernancePage() {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Add Staff State
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [newStaff, setNewStaff] = useState({ email: '', fullName: '', role: 'admin_dispatch', defaultPassword: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['super_admin', 'admin_finance', 'admin_compliance', 'admin_dispatch']) // STRICTLY STAFF ONLY
        .order('created_at', { ascending: false });
      if (error) throw error;
      setStaff(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStaff(); }, []);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('admin_user_invites').insert({
        email: newStaff.email,
        full_name: newStaff.fullName,
        role: newStaff.role,
        temp_password: newStaff.defaultPassword
      });

      if (error) throw error;
      alert(`Invitation generated for ${newStaff.email}! They can log in with the default password you set to access their specific department.`);
      setIsAddStaffOpen(false);
      setNewStaff({ email: '', fullName: '', role: 'admin_dispatch', defaultPassword: '' });
      fetchStaff();
    } catch (err: any) {
      alert(`Note: To create staff silently, ensure the 'admin_user_invites' table and Edge Function are deployed. Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredStaff = staff.filter(u => 
    (u.full_name?.toLowerCase().includes(search.toLowerCase()) || '') || 
    (u.email?.toLowerCase().includes(search.toLowerCase()) || '')
  );

  return (
    <AdminLayout title="Staff & Department Governance" subtitle="Manage internal employees and RBAC assignments">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search staff..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-600 outline-none" />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={fetchStaff} className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={() => setIsAddStaffOpen(true)} className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-sm font-bold flex-1 sm:flex-none shadow-sm">
            <UserPlus size={16} /> Hire Staff
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2" size={24} /> Loading staff records...</div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide sticky top-0">
                <tr><th className="px-6 py-4 font-medium">Employee</th><th className="px-6 py-4 font-medium">Department Role</th><th className="px-6 py-4 font-medium">Work Email</th><th className="px-6 py-4 font-medium">Clearance</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{user.full_name || 'No Name'}</div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{user.id.slice(0, 12)}...</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-slate-900 text-white px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                        {user.role.replace('admin_', '')}
                      </span>
                    </td>
                    <td className="px-6 py-4"><div className="text-slate-700">{user.email || 'No Email'}</div></td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-1 text-emerald-600 font-bold text-xs"><ShieldCheck size={14}/> Verified Admin</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={isAddStaffOpen} onClose={() => !isSubmitting && setIsAddStaffOpen(false)} title="Create Staff Account" maxWidth="max-w-md">
        <form onSubmit={handleAddStaff} className="space-y-4">
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-6">
            <p className="text-xs text-amber-800 leading-relaxed font-semibold">
              WARNING: The role you select dictates exactly which tabs this employee can see in their sidebar (RBAC). 
            </p>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Employee Full Name</label>
            <input required type="text" value={newStaff.fullName} onChange={e => setNewStaff({...newStaff, fullName: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:border-indigo-500" placeholder="e.g. Jane Doe" />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Work Email</label>
            <input required type="email" value={newStaff.email} onChange={e => setNewStaff({...newStaff, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:border-indigo-500" placeholder="jane.doe@matmove.com" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Department Assignment (RBAC)</label>
            <select value={newStaff.role} onChange={e => setNewStaff({...newStaff, role: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:border-indigo-500 font-semibold">
              <option value="admin_dispatch">Dispatch Unit (Radar Access)</option>
              <option value="admin_compliance">Compliance Unit (KYC Access)</option>
              <option value="admin_finance">Finance Unit (Wallets & Payouts)</option>
              <option value="super_admin">Super Admin (All Access)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Set Default Password</label>
            <input required type="text" value={newStaff.defaultPassword} onChange={e => setNewStaff({...newStaff, defaultPassword: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:border-indigo-500 font-mono" placeholder="e.g. MatMoveStaff2024!" />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
            <button type="button" onClick={() => setIsAddStaffOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="flex items-center gap-2 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-sm disabled:opacity-50">
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Authorize Staff
            </button>
          </div>
        </form>
      </Modal>
    </AdminLayout>
  );
}