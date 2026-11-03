
import AdminAssistance from './AdminAssistance';
import { useState, useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  ChevronDown,
  ArrowRightLeft,
  Car,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Send,
  ShieldCheck,
  Users,
  Wallet,
  X,
  Bus,
  Ticket,
  ShieldAlert,
  BarChart3,
  ClipboardCheck,
} from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { canAccess, useAdminAccess } from '@/lib/adminAccess';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

const SUPER_ADMIN_EMAIL = 'matmove.sl@gmail.com';

const navItems = [
  { key: 'dashboard', name: 'Overview', path: '/dashboard', icon: LayoutDashboard },
  { key: 'notifications', name: 'Customer Messages', path: '/notifications', icon: Send },
  { key: 'dispatch', name: 'Dispatch Radar', path: '/dispatch', icon: Activity },
  { key: 'travel', name: 'Travel on Bus', path: '/travel', icon: Bus },
  { key: 'events', name: 'Events Hub', path: '/events', icon: Ticket },
  { key: 'games', name: 'Games — Spin & Win', path: '/games', icon: Activity },
  { key: 'pricing', name: 'Vehicle Pricing', path: '/pricing', icon: Car },
  { key: 'kyc', name: 'KYC & Onboarding', path: '/kyc', icon: ShieldCheck },
  { key: 'financials', name: 'Financial & Wallets', path: '/financials', icon: Wallet },
  { key: 'special', name: 'Refunds & Special Ops', path: '/special', icon: ShieldAlert },
  { key: 'transactions', name: 'Gateway Transactions', path: '/transactions', icon: ArrowRightLeft },
  { key: 'payouts', name: 'Payouts & Withdrawals', path: '/payouts', icon: CreditCard },
  { key: 'customers', name: 'Customer Governance', path: '/customers', icon: Users },
  { key: 'staff', name: 'Staff Governance', path: '/staff', icon: Settings },
  { key: 'reports', name: 'Reports & Analytics', path: '/reports', icon: BarChart3 },
  { key: 'logs', name: 'System Logs', path: '/logs', icon: FileText },
  { key: 'audit', name: 'Audit & Activity Review', path: '/audit', icon: ClipboardCheck },
];

