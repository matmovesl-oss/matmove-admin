import { useMemo } from 'react';
import AdminLayout from '@/components/AdminLayout';
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import Spinner from '@/components/Spinner';
import EmptyState from '@/components/EmptyState';
import { useAuditLogs } from '@/lib/hooks';
import { formatDate, timeAgo } from '@/lib/format';
import type { RiskLevel } from '@/lib/types';
import { ScrollText, ShieldAlert, ShieldCheck, Activity, AlertTriangle } from 'lucide-react';

const riskTone: Record<RiskLevel, 'red' | 'amber' | 'slate'> = {
  high: 'red',
  medium: 'amber',
  low: 'slate',
};

const riskDot: Record<RiskLevel, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-slate-400',
};

export default function AuditPage() {
  const { audit, fraud, loading } = useAuditLogs();

  const riskCounts = useMemo(() => ({
    high: fraud.filter((f) => f.risk_level === 'high').length,
    medium: fraud.filter((f) => f.risk_level === 'medium').length,
    low: fraud.filter((f) => f.risk_level === 'low').length,
  }), [fraud]);

  return (
    <AdminLayout
      title="System & Audit Logs"
      subtitle="Real-time audit trail and fraud monitoring"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Audit Events" value={String(audit.length)} icon={Activity} tone="indigo" />
        <StatCard label="High Risk" value={String(riskCounts.high)} icon={ShieldAlert} tone="amber" />
        <StatCard label="Medium Risk" value={String(riskCounts.medium)} icon={AlertTriangle} tone="indigo" />
        <StatCard label="Low Risk" value={String(riskCounts.low)} icon={ShieldCheck} tone="emerald" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-slate-500" /> Audit Trail
            </h3>
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
            </span>
          </div>
          {loading ? (
            <Spinner label="Loading audit logs..." />
          ) : audit.length === 0 ? (
            <EmptyState icon={ScrollText} title="No audit events" />
          ) : (
            <div className="overflow-y-auto max-h-[560px] divide-y divide-slate-100">
              {audit.map((log) => (
                <div key={log.id} className="px-5 py-3 hover:bg-slate-50 flex items-start gap-3">
                  <div className="mt-1 w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-900">{log.actor_name}</span>
                      <Badge tone="slate" size="sm">{log.action}</Badge>
                      <span className="text-xs text-slate-400">on</span>
                      <code className="text-xs text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{log.table_name}</code>
                    </div>
                    {Object.keys(log.metadata).length > 0 && (
                      <p className="mt-1 text-xs text-slate-500 font-mono truncate">
                        {JSON.stringify(log.metadata)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{timeAgo(log.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" /> Fraud Activity
            </h3>
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
            </span>
          </div>
          {loading ? (
            <Spinner label="Loading fraud logs..." />
          ) : fraud.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="No fraud alerts" />
          ) : (
            <div className="overflow-y-auto max-h-[560px] divide-y divide-slate-100">
              {fraud.map((f) => (
                <div key={f.id} className="px-5 py-3 hover:bg-slate-50 flex items-start gap-3">
                  <div className={`mt-1.5 w-2.5 h-2.5 rounded-full ${riskDot[f.risk_level]} shrink-0`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-900">{f.actor_name}</span>
                      <Badge tone={riskTone[f.risk_level]} size="sm" className="capitalize">{f.risk_level} risk</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-700">{f.activity_type}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{f.description}</p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{formatDate(f.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
