import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout'; // Corrected import
import Modal from '@/components/Modal';
import { supabase } from '@/lib/supabase';
import { Users, Search, RefreshCw, Loader2, UserPlus, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Add User State
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', fullName: '', role: 'rider', defaultPassword: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('admin_user_invites').insert({
        email: newUser.email,
        full_name: newUser.fullName,
        role: newUser.role,
        temp_password: newUser.defaultPassword
      });

      if (error) throw error;
      alert(`Invitation generated for ${newUser.email}! They can log in with the default password you set.`);
      setIsAddUserOpen(false);
      setNewUser({ email: '', fullName: '', role: 'rider', defaultPassword: '' });
    } catch (err: any) {
      alert(`Note: To create users silently, ensure the 'admin_user_invites' table and Edge Function are deployed. Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredUsers = users.filter(u => 
    (u.full_name?.toLowerCase().includes(search.toLowerCase()) || '') || 
    (u.email?.toLowerCase().includes(search.toLowerCase()) || '')
  );

  return (
    <AdminLayout title="User & Staff Governance" subtitle="Manage all customer and internal accounts">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-600 outline-none"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={fetchUsers} className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={() => setIsAddUserOpen(true)} className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-bold flex-1 sm:flex-none shadow-sm">
            <UserPlus size={16} /> Add User
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2" size={24} /> Loading users...</div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide sticky top-0">
                <tr>
                  <th className="px-6 py-4 font-medium">User</th>
                  <th className="px-6 py-4 font-medium">Role</th>
                  <th className="px-6 py-4 font-medium">Contact</th>
                  <th className="px-6 py-4 font-medium">KYC Status</th>
                  <th className="px-6 py-4 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{user.full_name || 'No Name'}</div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{user.id.slice(0, 12)}...</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-700">{user.email || 'No Email'}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{user.phone || user.phone_number || 'No Phone'}</div>
                    </td>
                    <td className="px-6 py-4">
                      {user.kyc_status === 'approved' ? (
                        <span className="flex items-center gap-1 text-emerald-600 font-bold text-xs"><CheckCircle2 size={14}/> Approved</span>
                      ) : user.kyc_status === 'rejected' ? (
                        <span className="flex items-center gap-1 text-red-600 font-bold text-xs"><ShieldAlert size={14}/> Rejected</span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-600 font-bold text-xs"><ShieldAlert size={14}/> Pending</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={isAddUserOpen} onClose={() => !isSubmitting && setIsAddUserOpen(false)} title="Create New Account" maxWidth="max-w-md">
        <form onSubmit={handleAddUser} className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-6">
            <p className="text-xs text-indigo-800 leading-relaxed">
              <strong>Admin Creation Notice:</strong> To bypass email verification safely, this action generates an invitation and a default password. Send this default password to the user. Upon first login, they will be prompted to reset it.
            </p>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Full Name</label>
            <input required type="text" value={newUser.fullName} onChange={e => setNewUser({...newUser, fullName: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:border-indigo-500" placeholder="e.g. John Doe" />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email Address</label>
            <input required type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:border-indigo-500" placeholder="john@example.com" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Account Role</label>
            <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:border-indigo-500">
              <option value="rider">Rider</option>
              <option value="merchant">Merchant</option>
              <option value="driver">Driver</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Set Default Password</label>
            <input required type="text" value={newUser.defaultPassword} onChange={e => setNewUser({...newUser, defaultPassword: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:border-indigo-500 font-mono" placeholder="e.g. MatMove2024!" />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
            <button type="button" onClick={() => setIsAddUserOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-sm disabled:opacity-50">
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Create Account
            </button>
          </div>
        </form>
      </Modal>
    </AdminLayout>
  );
}