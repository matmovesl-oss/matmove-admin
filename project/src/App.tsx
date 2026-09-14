import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ComplianceDashboard } from './pages/ComplianceDashboard';
import { KycPage } from './pages/KycPage';
import { FinancialsPage } from './pages/FinancialsPage';
import { PayoutsPage } from './pages/PayoutsPage';
import { UsersPage } from './pages/UsersPage';
import { LogsPage } from './pages/LogsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<ComplianceDashboard />} />
          <Route path="/kyc" element={<KycPage />} />
          <Route path="/financials" element={<FinancialsPage />} />
          <Route path="/payouts" element={<PayoutsPage />} />
          <Route path="/staff" element={<UsersPage />} />
          <Route path="/logs" element={<LogsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}