import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
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
import { TransactionsPage } from './pages/TransactionsPage'; 

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
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

  if (!session) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/dispatch" element={<DispatchRadarPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/kyc" element={<KycPage />} />
        <Route path="/financials" element={<FinancialsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/payouts" element={<PayoutsPage />} />
        <Route path="/customers" element={<UsersPage />} />
        <Route path="/staff" element={<StaffGovernancePage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/logs" element={<LogsPage />} />
        
        {/* Fallbacks */}
        <Route path="/wallets" element={<Navigate to="/financials" replace />} />
        <Route path="/withdrawals" element={<Navigate to="/payouts" replace />} />
        <Route path="/users" element={<Navigate to="/customers" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}