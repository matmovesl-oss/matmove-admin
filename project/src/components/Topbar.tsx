import { Menu, Bell, Search } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase';

interface TopbarProps {
  onMenuClick: () => void;
  title: string;
  subtitle?: string;
}

export default function Topbar({ onMenuClick, title, subtitle }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200">
      <div className="flex items-center gap-4 px-4 sm:px-6 lg:px-8 py-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden text-slate-600 hover:text-slate-900"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>

        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-semibold text-slate-900 truncate">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500 truncate">{subtitle}</p>}
        </div>

        <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 text-slate-500 w-64">
          <Search className="w-4 h-4" />
          <input
            placeholder="Search records..."
            className="bg-transparent outline-none text-sm w-full placeholder:text-slate-400"
          />
        </div>

        <div className="relative">
          <Bell className="w-6 h-6 text-slate-600" />
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
            3
          </span>
        </div>

        <span
          className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            isSupabaseConfigured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}
          title={isSupabaseConfigured ? 'Live database connected' : 'Using mock data'}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isSupabaseConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {isSupabaseConfigured ? 'Live' : 'Mock'}
        </span>
      </div>
    </header>
  );
}
