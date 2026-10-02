import { Link, useLocation } from 'react-router-dom';
import { Activity, Car, CreditCard, FileText, LayoutDashboard, Settings, ShieldAlert, ShieldCheck, Users, Wallet, LogOut, ArrowRightLeft, X } from 'lucide-react';

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();

  const navItems = [
    { name: 'Overview', path: '/', icon: LayoutDashboard },
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
    <>
      {open && <div className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden" onClick={onClose} />}
      <aside className={`fixed inset-y-0 left-0 w-[260px] bg-slate-950 text-slate-300 flex flex-col z-50 transform transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800 shrink-0">
          <div className="flex items-center">
            <ShieldAlert className="text-indigo-500 mr-2" size={24} />
            <span className="text-white font-bold text-lg tracking-wide">MatMove</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-2 mt-1">Admin</span>
          </div>
          <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-3 custom-scrollbar">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={onClose}
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
    </>
  );
}