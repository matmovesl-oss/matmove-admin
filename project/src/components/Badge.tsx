interface BadgeProps {
  children: React.ReactNode;
  tone?: 'indigo' | 'emerald' | 'amber' | 'red' | 'slate' | 'blue';
  size?: 'sm' | 'md';
  className?: string;
}

const toneMap = {
  indigo: 'bg-indigo-100 text-indigo-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  slate: 'bg-slate-100 text-slate-600',
  blue: 'bg-blue-100 text-blue-700',
};

export default function Badge({ children, tone = 'slate', size = 'sm', className }: BadgeProps) {
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${toneMap[tone]} ${sizeClass} ${className || ''}`}>
      {children}
    </span>
  );
}
