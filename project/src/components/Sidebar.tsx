import { NavLink } from 'react-router-dom';
import { FileCheck, Wallet, Banknote, Users, ScrollText, ShieldCheck, X, Radar, Activity, BriefcaseBusiness } from 'lucide-react';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const nav = [
  { to: '/dashboard', label: 'Overview', icon: Activity },
  { to: '/dispatch', label: 'Dispatch Radar', icon: Radar },
  { to: '/kyc', label: 'KYC & Onboarding', icon: FileCheck },
  { to: '/wallets', label: 'Financial & Wallets', icon: Wallet },
  { to: '/withdrawals', label: 'Payouts & Withdrawals', icon: Banknote },
  { to: '/users', label: 'Customer Governance', icon: Users },
  { to: '/staff', label: 'Staff Governance', icon: BriefcaseBusiness },
  { to: '/audit', label: 'System & Audit Logs', icon: ScrollText },
];

export default function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden />}
      <aside className={`fixed z-40 inset-y-0 left-0 w-72 bg-slate-900 text-slate-200 flex flex-col transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-6 py-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-900/40">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white tracking-tight">MatMove</h1>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Admin Console</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} onClick={onClose} className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>
    </>
  );
}