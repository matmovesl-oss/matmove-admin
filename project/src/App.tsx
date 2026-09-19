import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';

import { ComplianceDashboard } from './pages/ComplianceDashboard';
import { KycPage } from './pages/KycPage';
import { FinancialsPage } from './pages/FinancialsPage';
import { PayoutsPage } from './pages/PayoutsPage';
import UsersPage from './pages/UsersPage'; // Updated import
import { LogsPage } from './pages/LogsPage';

import WalletsPage from './pages/WalletsPage';
import WithdrawalsPage from './pages/WithdrawalsPage';
import AuditPage from './pages/AuditPage';
import DispatchRadarPage from './pages/DispatchRadarPage'; // New Dispatch Page

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          {/* Main dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<ComplianceDashboard />} />
          
          {/* Dispatch Control Room */}
          <Route path="/dispatch" element={<DispatchRadarPage />} />

          {/* KYC & onboarding */}
          <Route path="/kyc" element={<KycPage />} />

          {/* Financial & wallets */}
          <Route path="/wallets" element={<WalletsPage />} />

          {/* Payouts & withdrawals */}
          <Route path="/withdrawals" element={<WithdrawalsPage />} />

          {/* User & staff governance */}
          <Route path="/users" element={<UsersPage />} />

          {/* System & audit logs */}
          <Route path="/audit" element={<AuditPage />} />

          {/* Existing legacy routes */}
          <Route path="/financials" element={<FinancialsPage />} />
          <Route path="/payouts" element={<PayoutsPage />} />
          <Route path="/staff" element={<UsersPage />} />
          <Route path="/logs" element={<LogsPage />} />
        </Route>

        {/* Unknown routes */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}