import AdminAssistance from './AdminAssistance';
import { useState, useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  MessageCircle,
  ChevronDown,
  ArrowRightLeft,
  Car,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Megaphone,
  Settings,
  Send,
  ShieldCheck,
  Users,
  Wallet,
  X,
  Bus,
  Ticket,
  ShieldAlert,
  Trophy,
  BarChart3,
  ClipboardCheck,
  Percent,
  UserRound,
} from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { canAccess, useAdminAccess, sections } from '@/lib/adminAccess';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}


const navItems = [
  { key: 'dashboard', name: 'Overview', path: '/dashboard', icon: LayoutDashboard },
  { key: 'support', name: 'Customer Support', path: '/support', icon: MessageCircle },
  { key: 'notifications', name: 'Customer Messages', path: '/notifications', icon: Send },
  { key: 'notifications', name: 'Homepage Posts', path: '/homepage-posts', icon: Megaphone },
  { key: 'concierge', name: 'Concierge', path: '/concierge', icon: ClipboardCheck },
  { key: 'dispatch', name: 'Dispatch Radar', path: '/dispatch', icon: Activity },
  { key: 'travel', name: 'Travel on Bus', path: '/travel', icon: Bus },
  { key: 'events', name: 'Events Hub', path: '/events', icon: Ticket },
  { key: 'games', name: 'Games — Spin & Win', path: '/games', icon: Activity },
  { key: 'sports', name: 'Sports — eFootball', path: '/sports', icon: Trophy },
  { key: 'pricing', name: 'Vehicle Pricing', path: '/pricing', icon: Car },
  { key: 'kyc', name: 'KYC & Onboarding', path: '/kyc', icon: ShieldCheck },
  { key: 'financials', name: 'Civitas Administrative', path: '/civitas', icon: Wallet },
  { key: 'financials', name: 'Financial & Wallets', path: '/financials', icon: Wallet },
  { key: 'financials', name: 'Loading Bonanza', path: '/loading-bonanza', icon: Percent },
  { key: 'financials', name: 'Cash & Digital Payments', path: '/cash-payments', icon: CreditCard },
  { key: 'special', name: 'Customer Refunds', path: '/special', icon: ShieldAlert },
  { key: 'special', name: 'Administrative Payroll', path: '/payroll', icon: CreditCard },
  { key: 'transactions', name: 'Digital Payments', path: '/transactions', icon: ArrowRightLeft },
  { key: 'payouts', name: 'Payouts & Withdrawals', path: '/payouts', icon: CreditCard },
  { key: 'customers', name: 'Customer Governance', path: '/customers', icon: Users },
  { key: 'staff', name: 'Staff Governance', path: '/staff', icon: Settings },
  { key: 'staff', name: 'Android App Releases', path: '/app-releases', icon: ShieldCheck },
  { key: 'reports', name: 'Reports & Analytics', path: '/reports', icon: BarChart3 },
  { key: 'logs', name: 'System Logs', path: '/logs', icon: FileText },
  { key: 'audit', name: 'Audit & Activity Review', path: '/audit', icon: ClipboardCheck },
];

