import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { Layout } from './components/Layout';
import { AdminDashboard } from './pages/AdminDashboard';
import { ComplianceDashboard } from './pages/ComplianceDashboard';
import { FinancialsPage } from './pages/FinancialsPage';
import { PayoutsPage } from './pages/PayoutsPage';
import { StaffGovernancePage } from './pages/StaffGovernancePage';
import { LogsPage } from './pages/LogsPage'; // <-- New Import
import { ShieldCheck } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.auth.signInWithPassword({ email, password });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 font-sans">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 w-full max-w-md flex flex-col gap-5">
          <div className="flex flex-col items-center justify-center mb-2">
            <ShieldCheck size={48} className="text-[#0f172a] mb-3" />
            <h2 className="text-2xl font-bold text-slate-900">Admin Login</h2>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-slate-300 p-3 rounded-xl" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full border border-slate-300 p-3 rounded-xl" />
          </div>
          <button type="submit" className="bg-[#0f172a] text-white p-3 rounded-xl font-bold mt-2">Login</button>
        </form>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ComplianceDashboard />} />
          <Route path="kyc" element={<AdminDashboard />} />
          <Route path="financials" element={<FinancialsPage />} />
          <Route path="payouts" element={<PayoutsPage />} />
          <Route path="staff" element={<StaffGovernancePage />} />
          <Route path="logs" element={<LogsPage />} /> {/* <-- New Route */}
          <Route path="*" element={<div className="p-10 text-2xl font-bold text-slate-400">Module Under Construction</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}