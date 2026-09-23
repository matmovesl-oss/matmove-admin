import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';

import { ComplianceDashboard } from './pages/ComplianceDashboard';
import { KycPage } from './pages/KycPage';
import { FinancialsPage } from './pages/FinancialsPage';
import { PayoutsPage } from './pages/PayoutsPage';
import UsersPage from './pages/UsersPage'; 
import { StaffGovernancePage } from './pages/StaffGovernancePage'; // Enforces the Staff Page split
import { LogsPage } from './pages/LogsPage';

import WalletsPage from './pages/WalletsPage';
import WithdrawalsPage from './pages/WithdrawalsPage';
import AuditPage from './pages/AuditPage';
import DispatchRadarPage from './pages/DispatchRadarPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<ComplianceDashboard />} />
          <Route path="/dispatch" element={<DispatchRadarPage />} />
          <Route path="/kyc" element={<KycPage />} />
          <Route path="/wallets" element={<WalletsPage />} />
          <Route path="/withdrawals" element={<WithdrawalsPage />} />
          
          {/* SECURE SEPARATION */}
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