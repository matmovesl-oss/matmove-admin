import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { Layout } from './components/Layout';
import LoginPage from './pages/LoginPage';

import DashboardPage from './pages/DashboardPage';
import { KycPage } from './pages/KycPage';
import { FinancialsPage } from './pages/FinancialsPage';
import { PayoutsPage } from './pages/PayoutsPage';
import UsersPage from './pages/UsersPage'; 
import { StaffGovernancePage } from './pages/StaffGovernancePage';
import { LogsPage } from './pages/LogsPage';

import WalletsPage from './pages/WalletsPage';
import WithdrawalsPage from './pages/WithdrawalsPage';
import AuditPage from './pages/AuditPage';
import DispatchRadarPage from './pages/DispatchRadarPage';
import { PricingPage } from './pages/PricingPage'; 

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check active session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // 2. Instantly catch login/logout events to trap or grant access
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // FORCE LOGIN: If no session exists, strictly lock the user to the Login Page
  if (!session) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // SECURE AUTHENTICATED ADMIN
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/dispatch" element={<DispatchRadarPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/kyc" element={<KycPage />} />
          <Route path="/wallets" element={<WalletsPage />} />
          <Route path="/withdrawals" element={<WithdrawalsPage />} />
          
          <Route path="/users" element={<UsersPage />} />
          <Route path="/staff" element={<StaffGovernancePage />} />
          <Route path="/audit" element={<AuditPage />} />

          {/* Legacy routes */}
          <Route path="/financials" element={<FinancialsPage />} />
          <Route path="/payouts" element={<PayoutsPage />} />
          <Route path="/logs" element={<LogsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}