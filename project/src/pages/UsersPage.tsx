import { useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import Spinner from '@/components/Spinner';
import EmptyState from '@/components/EmptyState';
import { useUsers } from '@/lib/hooks';
import { timeAgo } from '@/lib/format';
import type { Role } from '@/lib/types';
import { Users, UserCircle, ChevronDown, Phone } from 'lucide-react';

const roleTone: Record<Role, 'indigo' | 'emerald' | 'amber' | 'blue' | 'slate'> = {
  rider: 'blue',
  driver: 'indigo',
  vendor: 'emerald',
  ops_manager: 'amber',
  super_admin: 'slate',
};

const allRoles: Role[] = ['rider', 'driver', 'vendor', 'ops_manager', 'super_admin'];

export default function UsersPage() {
  const { items, loading, changeRole } = useUsers();
  const [filter, setFilter] = useState<'all' | Role>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((u) => u.role === filter)),
    [items, filter]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { rider: 0, driver: 0, vendor: 0, ops_manager: 0, super_admin: 0 };
    items.forEach((u) => { c[u.role] = (c[u.role] || 0) + 1; });
    return c;
  }, [items]);

  const handleChange = async (id: string, role: Role) => {
    setErr(null);
    setBusyId(id);
    try {
      await changeRole(id, role);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update role');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminLayout
      title="User & Staff Governance"
      subtitle="Master directory and role management"
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {allRoles.map((r) => (
          <StatCard key={r} label={r.replace('_', ' ')} value={String(counts[r] || 0)} icon={UserCircle} tone="indigo" />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
            filter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          All
        </button>
        {allRoles.map((r) => (
          <button
            key={r}
            onClick={() => setFilter(r)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${
              filter === r ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {r.replace('_', ' ')}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{err}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <Spinner label="Loading directory..." />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} title="No users" description="No users match this role filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Name</th>
                  <th className="text-left px-5 py-3 font-medium">Phone</th>
                  <th className="text-left px-5 py-3 font-medium">Current Role</th>
                  <th className="text-left px-5 py-3 font-medium">Joined</th>
                  <th className="text-right px-5 py-3 font-medium">Change Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
                          {u.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                        </div>
                        <p className="font-medium text-slate-900">{u.full_name}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {u.phone_number || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3"><Badge tone={roleTone[u.role]}>{u.role.replace('_', ' ')}</Badge></td>
                    <td className="px-5 py-3 text-slate-500">{timeAgo(u.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="relative inline-block">
                        <select
                          disabled={busyId === u.id}
                          value={u.role}
                          onChange={(e) => handleChange(u.id, e.target.value as Role)}
                          className="appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50 capitalize"
                        >
                          {allRoles.map((r) => (
                            <option key={r} value={r}>{r.replace('_', ' ')}</option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
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
