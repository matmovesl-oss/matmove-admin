import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<ComplianceDashboard />} />
        <Route path="/kyc" element={<KycPage />} />
        <Route path="/financials" element={<FinancialsPage />} />
        <Route path="/payouts" element={<PayoutsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/logs" element={<LogsPage />} />
        {/* Fallback catches any broken links and sends them home safely */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}