
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

  const [reconciliation, setReconciliation] = useState<any | null>(null);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [reconciliationError, setReconciliationError] = useState('');

  const mounted = useRef(false), generation = useRef(0);
  const fetchTransactions = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true); setLoadError('');
    try {
      const response = await adminFetch('/api/get-all-transactions');
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.transactions)) throw new Error(data.error || 'Could not load gateway transactions.');
      if (mounted.current && token === generation.current) setTransactions(data.transactions);
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

  async function previewPendingTopups() {
    if (reconciliationLoading || !canAccess(access, 'transactions')) return;
    setReconciliationLoading(true);
    setReconciliationError('');
    try {
      const response = await adminFetch('/api/admin-reconcile-topups?limit=20');
      const body = await response.json();
      if (!response.ok || body?.readOnly !== true || !Array.isArray(body?.findings)) {
        throw new Error(body.error || 'Pending top-up reconciliation preview could not be verified.');
      }
      setReconciliation(body);
    } catch (error: any) {
      setReconciliation(null);
      setReconciliationError(error?.message || 'Pending top-up reconciliation preview failed. Retry safely.');
    } finally {
      setReconciliationLoading(false);
    }
  }

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

  return (
    <AdminLayout title="Gateway Transactions" subtitle="Master audit trail of all Monime ledger movements across all wallets">
      <section aria-label="CSV export" className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
        <div><p className="text-sm font-bold">Export displayed records</p><p className="text-xs text-slate-600">Exports the currently loaded records matching your filters. Gateway results are a limited batch, not the complete payment history.</p></div>
        <button type="button" onClick={()=>void downloadDisplayed()} disabled={exporting||loading||!!loadError||!filteredTxns.length||!canAccess(access,'transactions')} className="min-h-11 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{exporting?'Exporting…':'Export displayed CSV'}</button>
        {exportError&&<p role="alert" className="w-full text-sm text-red-800">{exportError}</p>}
        {exportNotice&&<p role="status" className="w-full text-sm text-emerald-800">{exportNotice}</p>}
      </section>
      <section aria-label="Pending top-up reconciliation" className="my-5 space-y-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-900">Pending wallet top-up reconciliation</p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
              Read-only preview of pending Monime Checkout Sessions. This checks provider status, wallet identity,
              currency and amount; it does not credit wallets or change payment records.
            </p>
          </div>
          <button type="button" onClick={() => void previewPendingTopups()} disabled={reconciliationLoading || !canAccess(access, 'transactions')}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">
            <RefreshCw size={14} className={reconciliationLoading ? 'animate-spin' : ''} />
            {reconciliationLoading ? 'Checking provider…' : 'Preview pending top-ups'}
          </button>
        </div>
        {reconciliationError && <p role="alert" className="rounded-xl border border-rose-200 bg-white p-3 text-xs text-rose-800">{reconciliationError}</p>}
        {reconciliation && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <span>{reconciliation.checked} checked</span>
              <span>·</span>
              <span>Read-only — {reconciliation.updatesApplied} updates applied</span>
              <span>·</span>
              <span>{reconciliation.generatedAt && Number.isFinite(Date.parse(reconciliation.generatedAt)) ? new Date(reconciliation.generatedAt).toLocaleString() : 'Time unavailable'}</span>
            </div>
            {!reconciliation.findings.length ? (
              <p className="rounded-xl bg-white p-4 text-xs text-slate-600">No pending Monime top-ups were returned for this preview.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-amber-100 bg-white">
                <table className="w-full min-w-[850px] text-left text-xs">
                  <thead className="bg-slate-100 uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="p-3">Payment / checkout reference</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Local / provider</th>
                      <th className="p-3">Identity</th>
                      <th className="p-3">Amount check</th>
                      <th className="p-3">Settlement target</th>
                      <th className="p-3">Finding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reconciliation.findings.map((item: any) => (
                      <tr key={item.paymentTransactionId || item.providerReference}>
                        <td className="p-3">
                          <p className="font-mono text-slate-800">{String(item.paymentTransactionId || '—').slice(0, 12)}</p>
                          <p className="mt-1 font-mono text-[10px] text-slate-500">{item.providerReference || 'No provider reference'}</p>
                        </td>
                        <td className="whitespace-nowrap p-3 font-bold text-slate-900">{item.currency || '—'} {item.amount || '—'}</td>
                        <td className="p-3">
                          <p className="font-semibold text-slate-800">{item.localStatus || '—'}</p>
                          <p className="mt-1 text-slate-500">{item.providerStatus || 'not checked'}</p>
                        </td>
                        <td className="p-3">{item.identityMatches === true && item.walletReferenceMatches === true ? 'Matched' : 'Review'}</td>
                        <td className="p-3">{item.amountMatches === true ? 'Matched' : 'Review'}</td>
                        <td className="p-3">{String(item.settlementTarget || 'not checked').replaceAll('_', ' ')}</td>
                        <td className="max-w-[190px] whitespace-normal p-3 font-semibold text-slate-700">{String(item.finding || 'review_required').replaceAll('_', ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        <p className="text-[11px] leading-relaxed text-slate-500">
          A provider-completed session is not automatically treated as a customer credit. Any settlement-account mismatch
          or missing wallet confirmation requires a separate ledger and wallet-credit review.
        </p>
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
