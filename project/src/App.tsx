import { useState, useEffect, type ReactNode } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';

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
import { AdministrativePayrollPage } from './pages/AdministrativePayrollPage';
import { ConciergeAdminPage } from './pages/ConciergeAdminPage';
import AuditPage from './pages/AuditPage';
import DispatchRadarPage from './pages/DispatchRadarPage';
import { PricingPage } from './pages/PricingPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { CivitasAdministrativePage } from './pages/CivitasAdministrativePage';
import { AdminTravelPage } from './pages/AdminTravelPage';
import { AdminEventsPage } from './pages/AdminEventsPage';
import { GamesPage } from './pages/GamesPage';
import ReportsPage from './pages/ReportsPage';
import NotificationsPage from './pages/NotificationsPage';

import {
  AdminAccessContext,
  canAccess,
  homeFor,
  sections,
  type AdminAccess,
} from './lib/adminAccess';

import { loadAdminSession } from './lib/adminSession';
import AdminLayout from './components/AdminLayout';
import StaffPasswordPage from './pages/StaffPasswordPage';

// MAIN MATMOVE SUPER WEB ADMIN
const SUPER_ADMIN_EMAIL = 'matmove.sl@gmail.com';

const isSuperAdmin = (session: any): boolean => {
  const email = session?.user?.email || '';
  return email.toLowerCase().trim() === SUPER_ADMIN_EMAIL;
};

function Denied({
  message = 'Access denied. This section is not assigned to your staff account.',
}: {
  message?: string;
}) {
  return (
    <AdminLayout title="Access Denied">
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 font-medium text-rose-800">
        {message}
      </div>
    </AdminLayout>
  );
}

// CENTRAL ADMIN PERMISSION GATE
function Gate({
  access,
  session,
  section,
  children,
}: {
  access: AdminAccess | null;
  session: any;
  section: string;
  children: ReactNode;
}) {
  if (isSuperAdmin(session)) {
    return <>{children}</>;
  }

  return canAccess(access, section) ? (
    <>{children}</>
  ) : (
    <Denied />
  );
}

