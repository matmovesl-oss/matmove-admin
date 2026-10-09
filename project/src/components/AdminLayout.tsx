import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import {
  Activity,
  ArrowRightLeft,
  Car,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';

import { supabase } from '@/lib/supabase';
import {
  canAccess,
  useAdminAccess,
} from '@/lib/adminAccess';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

const navItems = [
  {
    key: 'dashboard',
    name: 'Overview',
    path: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    key: 'dispatch',
    name: 'Dispatch Radar',
    path: '/dispatch',
    icon: Activity,
  },
  {
    key: 'pricing',
    name: 'Vehicle Pricing',
    path: '/pricing',
    icon: Car,
  },
  {
    key: 'kyc',
    name: 'KYC & Onboarding',
    path: '/kyc',
    icon: ShieldCheck,
  },
  {
    key: 'financials',
    name: 'Financial & Wallets',
    path: '/financials',
    icon: Wallet,
  },
  {
    key: 'transactions',
    name: 'Gateway Transactions',
    path: '/transactions',
    icon: ArrowRightLeft,
  },
  {
    key: 'payouts',
    name: 'Payouts & Withdrawals',
    path: '/payouts',
    icon: CreditCard,
  },
  {
    key: 'customers',
    name: 'Customer Governance',
    path: '/customers',
    icon: Users,
  },
  {
    key: 'marketplace',
    name: 'Products & Orders',
    path: '/marketplace',
    icon: Package,
  },
  {
    key: 'staff',
    name: 'Staff Governance',
    path: '/staff',
    icon: Settings,
  },
  {
    key: 'logs',
    name: 'System & Audit Logs',
    path: '/logs',
    icon: FileText,
  },
];

export default function AdminLayout({
  children,
  title,
  subtitle,
}: AdminLayoutProps) {
  const location = useLocation();
  const access = useAdminAccess();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  async function handleSignOut() {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    setSignOutError('');

    try {
      const { error } = await supabase.auth.signOut({
        scope: 'local',
      });

      if (error) {
        throw error;
      }

      // App's existing authentication listener returns
      // the user to the login screen.
    } catch (error) {
      setSignOutError(
        error instanceof Error
          ? error.message
          : 'Unable to sign out. Please try again.'
      );
    } finally {
      setSigningOut(false);
    }
  }

  const visibleItems = navItems.filter(item => {
    if (access) {
      return canAccess(access, item.key);
    }

    // Preserve the existing navigation while the remaining
    // replacement files are being installed.
    // The updated App will provide verified admin access.
    return item.key !== 'marketplace';
  });

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-900/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-slate-950 text-slate-300 transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen
            ? 'translate-x-0'
            : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-6">
          <div className="flex items-center">
            <ShieldAlert
              size={24}
              className="mr-2 text-indigo-500"
            />

            <span className="text-lg font-bold tracking-wide text-white">
              MatMove
            </span>

            <span className="ml-2 mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Admin
            </span>
          </div>

          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
            className="text-slate-400 hover:text-white lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {visibleItems.map(item => {
            const Icon = item.icon;

            const isActive =
              location.pathname === item.path ||
              (
                item.path === '/dashboard' &&
                location.pathname === '/'
              );

            return (
              <Link
                key={item.key}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-600/10 font-bold text-indigo-400'
                    : 'hover:bg-slate-900 hover:text-white'
                }`}
              >
                <Icon
                  size={18}
                  className={
                    isActive
                      ? 'text-indigo-500'
                      : 'text-slate-500'
                  }
                />

                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-slate-800 p-4">
          {access && (
            <div className="mb-3 px-3 text-xs text-slate-400">
              <p className="font-semibold text-slate-200">
                {access.full_name || access.email}
              </p>

              {access.department && (
                <p className="mt-1">
                  {access.department}
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-400 transition hover:bg-slate-900 hover:text-rose-400 disabled:opacity-50"
          >
            <LogOut size={18} />

            {signingOut
              ? 'Signing out...'
              : 'Sign Out'}
          </button>

          {signOutError && (
            <p
              role="alert"
              className="mt-3 px-3 text-sm text-red-300"
            >
              {signOutError}
            </p>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[260px]">
        <header className="z-10 flex shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-6 py-5 sm:px-8 sm:py-6">
          <button
            type="button"
            aria-label="Open sidebar"
            onClick={() => setSidebarOpen(true)}
            className="text-slate-500 hover:text-slate-700 lg:hidden"
          >
            <Menu size={24} />
          </button>

          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              {title}
            </h1>

            {subtitle && (
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                {subtitle}
              </p>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}