import { Search, Bell, User, Truck, Store, Shield, UserCog } from 'lucide-react';

export function StaffGovernancePage() {
  return (
    <div className="flex-1 bg-slate-50 flex flex-col font-sans h-full overflow-y-auto">
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User & Staff Governance</h1>
          <p className="text-sm text-slate-500 mt-1">Master directory and role management</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Search records..." className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-600 outline-none w-64" />
          </div>
          <button className="relative p-2 text-slate-400 hover:text-slate-600 transition">
            <Bell size={20} />
            <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full border border-white"></span>
          </button>
        </div>
      </header>

      <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Role Stats */}
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: 'rider', count: 1, icon: User },
            { label: 'driver', count: 3, icon: Truck },
            { label: 'vendor', count: 1, icon: Store },
            { label: 'ops manager', count: 1, icon: UserCog },
            { label: 'super admin', count: 0, icon: Shield }
          ].map((stat, i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
              <div>
                <span className="text-slate-500 text-sm font-medium capitalize">{stat.label}</span>
                <div className="text-2xl font-bold text-slate-900 mt-1">{stat.count}</div>
              </div>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><stat.icon size={18} /></div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          {['All', 'Rider', 'Driver', 'Vendor', 'Ops Manager', 'Super Admin'].map(f => (
            <button key={f} className={`text-sm font-bold px-4 py-2 rounded-xl transition ${f === 'All' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {f}
            </button>
          ))}
        </div>

        {/* Directory Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100">
                <th className="p-4 font-semibold">Name</th>
                <th className="p-4 font-semibold">Phone</th>
                <th className="p-4 font-semibold">Current Role</th>
                <th className="p-4 font-semibold">Joined</th>
                <th className="p-4 font-semibold text-right">Change Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {[
                { init: 'AK', name: 'Aisha Kamara', phone: '+232 77 123 456', role: 'driver', time: '21m ago' },
                { init: 'MS', name: 'Mohamed Sesay', phone: '+232 78 998 112', role: 'driver', time: '1h ago' },
                { init: 'FC', name: 'Fatmata Conteh', phone: '+232 76 445 778', role: 'rider', time: '1d ago' },
                { init: 'IK', name: 'Ibrahim Koroma', phone: '+232 79 332 110', role: 'vendor', time: '1h ago', color: 'emerald' },
                { init: 'HB', name: 'Hawa Bangura', phone: '+232 77 880 220', role: 'ops manager', time: '2d ago', color: 'amber' },
                { init: 'SA', name: 'Sankoh Abdul', phone: '+232 78 667 443', role: 'driver', time: '3h ago' }
              ].map((u, i) => (
                <tr key={i} className="hover:bg-slate-50 transition">
                  <td className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                      {u.init}
                    </div>
                    <div className="font-bold text-slate-900">{u.name}</div>
                  </td>
                  <td className="p-4 text-slate-600 font-medium">{u.phone}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                      u.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' : u.color === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'
                    }`}>{u.role}</span>
                  </td>
                  <td className="p-4 text-slate-500">{u.time}</td>
                  <td className="p-4 text-right">
                    <select className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-32 p-2 ml-auto outline-none cursor-pointer">
                      <option>{u.role.charAt(0).toUpperCase() + u.role.slice(1)}</option>
                      <option>Rider</option>
                      <option>Driver</option>
                      <option>Vendor</option>
                      <option>Ops Manager</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}