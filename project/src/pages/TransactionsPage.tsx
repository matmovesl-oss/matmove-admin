
import {exportCsv, providerAmount} from '@/lib/csvExport';
import {useAdminAccess,canAccess} from '@/lib/adminAccess';

import {adminFetch} from '@/lib/adminFetch';
import { useState, useEffect, useRef, useCallback } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { Search, RefreshCw, Loader2, ArrowUpRight, ArrowDownLeft, Activity } from 'lucide-react';

export function TransactionsPage() {
  const access=useAdminAccess();
  const [exporting,setExporting]=useState(false);
  const [exportError,setExportError]=useState('');
  const [exportNotice,setExportNotice]=useState('');
  const exportBusy=useRef(false);

  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'credit' | 'debit'>('all');
  const [reviewEvents, setReviewEvents] = useState<any[]>([]);
  const [reviewAvailable, setReviewAvailable] = useState(false);
  const [reviewQueueError, setReviewQueueError] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string,string>>({});
  const [reviewingEventId, setReviewingEventId] = useState('');
  const [reviewActionError, setReviewActionError] = useState('');
  const [reviewNotice, setReviewNotice] = useState('');
  const reviewLock = useRef(false);

  const mounted = useRef(false), generation = useRef(0);
  const fetchTransactions = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true); setLoadError('');
    try {
      const response = await adminFetch('/api/get-all-transactions');
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.transactions)) throw new Error(data.error || 'Could not load gateway transactions.');
      if (mounted.current && token === generation.current) {
        setTransactions(data.transactions);
        setReviewAvailable(data.webhookReviewAvailable === true);
        setReviewEvents(Array.isArray(data.webhookReviewEvents) ? data.webhookReviewEvents : []);
        setReviewQueueError(typeof data.webhookReviewError === 'string' ? data.webhookReviewError : '');
      }
    } catch (error: any) {
      if (mounted.current && token === generation.current) setLoadError(error.message || 'Could not load this section. Please retry.');
    } finally {
      if (mounted.current && token === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => { mounted.current = true; void fetchTransactions(); return () => { mounted.current = false; generation.current++; }; }, [fetchTransactions]);

  const filteredTxns = transactions.filter(tx => {
    const matchSearch = !search.trim() || 
      String(tx.id || '').toLowerCase().includes(search.toLowerCase()) ||
      String(tx.reference || '').toLowerCase().includes(search.toLowerCase()) ||
      String(tx.financialAccount?.id || '').toLowerCase().includes(search.toLowerCase());
    
    const matchType = filterType === 'all' || String(tx.type || tx.balanceImpact || '').toLowerCase() === filterType;
    return matchSearch && matchType;
  });

  async function downloadDisplayed() {
    if(exportBusy.current||loading||loadError||!canAccess(access,'transactions'))return;
    exportBusy.current=true;setExporting(true);setExportError('');setExportNotice('');
    try{
      const count=await exportCsv({userId:access!.id,section:'transactions',filename:'matmove-transactions',rows:[...filteredTxns],columns:[
        {label:'Transaction ID',value:(row:any)=>row.id},
        {label:'Direction',value:(row:any)=>row.type||row.balanceImpact},
        {label:'Wallet account ID',value:(row:any)=>row.financialAccount?.id||row.financialAccountId},
        {label:'Currency',value:(row:any)=>row.amount?.currency},
        {label:'Amount',value:(row:any)=>providerAmount(row.amount)},
        {label:'Reference',value:(row:any)=>row.reference},
        {label:'Created at',value:(row:any)=>row.timestamp||row.createdAt||row.createTime||row.created_at},
      ]});
      setExportNotice(`Downloaded ${count} displayed records.`);
    }catch(error:any){setExportError(error.message||'CSV export failed.');}
    finally{exportBusy.current=false;setExporting(false);}
  }

  async function markWebhookReviewed(eventId:string) {
    const note=(reviewNotes[eventId]||'').trim();
    if(reviewLock.current||!reviewAvailable||!canAccess(access,'transactions')||note.length<3||note.length>1000)return;
    reviewLock.current=true;setReviewingEventId(eventId);setReviewActionError('');setReviewNotice('');
    try {
      const response=await adminFetch('/api/get-all-transactions',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'mark-webhook-reviewed',eventId,note})
      });
      const result=await response.json().catch(()=>null);
      if(!response.ok||result?.success!==true||result?.eventId!==eventId||result?.reviewState!=='reviewed') {
        throw new Error(result?.error||'Review state was not confirmed.');
      }
      setReviewEvents(current=>current.filter(item=>item.event_id!==eventId));
      setReviewNotes(current=>{const next={...current};delete next[eventId];return next;});
      setReviewNotice('Review note saved. No wallet, payout or payment balance was changed.');
    } catch(error:any) {
      setReviewActionError(error.message||'The review note could not be saved.');
    } finally {
      reviewLock.current=false;setReviewingEventId('');
    }
  }

  return (
    <AdminLayout title="Gateway Transactions" subtitle="Master audit trail of all Monime ledger movements across all wallets">
      <section aria-label="CSV export" className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
        <div><p className="text-sm font-bold">Export displayed records</p><p className="text-xs text-slate-600">Exports the currently loaded records matching your filters. Gateway results are a limited batch, not the complete payment history.</p></div>
        <button type="button" onClick={()=>void downloadDisplayed()} disabled={exporting||loading||!!loadError||!filteredTxns.length||!canAccess(access,'transactions')} className="min-h-11 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{exporting?'Exporting…':'Export displayed CSV'}</button>
        {exportError&&<p role="alert" className="w-full text-sm text-red-800">{exportError}</p>}
        {exportNotice&&<p role="status" className="w-full text-sm text-emerald-800">{exportNotice}</p>}
      </section>
      <section aria-label="Monime webhook manual review queue" className="my-5 space-y-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Monime webhook events — manual review</h2>
            <p className="mt-1 max-w-3xl text-xs text-slate-600">Signed events that could not be safely reconciled are held here. Reviewing records an audit note only; it does not credit a wallet, issue a refund, or settle a payout.</p>
          </div>
          <button type="button" onClick={()=>void fetchTransactions()} disabled={loading||!canAccess(access,'transactions')} className="min-h-10 rounded-lg border bg-white px-3 text-xs font-bold text-slate-700 disabled:opacity-50">Refresh queue</button>
        </div>
        {reviewQueueError&&<p role="status" className="rounded-lg border border-amber-200 bg-white p-3 text-xs text-amber-900">{reviewQueueError}</p>}
        {!reviewAvailable ? (
          <p className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">The private review queue is not available in this backend yet. Apply the review-queue migration before enabling staff review.</p>
        ) : reviewEvents.length===0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">No unreviewed webhook events are currently waiting for staff review.</p>
        ) : (
          <div className="space-y-3">
            {reviewEvents.map((event:any)=>(
              <article key={event.event_id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{event.event_type}</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-slate-600">{event.event_id}</p>
                  </div>
                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-900">Manual review</span>
                </div>
                <dl className="grid gap-2 text-xs sm:grid-cols-3">
                  <div><dt className="text-slate-500">Provider object</dt><dd className="mt-1 break-all font-mono text-slate-800">{event.object_type}: {event.object_id}</dd></div>
                  <div><dt className="text-slate-500">Attempts</dt><dd className="mt-1 font-semibold text-slate-800">{event.attempts}</dd></div>
                  <div><dt className="text-slate-500">Received</dt><dd className="mt-1 text-slate-800">{event.received_at&&Number.isFinite(Date.parse(event.received_at))?new Date(event.received_at).toLocaleString():'Time unavailable'}</dd></div>
                </dl>
                <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{event.last_error||'Provider event requires reconciliation.'}</p>
                <label className="block text-xs font-semibold text-slate-700">
                  Review note (3–1000 characters)
                  <textarea rows={2} maxLength={1000} value={reviewNotes[event.event_id]||''} onChange={e=>setReviewNotes(current=>({...current,[event.event_id]:e.target.value}))} disabled={reviewingEventId===event.event_id} placeholder="Record the investigation result or next support action. Do not state that funds were settled unless separately verified." className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"/>
                </label>
                <button type="button" onClick={()=>void markWebhookReviewed(event.event_id)} disabled={reviewingEventId===event.event_id||(reviewNotes[event.event_id]||'').trim().length<3||!canAccess(access,'transactions')} className="min-h-10 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{reviewingEventId===event.event_id?'Saving review…':'Mark reviewed (no funds moved)'}</button>
              </article>
            ))}
          </div>
        )}
        {reviewActionError&&<p role="alert" className="rounded-lg border border-red-200 bg-white p-3 text-xs text-red-800">{reviewActionError}</p>}
        {reviewNotice&&<p role="status" className="rounded-lg border border-emerald-200 bg-white p-3 text-xs text-emerald-800">{reviewNotice}</p>}
      </section>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 mt-6">
        <div className="flex flex-1 flex-wrap gap-3 w-full max-w-xl">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by Wallet ID (fac-...), Txn ID, or Reference..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-600 outline-none shadow-sm font-mono" 
            />
          </div>
          <select 
            value={filterType} 
            onChange={(e: any) => setFilterType(e.target.value)} 
            className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm cursor-pointer"
          >
            <option value="all">All Movements</option>
            <option value="credit">Credits (+)</option>
            <option value="debit">Debits (-)</option>
          </select>
        </div>
        <button onClick={fetchTransactions} disabled={loading} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-bold shadow-sm">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh Ledger
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <Loader2 className="animate-spin mx-auto mb-2 text-indigo-600" size={28} /> Fetching Gateway Ledger...
          </div>
        ) : loadError ? (
          <div role="alert" className="p-6 text-sm text-red-800">{loadError}<button type="button" onClick={() => void fetchTransactions()} className="ml-2 min-h-11 font-bold underline">Retry transactions</button></div>
        ) : filteredTxns.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Activity size={40} className="mx-auto mb-3 text-slate-300" />
            No transactions found matching your search criteria.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[650px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Txn ID</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Wallet Account ID</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Reference</th>
                  <th className="px-6 py-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTxns.map((tx) => {
                  const amt = Number.isSafeInteger(tx.amount?.value) ? tx.amount.value / 100 : null;
                  const direction = String(tx.type || tx.balanceImpact || '').toLowerCase();
                  const isCredit = direction === 'credit';
                  const isDebit = direction === 'debit';
                  const stamp = tx.timestamp || tx.createdAt || tx.createTime || tx.created_at;
                  const accountId = tx.financialAccount?.id || '—';

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4 font-mono text-xs font-bold text-slate-700">{tx.id}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase border ${isCredit ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : isDebit ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                          {isCredit ? <ArrowDownLeft size={12}/> : isDebit ? <ArrowUpRight size={12}/> : <Activity size={12}/>} 
                          {direction || 'Direction not supplied'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-indigo-600 bg-indigo-50/50 px-2.5 py-1 rounded-lg w-fit border border-indigo-100">{accountId}</td>
                      <td className={`px-6 py-4 font-bold text-base ${isCredit ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {amt === null ? 'Amount not supplied' : `${isCredit ? '+' : isDebit ? '−' : ''} ${tx.amount?.currency || 'Currency not supplied'} ${amt.toFixed(2)}`}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">{tx.reference || 'N/A'}</td>
                      <td className="px-6 py-4 text-right text-xs text-slate-500">{stamp && Number.isFinite(Date.parse(stamp)) ? new Date(stamp).toLocaleString() : 'Time not supplied'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
