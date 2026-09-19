import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, FileCheck, Wallet, ArrowLeftRight, Activity, Menu, X, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function AdminLayout({ children, title, subtitle }: { children: React.ReactNode, title: string, subtitle?: string }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const navItems = [
    { name: 'Compliance Dashboard', path: '/admin', icon: LayoutDashboard },
    { name: 'KYC & Onboarding', path: '/admin/kyc', icon: FileCheck },
    { name: 'Financial & Wallets', path: '/admin/financials', icon: Wallet },
    { name: 'Payouts & Withdrawals', path: '/admin/payouts', icon: ArrowLeftRight },
    { name: 'User & Staff Governance', path: '/admin/users', icon: Users },
    { name: 'System & Audit Logs', path: '/admin/logs', icon: Activity },
  ];

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar - FIXED on Desktop, Hidden on Mobile unless toggled */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-[#0f172a] text-slate-300 flex flex-col transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-6 flex items-center gap-3 bg-[#0b1121]">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-bold text-blue-600">MM</div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">MatMove</h1>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Admin Console</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path));
            return (
              <Link key={item.name} to={item.path} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${isActive ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-800 hover:text-white'}`}>
                <Icon size={18} className={isActive ? 'text-white' : 'text-slate-400'} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button onClick={handleLogout} className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-xl transition-colors">
            <LogOut size={16} /> Logout Admin
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-lg lg:hidden">
              <Menu size={24} />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 leading-tight">{title}</h2>
              {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-xs font-bold border border-emerald-200">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live Data
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto bg-slate-50 p-6 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}