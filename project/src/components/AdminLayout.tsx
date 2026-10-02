import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, Car, CreditCard, FileText, LayoutDashboard, Settings, ShieldAlert, ShieldCheck, Users, Wallet, LogOut, ArrowRightLeft, Menu, X } from 'lucide-react';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export default function AdminLayout({ children, title, subtitle }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { name: 'Overview', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Dispatch Radar', path: '/dispatch', icon: Activity },
    { name: 'Vehicle Pricing', path: '/pricing', icon: Car },
    { name: 'KYC & Onboarding', path: '/kyc', icon: ShieldCheck },
    { name: 'Financial & Wallets', path: '/financials', icon: Wallet },
    { name: 'Gateway Transactions', path: '/transactions', icon: ArrowRightLeft },
    { name: 'Payouts & Withdrawals', path: '/payouts', icon: CreditCard },
    { name: 'Customer Governance', path: '/customers', icon: Users },
    { name: 'Staff Governance', path: '/staff', icon: Settings },
    { name: 'System & Audit Logs', path: '/logs', icon: FileText },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      
      {/* MOBILE OVERLAY */}
      {sidebarOpen && <div className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      
      {/* THE ONLY SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 w-[260px] bg-slate-950 text-slate-300 flex flex-col z-50 transform transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800 shrink-0">
          <div className="flex items-center">
            <ShieldAlert className="text-indigo-500 mr-2" size={24} />
            <span className="text-white font-bold text-lg tracking-wide">MatMove</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-2 mt-1">Admin</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-3">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path === '/dashboard' && location.pathname === '/');
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                  isActive ? 'bg-indigo-600/10 text-indigo-400 font-bold' : 'hover:bg-slate-900 hover:text-white'
                }`}
              >
                <item.icon size={18} className={isActive ? 'text-indigo-500' : 'text-slate-500'} />
                {item.name}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-slate-800 shrink-0">
          <button className="flex items-center gap-3 px-3 py-2.5 w-full text-left text-sm font-medium text-slate-500 hover:text-rose-400 transition rounded-xl hover:bg-slate-900">
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </aside>
      
      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-[260px] transition-all duration-300">
        <header className="bg-white border-b border-slate-200 px-6 py-5 sm:px-8 sm:py-6 shrink-0 flex items-center gap-4 z-10">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-slate-500 hover:text-slate-700">
            <Menu className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{title}</h1>
            {subtitle && <p className="text-xs sm:text-sm text-slate-500 mt-1">{subtitle}</p>}
          </div>
        </header>
        
        <main className="flex-1 overflow-auto p-4 sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}