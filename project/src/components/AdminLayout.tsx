import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, Car, CreditCard, FileText, LayoutDashboard, Settings, ShieldAlert, ShieldCheck, Users, Wallet, LogOut, ArrowRightLeft } from 'lucide-react';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export default function AdminLayout({ children, title, subtitle }: AdminLayoutProps) {
  const location = useLocation();

  const navItems = [
    { name: 'Overview', path: '/', icon: LayoutDashboard },
    { name: 'Dispatch Radar', path: '/dispatch', icon: Activity },
    { name: 'Vehicle Pricing', path: '/pricing', icon: Car },
    { name: 'KYC & Onboarding', path: '/kyc', icon: ShieldCheck },
    { name: 'Financial & Wallets', path: '/financials', icon: Wallet },
    { name: 'Gateway Transactions', path: '/transactions', icon: ArrowRightLeft }, // 🔴 NEW SIDEBAR ITEM
    { name: 'Payouts & Withdrawals', path: '/payouts', icon: CreditCard },
    { name: 'Customer Governance', path: '/customers', icon: Users },
    { name: 'Staff Governance', path: '/staff', icon: Settings },
    { name: 'System & Audit Logs', path: '/logs', icon: FileText },
  ];

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-950 text-slate-300 flex flex-col shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <ShieldAlert className="text-indigo-500 mr-2" size={24} />
          <span className="text-white font-bold text-lg tracking-wide">MatMove</span>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-2 mt-1">Admin</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-3">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                  isActive ? 'bg-indigo-600/10 text-indigo-400' : 'hover:bg-slate-900 hover:text-white'
                }`}
              >
                <item.icon size={18} className={isActive ? 'text-indigo-500' : 'text-slate-500'} />
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <button className="flex items-center gap-3 px-3 py-2.5 w-full text-left text-sm font-medium text-slate-500 hover:text-rose-400 transition rounded-xl hover:bg-slate-900">
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="bg-white border-b border-slate-200 px-8 py-5 shrink-0 z-10 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}