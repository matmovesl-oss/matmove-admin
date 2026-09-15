import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: 'indigo' | 'emerald' | 'amber' | 'slate';
  hint?: string;
}

const toneMap = {
  indigo: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-600',
    ring: 'ring-indigo-100',
  },
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    ring: 'ring-emerald-100',
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    ring: 'ring-amber-100',
  },
  slate: {
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    ring: 'ring-slate-200',
  },
};

export default function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'indigo',
  hint,
}: StatCardProps) {
  // Safe fallback prevents the entire page from crashing
  // if an unexpected tone reaches this component at runtime.
  const t = toneMap[tone] ?? toneMap.indigo;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {label}
          </p>

          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {value}
          </p>

          {hint && (
            <p className="mt-1 text-xs text-slate-400">
              {hint}
            </p>
          )}
        </div>

        <div
          className={`w-11 h-11 rounded-xl ${t.bg} ${t.text} flex items-center justify-center ring-1 ${t.ring}`}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}