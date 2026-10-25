
import { useMemo,useState,useEffect,useRef,useCallback } from 'react';
import AdminLayout from '@/components/AdminLayout';
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import Spinner from '@/components/Spinner';
import EmptyState from '@/components/EmptyState';
import {supabase} from '@/lib/supabase';
import {useAdminAccess,canAccess} from '@/lib/adminAccess';
import { formatDate, timeAgo } from '@/lib/format';
import type { RiskLevel,AuditLog,FraudLog } from '@/lib/types';
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
  const access=useAdminAccess(),allowed=canAccess(access,'logs');
  const stamp=JSON.stringify([access?.id,allowed,access?.is_active,access?.permissions]);
  const current=useRef(stamp);current.current=stamp;
  const mounted=useRef(false),generation=useRef(0);
  const [audit,setAudit]=useState<AuditLog[]>([]),[fraud,setFraud]=useState<FraudLog[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[loadedStamp,setLoadedStamp]=useState('');
  const load=useCallback(async()=>{
    if(!allowed)return;
    const token=++generation.current;
    const valid=()=>mounted.current&&current.current===stamp&&generation.current===token;
    setLoading(true);setError('');setLoadedStamp(stamp);
    try{
      const [a,f]=await Promise.all([
        supabase.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(100),
        supabase.from('fraud_logs').select('*').order('created_at',{ascending:false}).limit(50),
      ]);
      if(a.error)throw a.error;if(f.error)throw f.error;
      if(!Array.isArray(a.data)||!Array.isArray(f.data))throw new Error('Audit response could not be verified.');
      if(valid()){setAudit(a.data as AuditLog[]);setFraud(f.data as FraudLog[]);}
    }catch(err:any){if(valid())setError(err.message||'Audit and fraud records could not be loaded.');}
    finally{if(valid())setLoading(false);}
  },[stamp,allowed]);
  useEffect(()=>{mounted.current=true;setAudit([]);setFraud([]);void load();return()=>{mounted.current=false;generation.current++;};},[load]);
  const waiting=loading||loadedStamp!==stamp;
  const count=(n:number)=>waiting?'Loading...':error?'Unavailable':String(n);

  const riskCounts = useMemo(() => ({
    high: fraud.filter((f) => f.risk_level === 'high').length,
    medium: fraud.filter((f) => f.risk_level === 'medium').length,
    low: fraud.filter((f) => f.risk_level === 'low').length,
  }), [fraud]);

  if(!allowed)return <AdminLayout title="System & Audit Logs"><p role="alert" className="p-6">Access denied.</p></AdminLayout>;

  return (
    <AdminLayout
      title="System & Audit Logs"
      subtitle="Latest 100 audit events and 50 fraud records. Use Reports for full history."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Loaded Audit Events" value={count(audit.length)} icon={Activity} tone="indigo" />
        <StatCard label="Loaded High Risk" value={count(riskCounts.high)} icon={ShieldAlert} tone="amber" />
        <StatCard label="Loaded Medium Risk" value={count(riskCounts.medium)} icon={AlertTriangle} tone="indigo" />
        <StatCard label="Loaded Low Risk" value={count(riskCounts.low)} icon={ShieldCheck} tone="emerald" />
      </div>

      <button type="button" disabled={waiting} onClick={()=>void load()} className="mb-4 min-h-11 rounded-lg border bg-white px-4 font-bold disabled:opacity-50">{waiting?'Loading audit records...':error?'Retry audit records':'Refresh audit records'}</button>
      {error&&<p role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-slate-500" /> Audit Trail
            </h3>
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              Latest records
            </span>
          </div>
          {waiting ? (
            <Spinner label="Loading audit logs..." />
          ) : error ? <p className="p-6">Audit records unavailable. Use Retry audit records.</p> : audit.length === 0 ? (
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
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
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
              Latest records
            </span>
          </div>
          {waiting ? (
            <Spinner label="Loading fraud logs..." />
          ) : error ? <p className="p-6">Fraud records unavailable. Use Retry audit records.</p> : fraud.length === 0 ? (
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
