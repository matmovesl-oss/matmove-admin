
import {useEffect,useRef,useState} from 'react';
import {Download,FileSpreadsheet,RefreshCw,X} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import {canAccess,sections,useAdminAccess} from '@/lib/adminAccess';
import {loadReportCatalog,loadCompleteReport,type CompleteReport,type ReportDefinition} from '@/lib/adminReports';
import {exportCompleteCsv} from '@/lib/csvExport';

function label(key:string){return key.replace(/_/g,' ')+(key.endsWith('_minor')?' (SLE cents)':'');}
function message(error:unknown){return error instanceof Error?error.message:'Report could not be completed. Retry this export.';}
export default function ReportsPage(){
 const access=useAdminAccess();
 const allowed=Boolean(access&&sections.some(([key])=>canAccess(access,key)));
 const stamp=JSON.stringify([access?.id,access?.is_active,access?.is_owner,[...(access?.permissions||[])].sort()]);
 const current=useRef(stamp);current.current=stamp;
 const alive=useRef(true),generation=useRef(0),operation=useRef<AbortController|null>(null),locked=useRef(false);
 const [loadedStamp,setLoadedStamp]=useState('');
 const [reload,setReload]=useState(0),[reports,setReports]=useState<ReportDefinition[]>([]),[selected,setSelected]=useState('');
 const [loading,setLoading]=useState(true),[catalogError,setCatalogError]=useState('');
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [completed,setCompleted]=useState<CompleteReport|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;operation.current?.abort();locked.current=false;};},[]);
 useEffect(()=>{
  const controller=new AbortController();const version=++generation.current;operation.current?.abort();operation.current=controller;locked.current=false;
  setLoadedStamp(stamp);setBusy(false);setProgress(0);setCompleted(null);setNotice('');setError('');setReports([]);setSelected('');setCatalogError('');setLoading(allowed);
  if(!allowed)return()=>controller.abort();
  const valid=()=>alive.current&&current.current===stamp&&generation.current===version&&!controller.signal.aborted;
  void loadReportCatalog(access!.id,controller.signal).then(list=>{
   if(!valid())return;
   const assigned=list.filter(report=>canAccess(access,report.permission));
   setReports(assigned);setSelected(assigned.find(r=>r.available)?.id||assigned[0]?.id||'');
  }).catch(e=>{if(valid())setCatalogError(message(e));}).finally(()=>{if(valid())setLoading(false);});
  return()=>controller.abort();
 },[stamp,reload,allowed]);
 const report=reports.find(r=>r.id===selected);
 function cancel(){generation.current++;operation.current?.abort();locked.current=false;setBusy(false);setProgress(0);setCompleted(null);setError('');setNotice('Export cancelled. No CSV was downloaded.');}
 async function exportHistory(){
  if(locked.current||!access||!report||!report.available||!canAccess(access,report.permission)||loading||catalogError)return;
  locked.current=true;const controller=new AbortController();operation.current?.abort();operation.current=controller;
  const version=++generation.current,identity=access.id,chosen=report;
  const valid=()=>alive.current&&current.current===stamp&&generation.current===version&&!controller.signal.aborted;
  setBusy(true);setProgress(0);setCompleted(null);setNotice('');setError('');
  try{
   const result=await loadCompleteReport({userId:identity,report:chosen,signal:controller.signal,onProgress:count=>{if(valid())setProgress(count);}});
   if(!valid())return;
   const count=await exportCompleteCsv({userId:identity,section:chosen.permission,filename:'matmove-'+chosen.id,report:result,signal:controller.signal,isCurrent:valid});
   if(!valid())return;
   setCompleted(result);setNotice(`CSV download started: ${count.toLocaleString()} records. ${result.source==='gateway'?'All Monime pages loaded successfully.':'All database pages loaded successfully.'}`);
  }catch(e){if(valid())setError(message(e));}
  finally{if(valid()){locked.current=false;setBusy(false);}}
 }
 return <AdminLayout title="Reports & CSV" subtitle="Export database and Monime histories assigned to your staff account.">
  {!allowed?<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">Access denied. An active section assignment is required.</p>:<div className="mx-auto max-w-6xl space-y-5">
   <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
     <div className="flex items-center gap-3"><FileSpreadsheet className="text-indigo-600" size={24}/><div><h2 className="font-bold text-slate-900">Complete report history</h2><p className="mt-1 text-sm text-slate-500">Choose a report, then export once. Larger reports load in pages.</p></div></div>
     <button type="button" disabled={busy||loading} onClick={()=>setReload(n=>n+1)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw size={16}/>Refresh reports</button>
    </div>
    {loading||loadedStamp!==stamp?<p role="status" className="mt-5 text-sm text-slate-500">Loading assigned reports…</p>:catalogError?<div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700"><p>{catalogError}</p><button type="button" onClick={()=>setReload(n=>n+1)} className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 font-bold">Retry reports</button></div>:!reports.length?<p className="mt-5 text-sm text-slate-600">No reports are available for your current assignments.</p>:<div className="mt-5 space-y-4">
     <label className="block text-sm font-semibold text-slate-700">Report
      <select aria-label="Report" value={selected} disabled={busy} onChange={event=>{setSelected(event.target.value);setCompleted(null);setError('');setNotice('');setProgress(0);}} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base sm:max-w-2xl">
       {reports.map(item=><option key={item.id} value={item.id}>{item.title}{item.available?'':' — setup required'}</option>)}
      </select>
     </label>
     {report&&<><p className="text-sm text-slate-600">{report.note}</p>{!report.available&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">This report source is not installed. It cannot be exported yet.</p>}
      <div className="flex flex-wrap gap-3">
       <button type="button" disabled={busy||!report.available} onClick={()=>void exportHistory()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><Download size={17}/>{busy?'Preparing CSV…':'Export complete CSV'}</button>
       {busy&&<button type="button" onClick={cancel} className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold"><X size={17}/>Cancel export</button>}
      </div>
     </>}
    </div>}
    {busy&&<p role="status" aria-live="polite" className="mt-4 text-sm font-semibold text-indigo-700">{progress.toLocaleString()} records loaded. Waiting for the remaining pages…</p>}
    {error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error} No complete CSV was downloaded. Use Export complete CSV to retry.</p>}
    {notice&&<p role="status" className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{notice}</p>}
   </section>
   {loadedStamp===stamp&&completed&&completed.actor===access?.id&&report&&canAccess(access,report.permission)&&<section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="space-y-1 p-4"><h2 className="font-bold">Completed export preview</h2><p className="text-sm text-slate-600">{completed.rows.length.toLocaleString()} records in the CSV. Preview shows the first 20.</p><p className="text-xs text-slate-500">{completed.source==='gateway'?'Export started':'Creation cutoff'}: {new Date(completed.cutoff).toLocaleString()}. {completed.source==='gateway'?'Gateway records reflect when each page was read. New activity during an export may not be included.':'Statuses and mutable fields reflect when each page was read.'}</p></div>
    {!completed.rows.length?<p className="px-4 pb-4 text-sm text-slate-600">No records found. The CSV contains column headings only.</p>:<div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-600"><tr>{completed.columns.map(column=><th key={column} className="whitespace-nowrap px-4 py-3 font-semibold capitalize">{label(column)}</th>)}</tr></thead><tbody>{completed.rows.slice(0,20).map((row,index)=><tr key={index} className="border-t border-slate-100">{completed.columns.map(column=><td key={column} className="max-w-xs break-words px-4 py-3 align-top text-slate-700">{row[column]==null?'—':String(row[column])}</td>)}</tr>)}</tbody></table></div>}
   </section>}
   <p className="text-xs leading-relaxed text-slate-500">Reports contain operational fields only. Private KYC files and security credentials are excluded. Monime reports follow every returned page until the gateway confirms the end. They require the existing server-side Monime settings. Amount values labelled provider_minor_units retain the supplied currency; no conversion is applied. Cached wallet balances are not live provider balances.</p>
  </div>}
 </AdminLayout>;
}