function Console({
  session,
  recovery,
  onRecoveryDone,
}: {
  session: any;
  recovery: boolean;
  onRecoveryDone: () => void;
}) {
  const [access, setAccess] = useState<AdminAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    // The main owner does not depend on a staff assignment.
    if (isSuperAdmin(session)) {
      setAccess(null);
      setLoading(false);

      return () => {
        mounted = false;
      };
    }

    setLoading(true);

    loadAdminSession(supabase, session)
      .then((row) => {
        if (mounted) setAccess(row);
      })
      .catch((error) => {
        console.error('Admin session loading failed:', error);
        if (mounted) setAccess(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [session.user.id, session.user.email]);

  if (loading) {
    return (
      <div className="min-h-screen animate-pulse space-y-6 bg-slate-950 p-8">
        <div className="h-16 w-full rounded-2xl bg-slate-900" />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-28 rounded-2xl bg-slate-900" />
          ))}
        </div>

        <div className="h-96 rounded-3xl bg-slate-900" />
      </div>
    );
  }

  const superAdmin = isSuperAdmin(session);

  // Full owner access for the designated main web administrator.
  const providedAccess: AdminAccess | null = superAdmin
    ? {
        id: session.user.id,
        full_name: 'MatMove Main Super Admin',
        email: session.user.email,
        department: 'Executive',
        permissions: sections.map(([key]) => key),
        is_owner: true,
        is_active: true,
        role: 'owner',
      }
    : access;

  return (
    <AdminAccessContext.Provider value={providedAccess}>
      {!superAdmin && !access?.is_active ? (
        <Denied message="Access denied. An active Admin staff assignment is required." />
      ) : recovery ||
        access?.requires_password_setup ||
        location.pathname === '/accept-invite' ? (
        <StaffPasswordPage
          userId={session.user.id}
          mode={recovery ? 'recovery' : 'invite'}
          onComplete={onRecoveryDone}
        />
      ) : (
        <Routes>
          <Route
            path="/"
            element={
              <Navigate
                to={superAdmin ? '/dashboard' : homeFor(access)}
                replace
              />
            }
          />

          <Route
            path="/dashboard"
            element={
              <Gate access={access} session={session} section="dashboard">
                <DashboardPage />
              </Gate>
            }
          />

          <Route
            path="/dispatch"
            element={
              <Gate access={access} session={session} section="dispatch">
                <DispatchRadarPage />
              </Gate>
            }
          />

          <Route
            path="/travel"
            element={
              <Gate access={access} session={session} section="travel">
                <AdminTravelPage />
              </Gate>
            }
          />

          <Route
            path="/events"
            element={
              <Gate access={access} session={session} section="events">
                <AdminEventsPage />
              </Gate>
            }
          />

          <Route
            path="/games"
            element={
              <Gate access={access} session={session} section="games">
                <GamesPage />
              </Gate>
            }
          />

          <Route
            path="/pricing"
            element={
              <Gate access={access} session={session} section="pricing">
                <PricingPage />
              </Gate>
            }
          />

          <Route
            path="/kyc"
            element={
              <Gate access={access} session={session} section="kyc">
                <KycPage />
              </Gate>
            }
          />

          <Route
            path="/customers"
            element={
              <Gate access={access} session={session} section="customers">
                <UsersPage />
              </Gate>
            }
          />

          <Route
            path="/civitas"
            element={
              <Gate access={access} session={session} section="financials">
                <CivitasAdministrativePage />
              </Gate>
            }
          />

          <Route
            path="/financials"
            element={
              <Gate access={access} session={session} section="financials">
                <FinancialsPage />
              </Gate>
            }
          />

          <Route
            path="/transactions"
            element={
              <Gate access={access} session={session} section="transactions">
                <TransactionsPage />
              </Gate>
            }
          />

          <Route
            path="/payouts"
            element={
              <Gate access={access} session={session} section="payouts">
                <PayoutsPage />
              </Gate>
            }
          />

          <Route
            path="/notifications"
            element={
              <Gate access={access} session={session} section="notifications">
                <NotificationsPage />
              </Gate>
            }
          />

          <Route
            path="/staff"
            element={
              <Gate access={access} session={session} section="staff">
                <StaffGovernancePage />
              </Gate>
            }
          />

          <Route
            path="/special"
            element={
              <Gate access={access} session={session} section="special">
                <SpecialOperationsPage />
              </Gate>
            }
          />

          <Route
            path="/payroll"
            element={
              <Gate access={access} session={session} section="special">
                <AdministrativePayrollPage />
              </Gate>
            }
          />

          <Route
            path="/concierge"
            element={
              <Gate access={access} session={session} section="special">
                <ConciergeAdminPage />
              </Gate>
            }
          />

          <Route
            path="/reports"
            element={superAdmin ? <ReportsPage /> : <Denied />}
          />

          <Route
            path="/logs"
            element={
              <Gate access={access} session={session} section="logs">
                <LogsPage />
              </Gate>
            }
          />

          <Route
            path="/audit"
            element={
              <Gate access={access} session={session} section="logs">
                <AuditPage />
              </Gate>
            }
          />

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
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        if (mounted) setSession(data.session);
      })
      .catch((error) => {
        console.error('Authentication session error:', error);
        if (mounted) setSession(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen animate-pulse flex-col gap-4 bg-slate-950 p-6">
        <div className="h-12 w-48 rounded-xl bg-slate-900" />
        <div className="mt-12 h-64 rounded-3xl bg-slate-900" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      {session ? (
        <Console
          session={session}
          recovery={false}
          onRecoveryDone={() => window.location.assign('/')}
        />
      ) : (
        <LoginPage />
      )}
    </BrowserRouter>
  );
}