import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, Wallet, ArrowRightLeft, Users, FileText, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';

const NAV_ITEMS = [
  { path: '/', label: 'Compliance Dashboard', icon: LayoutDashboard },
  { path: '/kyc', label: 'KYC & Onboarding', icon: CheckSquare },
  { path: '/financials', label: 'Financial & Wallets', icon: Wallet },
  { path: '/payouts', label: 'Payouts & Withdrawals', icon: ArrowRightLeft },
  { path: '/staff', label: 'User & Staff Governance', icon: Users },
  { path: '/logs', label: 'System & Audit Logs', icon: FileText },
];

export function Layout() {
  const handleLogout = async () => await supabase.auth.signOut();

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <aside className="w-72 bg-[#0f172a] text-slate-300 flex flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <div className="bg-indigo-600 p-2 rounded-xl flex items-center justify-center">
            <img src="/logo.png" alt="MatMove" className="w-6 h-6 object-contain" />
          </div>
          <div>
            <h1 className="font-bold text-white text-lg leading-tight">MatMove</h1>
            <p className="text-[11px] text-slate-400 tracking-wider uppercase font-medium">Admin Console</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  isActive ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-6 border-t border-slate-800">
          <button onClick={handleLogout} className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-semibold transition-colors">
            <LogOut size={16} /> Logout Admin
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto flex flex-col h-screen">
        <Outlet />
      </main>
    </div>
  );
}