interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export default function EmptyState({ title, description, icon: Icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
          <Icon className="w-6 h-6" />
        </div>
      )}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-400 max-w-sm">{description}</p>}
    </div>
  );
}
