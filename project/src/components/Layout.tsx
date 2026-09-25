import { Outlet, NavLink } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  LayoutDashboard, Radar, Tag, FileCheck, Wallet, 
  Banknote, Users, UserCog, ScrollText, LogOut, Shield 
} from 'lucide-react';

export function Layout() {
  
  const handleSignOut = async () => {
    // Completely destroys the Supabase Auth session
    await supabase.auth.signOut();
  };

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
    { to: '/dispatch', icon: Radar, label: 'Dispatch Radar' },
    { to: '/pricing', icon: Tag, label: 'Vehicle Pricing' },
    { to: '/kyc', icon: FileCheck, label: 'KYC & Onboarding' },
    { to: '/wallets', icon: Wallet, label: 'Financial & Wallets' },
    { to: '/withdrawals', icon: Banknote, label: 'Payouts & Withdrawals' },
    { to: '/users', icon: Users, label: 'Customer Governance' },
    { to: '/staff', icon: UserCog, label: 'Staff Governance' },
    { to: '/audit', icon: ScrollText, label: 'System & Audit Logs' },
  ];

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-slate-300 flex flex-col">
        <div className="p-6 flex items-center gap-3 text-white">
           <div className="bg-indigo-600 p-2 rounded-lg shadow-sm">
             <Shield size={20} />
           </div>
           <div>
             <span className="font-bold text-lg tracking-tight block">MatMove</span>
             <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest block -mt-1">Admin Console</span>
           </div>
        </div>
        
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink 
              key={item.to} 
              to={item.to}
              className={({ isActive }) => 
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* SECURE SIGN OUT BUTTON */}
        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={handleSignOut}
            className="flex items-center justify-center gap-2 px-3 py-2.5 w-full rounded-lg text-sm font-bold text-slate-400 bg-slate-800/50 hover:bg-red-500 hover:text-white transition-all shadow-sm"
          >
            <LogOut size={16} />
            Sign Out Session
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}