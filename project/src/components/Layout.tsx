import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, LogOut, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Sidebar from './Sidebar';

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [adminName, setAdminName] = useState<string>('Admin');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdminProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from('profiles')
          .select('role, full_name')
          .eq('id', user.id)
          .single();

        if (data) {
          setAdminRole(data.role); // e.g., 'super_admin', 'admin_finance', etc.
          setAdminName(data.full_name || 'Admin');
        }
      } catch (err) {
        console.error('Failed to fetch admin role', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAdminProfile();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>;
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden relative">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} adminRole={adminRole} adminName={adminName} />
      
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden lg:ml-72 h-screen">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 lg:hidden">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
              <Menu size={20} />
            </button>
            <h1 className="text-lg font-bold text-slate-900">MatMove Admin</h1>
          </div>
          <button onClick={handleLogout} className="text-slate-500 hover:text-red-600 transition">
            <LogOut size={20} />
          </button>
        </header>
        
        <div className="flex-1 overflow-auto relative bg-slate-50">
          <Outlet />
        </div>
      </main>
    </div>
  );
}