const navSections = [
  {
    key: 'operations',
    name: 'Operations & Support',
    icon: Activity,
    paths: ['/support', '/notifications', '/homepage-posts', '/concierge', '/dispatch', '/travel', '/pricing'],
  },
  {
    key: 'finance',
    name: 'Finance & Wallets',
    icon: Wallet,
    paths: ['/civitas', '/financials', '/loading-bonanza', '/cash-payments', '/special', '/payroll', '/transactions', '/payouts'],
  },
  {
    key: 'customer-governance',
    name: 'Customers & Staff',
    icon: Users,
    paths: ['/customers', '/kyc'],
  },
  {
    key: 'admin-releases',
    name: 'Administration & App Releases',
    icon: ShieldCheck,
    paths: ['/staff', '/app-releases'],
  },
  {
    key: 'sports',
    name: 'Sports & Tournaments',
    icon: Trophy,
    paths: ['/sports'],
  },
  {
    key: 'games-events',
    name: 'Games & Events',
    icon: Ticket,
    paths: ['/games', '/events'],
  },
  {
    key: 'insights-system',
    name: 'Reports & System',
    icon: BarChart3,
    paths: ['/reports', '/logs', '/audit'],
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return sessionStorage.getItem('matmove-admin-sidebar-collapsed') === '1'; } catch { return false; }
  });
  const [networkOnline, setNetworkOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);

  useEffect(() => {
    const online = () => setNetworkOnline(true);
    const offline = () => setNetworkOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);

  const [gamesExpanded, setGamesExpanded] = useState(location.pathname === '/games');
  const [travelExpanded, setTravelExpanded] = useState(location.pathname === '/travel');
  const [eventsExpanded, setEventsExpanded] = useState(location.pathname === '/events');

  const [expandedSection, setExpandedSection] = useState<string | null>(() =>
    navSections.find((section) => section.paths.includes(location.pathname))?.key || null
  );
  useEffect(() => {
    const activeSection = navSections.find((section) => section.paths.includes(location.pathname))?.key || null;
    if (activeSection) setExpandedSection(activeSection);
  }, [location.pathname]);

  useEffect(() => {
    try { sessionStorage.setItem('matmove-admin-sidebar-collapsed', sidebarCollapsed ? '1' : '0'); } catch { /* Sidebar preference is optional. */ }
  }, [sidebarCollapsed]);

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const owner = access?.is_active === true && access?.is_owner === true;

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch (error: unknown) {
      const message = error instanceof Error && error.message.trim()
        ? error.message.trim()
        : 'Unable to sign out. Check your connection and try again.';
      setSignOutError(message);
    } finally {
      setSigningOut(false);
    }
  }

  const visibleItems = navItems.filter((item) => {
    if (owner) return true;

    if (item.key === 'reports') return sections.some(([key]) => canAccess(access,key));
    if (item.key === 'audit') return canAccess(access,'logs');

    if (item.path === '/payroll') return canAccess(access,'special');
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
    <div className="mm-admin-shell flex h-screen overflow-hidden bg-[#f5f9f8] font-sans">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-[#062b24]/70 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* SIDEBAR */}
      <aside
        id="admin-sidebar"
        className={`mm-admin-sidebar fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-[#073b2f] text-emerald-50 transition-transform duration-300 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${sidebarCollapsed ? 'lg:-translate-x-full' : 'lg:translate-x-0'}`}
      >
        {/* BRAND */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-emerald-900/70 px-6">
          <div className="flex items-center">
            <img
              src="/logo.png"
              alt="MatMove"
              className="mr-3 h-10 w-10 rounded-lg bg-white object-contain p-1"
            />
            <span className="text-lg font-bold tracking-wide text-white">
              MatMove
            </span>
            <span className="ml-2 mt-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-100/60">
              Admin
            </span>
          </div>

          <button
            type="button"
            onClick={closeSidebar}
            aria-label="Close sidebar"
            className="text-emerald-100/70 hover:text-white lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        {/* NAVIGATION */}
        <nav className="mm-admin-nav-list min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-4 custom-scrollbar" aria-label="Admin workspaces">
          {visibleItems.filter((item) => item.path === '/dashboard').map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || location.pathname === '/';
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={closeSidebar}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${isActive ? 'bg-sky-500 text-white shadow-sm' : 'border border-white/10 bg-white/5 text-emerald-50/90 hover:bg-white/10 hover:text-white'}`}
              >
                <Icon size={18} className={isActive ? 'text-sky-100' : 'text-emerald-200'} />
                <span>{item.name}</span>
              </Link>
            );
          })}
          {navSections.map((section) => {
            const sectionItems = visibleItems.filter((item) => section.paths.includes(item.path));
            if (!sectionItems.length) return null;
            const SectionIcon = section.icon;
            const expanded = expandedSection === section.key;
            return (
              <section key={section.key} className="mm-admin-nav-group overflow-hidden rounded-xl border border-white/10 bg-white/[0.045]">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`admin-nav-group-${section.key}`}
                  onClick={() => setExpandedSection((current) => current === section.key ? null : section.key)}
                  className={`flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-bold transition ${expanded ? 'bg-white/10 text-white' : 'text-emerald-50/85 hover:bg-white/[0.08] hover:text-white'}`}
                >
                  <SectionIcon size={18} className="shrink-0 text-emerald-200" />
                  <span className="min-w-0 flex-1">{section.name}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-emerald-100/75">{sectionItems.length}</span>
                  <ChevronDown size={16} className={`shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                </button>
                {expanded && (
                  <div id={`admin-nav-group-${section.key}`} className="mm-admin-nav-group-items space-y-1 px-2 pb-2 pt-1">
                    {sectionItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path ||
              (item.path === '/dashboard' && location.pathname === '/');

            {/* TRAVEL SUBMENU */}
            if (item.key === 'travel') {
              const selected = new URLSearchParams(location.search).get('tab') || 'overview';
              return (
                <div key="travel" className="rounded-xl border border-emerald-800/70 bg-emerald-900/35">
                  <button
                    type="button"
                    onClick={() => setTravelExpanded((o) => !o)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold ${
                      isActive ? 'text-sky-200' : 'text-emerald-50/90 hover:bg-emerald-900/70'
                    }`}
                  >
                    <Bus size={18} className="text-sky-200" />
                    <span className="flex-1">Travel on Bus</span>
                    <ChevronDown size={16} className={travelExpanded ? 'rotate-180' : ''} />
                  </button>

                  {travelExpanded && (
                    <div className="mb-2 ml-5 space-y-1 border-l border-sky-400/50 pl-3 pr-2">
                      {[
                        ['overview', 'Bus Capacity & Overview'],
                        ['manifest', 'Manifest & Approvals'],
                        ['boarding', 'Boarding & Activation'],
                        ['payments', 'Fare Payments Audit'],
                      ].filter(([tab]) => canSeeTab(tab, 'travel')).map(([tab, label]) => (
                        <Link
                          key={tab}
                          to={`/travel?tab=${tab}`}
                          onClick={closeSidebar}
                          className={`block rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                            isActive && selected === tab
                              ? 'bg-sky-500 text-white shadow-sm'
                              : 'text-slate-400 hover:bg-sky-500/20 hover:text-white'
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
              const selected = new URLSearchParams(location.search).get('tab') || 'overview';
              return (
                <div key="events" className="rounded-xl border border-sky-900/40 bg-sky-950/20">
                  <button
                    type="button"
                    onClick={() => setEventsExpanded((o) => !o)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold ${
                      isActive ? 'text-sky-400' : 'text-emerald-50/90 hover:bg-emerald-900/70'
                    }`}
                  >
                    <Ticket size={18} className="text-sky-400" />
                    <span className="flex-1">Events Hub</span>
                    <ChevronDown size={16} className={eventsExpanded ? 'rotate-180' : ''} />
                  </button>

                  {eventsExpanded && (
                    <div className="mb-2 ml-5 space-y-1 border-l border-sky-800 pl-3 pr-2">
                      {[
                        ['overview', 'Events & Flyers'],
                        ['sales', 'Ticket Sales Audit'],
                        ['checkin', 'Gate Check-In & Activation'],
                      ].filter(([tab]) => canSeeTab(tab, 'events')).map(([tab, label]) => (
                        <Link
                          key={tab}
                          to={`/events?tab=${tab}`}
                          onClick={closeSidebar}
                          className={`block rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                            isActive && selected === tab
                              ? 'bg-sky-500 text-white shadow-sm'
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
              const selected = new URLSearchParams(location.search).get('tab') || 'overview';
              return (
                <div key="games" className="rounded-xl border border-emerald-800/70 bg-emerald-900/35">
                  <button
                    type="button"
                    onClick={() => setGamesExpanded((o) => !o)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold ${
                      isActive ? 'text-sky-200' : 'text-emerald-50/90 hover:bg-emerald-900/70'
                    }`}
                  >
                    <Activity size={18} />
                    <span className="flex-1">Games — Spin & Win</span>
                    <ChevronDown size={16} className={gamesExpanded ? 'rotate-180' : ''} />
                  </button>

                  {gamesExpanded && (
                    <div className="mb-2 ml-5 space-y-1 border-l border-sky-400/50 pl-3 pr-2">
                      {[
                        ['overview', 'Overview'],
                        ['players', 'Players'],
                        ['entries', 'Entry payments'],
                        ['winnings', 'Winnings'],
                        ['settings', 'Settings & access'],
                        ['recovery', 'Receipt recovery'],
                      ].filter(([tab]) => canSeeTab(tab, 'games')).map(([tab, label]) => (
                        <Link
                          key={tab}
                          to={`/games?tab=${tab}`}
                          onClick={closeSidebar}
                          className={`block rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                            isActive && selected === tab
                              ? 'bg-sky-500 text-white shadow-sm'
                              : 'text-slate-300 hover:bg-sky-500/20 hover:text-white'
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
                key={item.name}
                to={item.path}
                onClick={closeSidebar}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-sky-500 font-bold text-white shadow-sm' : 'hover:bg-slate-900 hover:text-white'
                }`}
              >
                <Icon size={18} className={isActive ? 'text-sky-300' : 'text-slate-500'} />
                {item.name}
              </Link>
            );

                    })}
                  </div>
                )}
              </section>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-emerald-900/70 px-4 py-3 text-[10px] font-semibold tracking-wide text-emerald-100/60">
          MATMOVE OPERATIONS · SECURE ACCESS
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className={`flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ${sidebarCollapsed ? "lg:pl-0" : "lg:pl-[260px]"}`}>
        <header className="mm-admin-header z-10 flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => { if (window.matchMedia('(min-width: 1024px)').matches) setSidebarCollapsed(value => !value); else setSidebarOpen(true); }}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Toggle navigation"
              aria-controls="admin-sidebar"
              aria-expanded={typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches ? !sidebarCollapsed : sidebarOpen}
            >
              <Menu size={24} />
            </button>

            <div>
              <h1 className="text-xl font-bold text-slate-900">{title}</h1>
              {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span role="status" className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${networkOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{networkOnline ? 'Online' : 'Offline · showing last view'}</span>
            <AdminAssistance key={access?.id || 'signed-out'} />
            {access && <div className="hidden min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm md:flex">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-700"><UserRound size={16}/></span>
              <span className="min-w-0">
                <span className="block max-w-[180px] truncate text-xs font-bold text-slate-900">{access.full_name || 'MatMove Admin'}</span>
                <span className="block max-w-[180px] truncate text-[10px] text-slate-500">{owner ? 'MAIN SUPER ADMIN' : access.department || access.email}</span>
              </span>
            </div>}
            <button type="button" disabled={signingOut} onClick={() => void handleSignOut()} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-[#073b2f] px-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#0b5a45] disabled:opacity-50" aria-label="Sign out">
              <LogOut size={15}/><span className="hidden sm:inline">{signingOut ? 'Signing out…' : 'Sign out'}</span>
            </button>
          </div>
        </header>

        {signOutError && (
          <div role="alert" className="flex shrink-0 items-start justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:px-6">
            <p className="min-w-0">{signOutError}</p>
            <button type="button" onClick={() => setSignOutError('')} aria-label="Dismiss sign-out error" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
              <X size={16} />
            </button>
          </div>
        )}

        <main className="mm-admin-main flex-1 overflow-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}