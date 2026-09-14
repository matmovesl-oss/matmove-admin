import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { User, CarFront, Store, Settings, ShieldAlert } from 'lucide-react';

export function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');

  const fetchLiveUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setUsers(data);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveUsers();
  }, []);

  const stats = {
    rider: users.filter(u => u.role === 'rider' || !u.role).length,
    driver: users.filter(u => u.role === 'driver').length,
    vendor: users.filter(u => u.role === 'merchant' || u.role === 'vendor').length,
    ops: users.filter(u => u.role === 'admin' || u.role === 'ops').length,
  };

  const filteredUsers = activeTab === 'All' ? users : users.filter(u => {
    if (activeTab === 'Rider') return u.role === 'rider' || !u.role;
    if (activeTab === 'Driver') return u.role === 'driver';
    if (activeTab === 'Vendor') return u.role === 'merchant' || u.role === 'vendor';
    if (activeTab === 'Ops Manager') return u.role === 'admin' || u.role === 'ops';
    return true;
  });

  return (
    <AdminLayout title="User & Staff Governance" subtitle="Master directory and role management">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
          <div><p className="text-sm font-medium text-slate-500">Rider</p><h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.rider}</h3></div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><User size={18} /></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
          <div><p className="text-sm font-medium text-slate-500">Driver</p><h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.driver}</h3></div>
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><CarFront size={18} /></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
          <div><p className="text-sm font-medium text-slate-500">Vendor</p><h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.vendor}</h3></div>
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Store size={18} /></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
          <div><p className="text-sm font-medium text-slate-500">Ops Manager</p><h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.ops}</h3></div>
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Settings size={18} /></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
          <div><p className="text-sm font-medium text-slate-500">Super Admin</p><h3 className="text-2xl font-bold text-slate-900 mt-1">1</h3></div>
          <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><ShieldAlert size={18} /></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {['All', 'Rider', 'Driver', 'Vendor', 'Ops Manager'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${
              activeTab === tab ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Data Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="p-8 text-center text-slate-500 font-medium">Loading live directory...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-slate-500 font-medium">No users found in this category.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Phone / Email</th>
                  <th className="px-6 py-4">Current Role</th>
                  <th className="px-6 py-4">Joined</th>
                  <th className="px-6 py-4 text-right">Change Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-sm">
                        {user.full_name ? user.full_name.substring(0, 2).toUpperCase() : 'U'}
                      </div>
                      <span className="font-bold text-slate-900">{user.full_name || 'New User'}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {user.phone || user.email || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                        user.role === 'driver' ? 'bg-indigo-100 text-indigo-700' :
                        user.role === 'merchant' ? 'bg-emerald-100 text-emerald-700' :
                        user.role === 'admin' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {user.role || 'Rider'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <select className="bg-white border border-slate-200 text-slate-700 text-xs rounded-lg px-2 py-1.5 outline-none cursor-pointer">
                        <option value="rider">Rider</option>
                        <option value="driver">Driver</option>
                        <option value="merchant">Vendor</option>
                        <option value="admin">Ops Manager</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}