import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { Loader2 } from 'lucide-react';

// Import all your pages
import LoginPage from './pages/LoginPage';
import { ComplianceDashboard } from './pages/ComplianceDashboard';
import DispatchRadarPage from './pages/DispatchRadarPage';
import { KycPage } from './pages/KycPage';
import { FinancialsPage } from './pages/FinancialsPage';
import { PayoutsPage } from './pages/PayoutsPage';
import UsersPage from './pages/UsersPage';
import { StaffGovernancePage } from './pages/StaffGovernancePage';
import { LogsPage } from './pages/LogsPage';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsInitializing(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isInitializing) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="animate-spin text-indigo-500" size={48} />
      </div>
    );
  }

  // FORCE LOGIN: If no session exists, ONLY show the Login page
  if (!session) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // AUTHORIZED: Admin is logged in, show the full dashboard
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<ComplianceDashboard />} />
        <Route path="/dispatch" element={<DispatchRadarPage />} />
        <Route path="/kyc" element={<KycPage />} />
        <Route path="/wallets" element={<FinancialsPage />} />
        <Route path="/withdrawals" element={<PayoutsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/staff" element={<StaffGovernancePage />} />
        <Route path="/audit" element={<LogsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}