export default function AdminLayout({
  children,
  title,
  subtitle,
}: AdminLayoutProps) {
  const location = useLocation();
  const access = useAdminAccess();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [gamesExpanded, setGamesExpanded] = useState(location.pathname === '/games');
  const [travelExpanded, setTravelExpanded] = useState(location.pathname === '/travel');
  const [eventsExpanded, setEventsExpanded] = useState(location.pathname === '/events');
  const [signingOut, setSigningOut] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Recognise the main owner from both the authenticated account
  // and the trusted owner access context supplied by App.tsx.
  const contextOwner = Boolean((access as any)?.is_owner);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted || error) return;

      const email = data.user?.email?.toLowerCase().trim();

      setIsSuperAdmin(email === SUPER_ADMIN_EMAIL);
    }).catch((error) => {
      console.error('Unable to verify administrator account:', error);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const owner = isSuperAdmin || contextOwner;

  async function handleSignOut() {
    if (signingOut) return;

    setSigningOut(true);

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      console.error('Sign out failed:', error);
    } finally {
      setSigningOut(false);
    }
  }

  // The main administrator sees every registered navigation section.
  const visibleItems = navItems.filter((item) => {
    if (owner) return true;

    if (item.key === 'reports' || item.key === 'audit') {
      return false;
    }

    if (item.key === 'special') {
      return (
        canAccess(access, 'special') ||
        canAccess(access, 'financials')
      );
    }

    return canAccess(access, item.key);
  });

  const canSeeTab = (tab: string, module: string) => {
    if (owner) return true;

    return (
      canAccess(access, `${module}.${tab}`) ||
      canAccess(access, module)
    );
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans">

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-900/60 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-slate-950 text-slate-300 transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >

        {/* BRAND */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-6">
          <div className="flex items-center">
            <img
              src="/logo.png"
              alt="MatMove"
              className="mr-3 h-10 w-10 rounded-lg bg-white object-contain p-1"
            />

            <span className="text-lg font-bold tracking-wide text-white">
              MatMove
            </span>

            <span className="ml-2 mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Admin
            </span>
          </div>

          <button
            type="button"
            onClick={closeSidebar}
            aria-label="Close sidebar"
            className="text-slate-400 hover:text-white lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        {/* NAVIGATION */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4">

          {visibleItems.map((item) => {
            const Icon = item.icon;

            const isActive =
              location.pathname === item.path ||
              (item.path === '/dashboard' && location.pathname === '/');

            {/* TRAVEL SUBMENU */}
            if (item.key === 'travel') {
              const selected =
                new URLSearchParams(location.search).get('tab') || 'overview';

              return (
                <div
                  key="travel"
                  className="rounded-xl border border-indigo-900/40 bg-indigo-950/20"
                >
                  <button
                    type="button"
                    onClick={() => setTravelExpanded((o) => !o)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold ${
                      isActive
                        ? 'text-indigo-400'
                        : 'text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    <Bus size={18} className="text-indigo-400" />
                    <span className="flex-1">Travel on Bus</span>
                    <ChevronDown
                      size={16}
                      className={travelExpanded ? 'rotate-180' : ''}
                    />
                  </button>

                  {travelExpanded && (
                    <div className="mb-2 ml-5 space-y-1 border-l border-indigo-800 pl-3 pr-2">
                      {[
                        ['overview', 'Bus Capacity & Overview'],
                        ['manifest', 'Manifest & Approvals'],
                        ['boarding', 'Boarding & Activation'],
                        ['payments', 'Fare Payments Audit'],
                      ]
                        .filter(([tab]) => canSeeTab(tab, 'travel'))
                        .map(([tab, label]) => (
                          <Link
                            key={tab}
                            to={`/travel?tab=${tab}`}
                            onClick={closeSidebar}
                            className={`block rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                              isActive && selected === tab
                                ? 'bg-indigo-700 text-white'
                                : 'text-slate-400 hover:bg-indigo-900/40 hover:text-white'
                            }`}
                          >
                            {label}
                          </Link>
                        ))}
                    </div>
                  )}
                </div>
              );
            }

            {/* EVENTS SUBMENU */}
            if (item.key === 'events') {
              const selected =
                new URLSearchParams(location.search).get('tab') || 'overview';

              return (
                <div
                  key="events"
                  className="rounded-xl border border-sky-900/40 bg-sky-950/20"
                >
                  <button
                    type="button"
                    onClick={() => setEventsExpanded((o) => !o)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold ${
                      isActive
                        ? 'text-sky-400'
                        : 'text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    <Ticket size={18} className="text-sky-400" />
                    <span className="flex-1">Events Hub</span>
                    <ChevronDown
                      size={16}
                      className={eventsExpanded ? 'rotate-180' : ''}
                    />
                  </button>

                  {eventsExpanded && (
                    <div className="mb-2 ml-5 space-y-1 border-l border-sky-800 pl-3 pr-2">
                      {[
                        ['overview', 'Events & Flyers'],
                        ['sales', 'Ticket Sales Audit'],
                        ['checkin', 'Gate Check-In & Activation'],
                      ]
                        .filter(([tab]) => canSeeTab(tab, 'events'))
                        .map(([tab, label]) => (
                          <Link
                            key={tab}
                            to={`/events?tab=${tab}`}
                            onClick={closeSidebar}
                            className={`block rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                              isActive && selected === tab
                                ? 'bg-sky-700 text-white'
                                : 'text-slate-400 hover:bg-sky-900/40 hover:text-white'
                            }`}
                          >
                            {label}
                          </Link>
                        ))}
                    </div>
                  )}
                </div>
              );
            }

            {/* GAMES SUBMENU */}
            if (item.key === 'games') {
              const selected =
                new URLSearchParams(location.search).get('tab') || 'overview';

              return (
                <div
                  key="games"
                  className="rounded-xl border border-purple-900/40 bg-purple-950/20"
                >
                  <button
                    type="button"
                    onClick={() => setGamesExpanded((o) => !o)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold ${
                      isActive
                        ? 'text-amber-300'
                        : 'text-purple-200 hover:bg-slate-900'
                    }`}
                  >
                    <Activity size={18} />
                    <span className="flex-1">Games — Spin & Win</span>
                    <ChevronDown
                      size={16}
                      className={gamesExpanded ? 'rotate-180' : ''}
                    />
                  </button>

                  {gamesExpanded && (
                    <div className="mb-2 ml-5 space-y-1 border-l border-purple-800 pl-3 pr-2">
                      {[
                        ['overview', 'Overview'],
                        ['players', 'Players'],
                        ['entries', 'Entry payments'],
                        ['winnings', 'Winnings'],
                        ['settings', 'Settings & access'],
                        ['recovery', 'Receipt recovery'],
                      ]
                        .filter(([tab]) => canSeeTab(tab, 'games'))
                        .map(([tab, label]) => (
                          <Link
                            key={tab}
                            to={`/games?tab=${tab}`}
                            onClick={closeSidebar}
                            className={`block rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                              isActive && selected === tab
                                ? 'bg-purple-700 text-white'
                                : 'text-slate-300 hover:bg-purple-900/50'
                            }`}
                          >
                            {label}
                          </Link>
                        ))}
                    </div>
                  )}
                </div>
              );
            }

            {/* STANDARD NAVIGATION */}
            return (
              <Link
                key={item.key}
                to={item.path}
                onClick={closeSidebar}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-600/15 font-bold text-indigo-400'
                    : 'hover:bg-slate-900 hover:text-white'
                }`}
              >
                <Icon
                  size={18}
                  className={isActive ? 'text-indigo-500' : 'text-slate-500'}
                />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* ADMIN ACCOUNT */}
        <div className="shrink-0 border-t border-slate-800 p-4">

          {owner ? (
            <div className="mb-3 rounded-xl border border-amber-700/30 bg-amber-950/20 p-3">
              <p className="truncate text-xs font-bold text-amber-400">
                MAIN SUPER ADMIN
              </p>
              <p className="mt-1 truncate text-xs text-slate-400">
                {SUPER_ADMIN_EMAIL}
              </p>
              <p className="mt-1 text-[10px] text-emerald-400">
                Full administrative access
              </p>
            </div>
          ) : access ? (
            <div className="mb-3 px-2 text-xs text-slate-400">
              <p className="truncate font-semibold text-slate-200">
                {access.full_name || access.email}
              </p>
              {access.department && (
                <p className="mt-0.5 text-slate-500">
                  {access.department}
                </p>
              )}
            </div>
          ) : null}

          <button
            type="button"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-400 transition hover:bg-slate-900 hover:text-rose-400 disabled:opacity-50"
          >
            <LogOut size={18} />
            {signingOut ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-[260px]">

        <header className="z-10 flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="text-slate-500 hover:text-slate-700 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={24} />
            </button>

            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {title}
              </h1>

              {subtitle && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <AdminAssistance key={access?.id || 'signed-out'} />
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
