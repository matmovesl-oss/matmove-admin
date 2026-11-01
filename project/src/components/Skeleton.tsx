import type { ReactNode } from 'react';

export function SkeletonBlock({ className = '', rounded = 'rounded-xl' }: { className?: string; rounded?: string }) {
  return <div aria-hidden="true" className={`animate-pulse bg-slate-200 ${rounded} ${className}`} />;
}

export function AdminCardsSkeleton({ count = 4 }: { count?: number }) {
  return <div role="status" aria-label="Loading records" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {Array.from({ length: count }, (_, index) => <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5">
      <SkeletonBlock className="mb-4 h-3 w-2/5" rounded="rounded-md" /><SkeletonBlock className="mb-3 h-8 w-1/2" /><SkeletonBlock className="h-3 w-3/4" rounded="rounded-md" />
    </div>)}
  </div>;
}

export function SkeletonGrid({ count = 3 }: { count?: number }) {
  return <div role="status" aria-label="Loading event cards" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {Array.from({ length: count }, (_, index) => <div key={index} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <SkeletonBlock className="h-40 w-full" rounded="rounded-none" />
      <div className="space-y-3 p-4"><SkeletonBlock className="h-4 w-3/4" /><SkeletonBlock className="h-3 w-full" /><SkeletonBlock className="h-3 w-2/3" /><SkeletonBlock className="h-8 w-2/5" /></div>
    </div>)}
  </div>;
}

export function AdminRowsSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return <div role="status" aria-label="Loading table" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="flex gap-4 border-b p-4">{Array.from({ length: columns }, (_, i) => <SkeletonBlock key={i} className="h-3 flex-1" rounded="rounded-md" />)}</div>
    {Array.from({ length: rows }, (_, r) => <div key={r} className="flex gap-4 border-b p-4 last:border-b-0">{Array.from({ length: columns }, (_, c) => <SkeletonBlock key={c} className={`h-4 flex-1 ${c === 0 ? 'max-w-36' : ''}`} rounded="rounded-md" />)}</div>)}
  </div>;
}

export function AdminPageSkeleton(): ReactNode {
  return <div role="status" aria-label="Loading admin workspace" className="space-y-6">
    <AdminCardsSkeleton count={4} />
    <AdminRowsSkeleton rows={5} columns={5} />
  </div>;
}
