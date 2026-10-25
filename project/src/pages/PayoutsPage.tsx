
import {exportCsv, providerAmount} from '@/lib/csvExport';
import {useAdminAccess,canAccess} from '@/lib/adminAccess';

import {adminFetch} from '@/lib/adminFetch';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import AdminLayout from '@/components/AdminLayout';
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import { Banknote, Clock, CheckCircle2, XCircle, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';

export function PayoutsPage() {
  const access=useAdminAccess();
  const [exporting,setExporting]=useState(false);
  const [exportError,setExportError]=useState('');
  const [exportNotice,setExportNotice]=useState('');
  const exportBusy=useRef(false);

  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'failed'>('all');

  const mounted = useRef(false), generation = useRef(0);
  const fetchRealPayouts = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true); setApiError('');
    try {
      const response = await adminFetch('/api/get-payouts');
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.payouts)) throw new Error(data.error || 'Could not load gateway payouts.');
      if (mounted.current && token === generation.current) setPayouts([...data.payouts].sort((a: any,b: any) => Date.parse(b.createTime)-Date.parse(a.createTime)));
    } catch (error: any) {
      if (mounted.current && token === generation.current) setApiError(error.message || 'Could not load this section. Please retry.');
    } finally {
      if (mounted.current && token === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => { mounted.current = true; void fetchRealPayouts(); return () => { mounted.current = false; generation.current++; }; }, [fetchRealPayouts]);

  const stats = useMemo(() => {
    let pending = 0, completed = 0, failed = 0, pendingSle = 0, pendingSleKnown = true;
    payouts.forEach(p => {
      const amt = Number.isSafeInteger(p.amount?.value) ? p.amount.value / 100 : null;
      if (p.status === 'pending' || p.status === 'processing') { pending++; if (!p.amount?.currency || (p.amount.currency === 'SLE' && amt === null)) pendingSleKnown = false; if (p.amount?.currency === 'SLE' && amt !== null) pendingSle += amt; }
      else if (p.status === 'completed') completed++;
      else if (p.status === 'failed') failed++;
    });
    return { pending, completed, failed, pendingSle, pendingSleKnown };
  }, [payouts]);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return payouts;
    if (filter === 'pending') return payouts.filter(p => p.status === 'pending' || p.status === 'processing');
    return payouts.filter(p => p.status === filter);
  }, [payouts, filter]);

  async function downloadDisplayed() {
    if(exportBusy.current||loading||apiError||!canAccess(access,'payouts'))return;
    exportBusy.current=true;setExporting(true);setExportError('');setExportNotice('');
    try{
      const count=await exportCsv({userId:access!.id,section:'payouts',filename:'matmove-payouts',rows:[...filteredItems],columns:[
        {label:'Payout ID',value:(row:any)=>row.id},
        {label:'Provider',value:(row:any)=>row.destination?.providerId},
        {label:'Destination',value:(row:any)=>row.destination?.phoneNumber||row.destination?.accountNumber},
        {label:'Currency',value:(row:any)=>row.amount?.currency},
        {label:'Amount',value:(row:any)=>providerAmount(row.amount)},
        {label:'Status',value:(row:any)=>row.status},
        {label:'Failure reason',value:(row:any)=>row.failureDetail?.message},
        {label:'Created at',value:(row:any)=>row.createTime},
      ]});
      setExportNotice(`Downloaded ${count} displayed records.`);
    }catch(error:any){setExportError(error.message||'CSV export failed.');}
    finally{exportBusy.current=false;setExporting(false);}
  }

  return (
    <AdminLayout title="Payouts & Withdrawals" subtitle="Live payout status directly from Monime Gateway">
      <section aria-label="CSV export" className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
        <div><p className="text-sm font-bold">Export displayed records</p><p className="text-xs text-slate-600">Exports the currently loaded records matching your filters. Gateway results are a limited batch, not the complete payment history.</p></div>
        <button type="button" onClick={()=>void downloadDisplayed()} disabled={exporting||loading||!!apiError||!filteredItems.length||!canAccess(access,'payouts')} className="min-h-11 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{exporting?'Exporting…':'Export displayed CSV'}</button>
        {exportError&&<p role="alert" className="w-full text-sm text-red-800">{exportError}</p>}
        {exportNotice&&<p role="status" className="w-full text-sm text-emerald-800">{exportNotice}</p>}
      </section>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6 mt-6">
        <StatCard label="Loaded pending payouts" value={loading ? 'Loading…' : apiError ? 'Check connection' : String(stats.pending)} icon={Clock} tone="amber" />
        <StatCard label="Pending SLE" value={loading ? 'Loading…' : apiError ? 'Check connection' : !stats.pendingSleKnown ? 'Check payout amounts' : `SLE ${stats.pendingSle.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} icon={Banknote} tone="indigo" />
        <StatCard label="Loaded completed payouts" value={loading ? 'Loading…' : apiError ? 'Check connection' : String(stats.completed)} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Loaded failed payouts" value={loading ? 'Loading…' : apiError ? 'Check connection' : String(stats.failed)} icon={XCircle} tone="red" />
      </div>

      <div className="mb-4 bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap gap-3 justify-between items-center">
        <div className="flex flex-wrap gap-2">
          {(['all', 'pending', 'completed', 'failed'] as const).map(tab => (
            <button key={tab} onClick={() => setFilter(tab)} className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition ${filter === tab ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {tab}
            </button>
          ))}
        </div>
        <button onClick={fetchRealPayouts} disabled={loading} className="flex items-center gap-2 px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14} />} Refresh Live
        </button>
      </div>

      {apiError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-3">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          <div><p className="font-bold text-sm">Monime API Connection Failed</p><p className="text-xs mt-1">{apiError}</p></div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-600" /> Fetching from Monime...</div>
        ) : apiError ? (
          <p role="alert" className="p-6 text-red-800">Payouts could not be loaded.<button type="button" onClick={() => void fetchRealPayouts()} className="ml-2 min-h-11 font-bold underline">Retry payouts</button></p>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-500"><Banknote size={40} className="mx-auto mb-3 text-slate-300"/> No payouts found.</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
              <tr><th className="px-6 py-4">Transaction ID</th><th className="px-6 py-4">Provider</th><th className="px-6 py-4">Destination</th><th className="px-6 py-4">Amount</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Date</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map(p => {
                const amt = Number.isSafeInteger(p.amount?.value) ? p.amount.value / 100 : null;
                const statusTone = p.status === 'completed' ? 'emerald' : p.status === 'failed' ? 'red' : 'amber';
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{p.id}</td>
                    <td className="px-6 py-4 font-bold text-slate-900 uppercase">{p.destination?.providerId || 'MOMO'}</td>
                    <td className="px-6 py-4 font-mono text-slate-600">{p.destination?.phoneNumber || p.destination?.accountNumber || 'N/A'}</td>
                    <td className="px-6 py-4 font-bold text-slate-900">{p.amount?.currency || 'Currency not supplied'} {amt !== null ? amt.toFixed(2) : 'Amount not supplied'}</td>
                    <td className="px-6 py-4">
                      <Badge tone={statusTone}>{p.status}</Badge>
                      {p.status === 'failed' && p.failureDetail && <div className="text-[10px] text-red-500 mt-1">{p.failureDetail.message}</div>}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">{p.createTime && Number.isFinite(Date.parse(p.createTime)) ? new Date(p.createTime).toLocaleString() : 'Time not supplied'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}
