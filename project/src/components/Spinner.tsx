interface SpinnerProps {
  label?: string;
}

export default function Spinner({ label }: SpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
      <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      {label && <p className="mt-3 text-sm">{label}</p>}
    </div>
  );
}
