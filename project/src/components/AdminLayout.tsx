import { useState, type ReactNode } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

interface AdminLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export default function AdminLayout({ title, subtitle, children }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-72">
        <Topbar onMenuClick={() => setSidebarOpen(true)} title={title} subtitle={subtitle} />
        <main className="px-4 sm:px-6 lg:px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
