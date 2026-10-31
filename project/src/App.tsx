import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import { KycPage } from './pages/KycPage';
import { FinancialsPage } from './pages/FinancialsPage';
import { PayoutsPage } from './pages/PayoutsPage';
import UsersPage from './pages/UsersPage'; 
import { StaffGovernancePage } from './pages/StaffGovernancePage';
import { LogsPage } from './pages/LogsPage';
import { SpecialOperationsPage } from './pages/SpecialOperationsPage';
import AuditPage from './pages/AuditPage';
import DispatchRadarPage from './pages/DispatchRadarPage';
import { PricingPage } from './pages/PricingPage'; 
import { TransactionsPage } from './pages/TransactionsPage'; 
import { CivitasAdministrativePage } from './pages/CivitasAdministrativePage';
import { AdminTravelPage } from './pages/AdminTravelPage';
import { AdminEventsPage } from './pages/AdminEventsPage';
import { GamesPage } from './pages/GamesPage';
import ReportsPage from './pages/ReportsPage';
import { AdminAccessContext, canAccess, homeFor, type AdminAccess } from './lib/adminAccess';
import { loadAdminSession } from './lib/adminSession';
import AdminLayout from './components/AdminLayout';
import StaffPasswordPage from './pages/StaffPasswordPage';

function Denied({ message = 'Access denied. This section is not assigned to your staff account.' }: { message?: string }) {
  return (
    <AdminLayout title="Access Denied">
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800 font-medium">{message}</div>
    </AdminLayout>
  );
}

function Gate({ access, section, children }: { access: AdminAccess; section: string; children: React.ReactNode }) {
  return canAccess(access, section) ? <>{children}</> : <Denied />;
}

function Console({ session, recovery, onRecoveryDone }: any) {
  const [access, setAccess] = useState<AdminAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    loadAdminSession(supabase, session)
      .then(row => setAccess(row))
      .catch(() => setAccess(null))
      .finally(() => setLoading(false));
  }, [session.user.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 p-8 space-y-6 animate-pulse">
        <div className="h-16 bg-slate-900 rounded-2xl w-full"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="h-28 bg-slate-900 rounded-2xl"></div>
          <div className="h-28 bg-slate-900 rounded-2xl"></div>
          <div className="h-28 bg-slate-900 rounded-2xl"></div>
          <div className="h-28 bg-slate-900 rounded-2xl"></div>
        </div>
        <div className="h-96 bg-slate-900 rounded-3xl"></div>
      </div>
    );
  }

  return (
    <AdminAccessContext.Provider value={access}>
      {!access?.is_active ? (
        <Denied message="Access denied. An active Admin staff assignment is required." />
      ) : recovery || access.requires_password_setup || location.pathname === '/accept-invite' ? (
        <StaffPasswordPage userId={session.user.id} mode={recovery ? 'recovery' : 'invite'} onComplete={onRecoveryDone} />
      ) : (
        <Routes>
          <Route path="/" element={<Navigate to={homeFor(access)} replace />} />
          <Route path="/dashboard" element={<Gate access={access} section="dashboard"><DashboardPage /></Gate>} />
          <Route path="/dispatch" element={<Gate access={access} section="dispatch"><DispatchRadarPage /></Gate>} />
          <Route path="/travel" element={<Gate access={access} section="travel"><AdminTravelPage /></Gate>} />
          <Route path="/events" element={<Gate access={access} section="events"><AdminEventsPage /></Gate>} />
          <Route path="/games" element={<Gate access={access} section="games"><GamesPage /></Gate>} />
          <Route path="/pricing" element={<Gate access={access} section="pricing"><PricingPage /></Gate>} />
          <Route path="/kyc" element={<Gate access={access} section="kyc"><KycPage /></Gate>} />
          <Route path="/civitas" element={<Gate access={access} section="financials"><CivitasAdministrativePage /></Gate>} />
          <Route path="/financials" element={<Gate access={access} section="financials"><FinancialsPage /></Gate>} />
          <Route path="/transactions" element={<Gate access={access} section="transactions"><TransactionsPage /></Gate>} />
          <Route path="/payouts" element={<Gate access={access} section="payouts"><PayoutsPage /></Gate>} />
          <Route path="/customers" element={<Gate access={access} section="customers"><UsersPage /></Gate>} />
          <Route path="/staff" element={<Gate access={access} section="staff"><StaffGovernancePage /></Gate>} />
          <Route path="/special" element={<Gate access={access} section="special"><SpecialOperationsPage /></Gate>} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/logs" element={<Gate access={access} section="logs"><LogsPage /></Gate>} />
          <Route path="/audit" element={<Gate access={access} section="logs"><AuditPage /></Gate>} />
          <Route path="*" element={<Denied />} />
        </Routes>
      )}
    </AdminAccessContext.Provider>
  );
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex flex-col gap-4 animate-pulse">
        <div className="h-12 bg-slate-900 rounded-xl w-48"></div>
        <div className="h-64 bg-slate-900 rounded-3xl mt-12"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      {session ? <Console session={session} recovery={false} onRecoveryDone={() => window.location.assign('/')} /> : <LoginPage />}
    </BrowserRouter>
  );
}