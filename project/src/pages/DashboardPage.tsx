
import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Activity,ArrowRight,RefreshCw,Wallet} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import {canAccess,sections,useAdminAccess} from '@/lib/adminAccess';
import {adminFetch} from '@/lib/adminFetch';
import {supabase} from '@/lib/supabase';

type Module={id:string;title:string;permission:string;status:'ok'|'error'|'unavailable';count:string|null;
 groups:{value:string;count:string}[];completedMoney:{currency:string;minor:string}|null;unverifiedCompleted:string|null;message:string|null};
type Overview={actor:string;generatedAt:string;modules:Module[];recentBookings:{id:string;service_type:string|null;status:string|null;fare_amount:string|null;created_at:string|null;pickup_location:string|null;destination_location:string|null}[]};
type Treasury={id:string;label:string;amount:string|null;message:string|null};
const integer=(value:unknown):value is string=>typeof value==='string'&&/^[0-9]+$/.test(value);
function count(value:string|null){return value!==null&&integer(value)?BigInt(value).toLocaleString():'Unavailable';}
function money(value:string,currency:string){
 if(!integer(value))return 'Unavailable';
 const minor=BigInt(value);return `${currency} ${(minor/BigInt(100)).toLocaleString()}.${String(minor%BigInt(100)).padStart(2,'0')}`;
}
function time(value:string|null|undefined){return value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString():'Not supplied';}
function errorMessage(error:unknown){return error instanceof Error?error.message:'Monitoring is temporarily unavailable.';}
function overviewValid(value:any,userId:string):value is Overview{
 return value?.actor===userId&&Number.isFinite(Date.parse(value.generatedAt))&&Array.isArray(value.modules)&&Array.isArray(value.recentBookings)&&value.modules.every((m:any)=>m&&typeof m.id==='string'&&typeof m.permission==='string'&&['ok','error','unavailable'].includes(m.status)&&
  (m.status!=='ok'?m.count===null:integer(m.count)&&Array.isArray(m.groups)&&m.groups.every((g:any)=>typeof g?.value==='string'&&integer(g.count))&&
   (m.completedMoney===null||(m.completedMoney?.currency==='SLE'&&integer(m.completedMoney.minor)&&integer(m.unverifiedCompleted)))));
}
function treasuryRows(body:any):Treasury[]{
 if(!Array.isArray(body.accounts)||!body.platform||typeof body.platform!=='object')throw new Error('Live account response was not confirmed.');
 const configured=new Map<string,string[]>();
 for(const [field,label] of [['escrowAccountId','Escrow'],['feeAccountId','Platform fees'],['spinAccountId','Spin Account']]){
  const id=body.platform[field];if(id===null||id===undefined||id==='')continue;
  if(typeof id!=='string')throw new Error('Platform account configuration was not confirmed.');
  configured.set(id,[...(configured.get(id)||[]),label]);
 }
 const seen=new Set<string>();for(const a of body.accounts){if(typeof a?.id!=='string'||seen.has(a.id))throw new Error('Duplicate or invalid live account records.');seen.add(a.id);}
 return [...configured].map(([id,labels])=>{
  const account=body.accounts.find((a:any)=>a.id===id),amount=account?.balance?.available;
  const valid=amount&&typeof amount.currency==='string'&&amount.currency===account.currency&&Number.isSafeInteger(amount.value)&&amount.value>=0;
  return {id,label:labels.join(' & '),amount:valid?money(String(amount.value),amount.currency):null,message:!account?'Configured account was not returned by Monime.':!valid?'Available balance was not confirmed.':null};
 });
}
export default function DashboardPage(){
 const access=useAdminAccess(),allowed=canAccess(access,'dashboard'),financial=canAccess(access,'financials');
 const stamp=JSON.stringify([access?.id,access?.is_active,access?.is_owner,[...(access?.permissions||[])].sort()]);
 const current=useRef(stamp);current.current=stamp;
 const [reload,setReload]=useState(0),[loadedStamp,setLoadedStamp]=useState('');
 const [overview,setOverview]=useState<Overview|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [treasury,setTreasury]=useState<Treasury[]>([]),[balanceLoading,setBalanceLoading]=useState(false),[balanceError,setBalanceError]=useState(''),[balanceAt,setBalanceAt]=useState('');
 useEffect(()=>{
  let live=true,inFlight=false;const controller=new AbortController();
  const valid=()=>live&&current.current===stamp&&!controller.signal.aborted;
  setLoadedStamp(stamp);setOverview(null);setError('');setTreasury([]);setBalanceError('');setBalanceAt('');setLoading(allowed);setBalanceLoading(allowed&&financial);
  if(!allowed)return()=>{live=false;controller.abort();};
  async function refresh(){
   if(inFlight||!valid())return;inFlight=true;setLoading(true);setError('');
   const db=async()=>{
    try{
     const response=await adminFetch('/api/admin-staff?'+new URLSearchParams({view:'report-overview',actor:access!.id}),{signal:controller.signal});const body=await response.json();
     if(!response.ok)throw new Error(body.error||'System monitoring unavailable.');
     if(!overviewValid(body,access!.id))throw new Error('System monitoring response was not confirmed.');
     if(valid())setOverview({...body,modules:body.modules.filter(m=>canAccess(access,m.permission)),recentBookings:canAccess(access,'dispatch')?body.recentBookings:[]});
    }catch(e){if(valid())setError(errorMessage(e));}finally{if(valid())setLoading(false);}
   };
   const balances=async()=>{
    if(!financial)return;setBalanceLoading(true);setBalanceError('');
    try{
     const response=await adminFetch('/api/admin-wallet-balances',{signal:controller.signal});const body=await response.json();
     if(!response.ok)throw new Error(body.error||'Live Monime balances unavailable.');
     const rows=treasuryRows(body);const {data,error:sessionError}=await supabase.auth.getSession();
     if(sessionError||data.session?.user.id!==access!.id)throw new Error('Your account changed. Reopen the dashboard.');
     if(valid()){setTreasury(rows);setBalanceAt(new Date().toISOString());}
    }catch(e){if(valid())setBalanceError(errorMessage(e));}finally{if(valid())setBalanceLoading(false);}
   };
   await Promise.allSettled([db(),balances()]);inFlight=false;
  }
  void refresh();
  const timer=window.setInterval(()=>{if(typeof document==='undefined'||document.visibilityState!=='hidden')void refresh();},60000);
  return()=>{live=false;controller.abort();window.clearInterval(timer);};
 },[stamp,allowed,financial,reload]);
 const ready=loadedStamp===stamp;
 const modules=ready&&overview?overview.modules.filter(m=>!(m.id==='spin_players'&&overview.modules.some(o=>o.id==='spin_overview'))&&!(m.id==='arcade_players'&&overview.modules.some(o=>o.id==='arcade_overview'))):[];
 const targets=sections.filter(([key])=>key!=='dashboard'&&canAccess(access,key));
 return <AdminLayout title="System Overview" subtitle="Current operational counts and recorded payment states, restricted to your assignments.">
  {!allowed?<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">Access denied. Overview has not been assigned.</p>:<div className="space-y-6">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="text-sm text-slate-600"><p>Database last synced: {ready&&overview?time(overview.generatedAt):'Not yet synced'}</p><p className="mt-1 text-xs">Auto-refresh every 60 seconds while this page is visible. Active requests do not overlap.</p></div>
    <div className="flex flex-wrap gap-2"><Link to="/reports" className="rounded-xl border bg-white px-4 py-3 text-sm font-semibold">Reports & CSV</Link><button type="button" disabled={loading||balanceLoading} onClick={()=>setReload(n=>n+1)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><RefreshCw size={16}/>Refresh overview</button></div>
   </div>
   {!ready||(!overview&&loading)?<p role="status" className="rounded-xl border bg-white p-5 text-sm text-slate-600">Loading system monitoring…</p>:error?<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p>{error}</p><button type="button" onClick={()=>setReload(n=>n+1)} className="mt-3 rounded-lg border bg-white px-3 py-2 font-bold">Retry dashboard</button></div>:<>
    {loading&&<p role="status" className="text-sm text-indigo-700">Refreshing database monitoring. The last successful snapshot remains below.</p>}
    {!modules.length?<p className="rounded-xl border bg-white p-5 text-sm text-slate-600">No operational modules are assigned to this account. Ask the owner to assign the sections you need.</p>:<section aria-label="Operational monitoring" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
     {modules.map(module=><article key={module.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3"><h2 className="text-sm font-bold text-slate-800">{module.title}</h2><Activity size={17} className={module.status==='ok'?'shrink-0 text-indigo-500':'shrink-0 text-amber-600'}/></div>
      {module.status!=='ok'?<p role="alert" className="mt-3 text-sm text-amber-800">{module.message||'This module is unavailable.'} No successful count is shown.</p>:<>
       <p className="mt-3 text-3xl font-semibold text-slate-900">{count(module.count)}</p><p className="text-xs text-slate-500">Database records</p>
       {!!module.groups.length&&<dl className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t pt-3 text-xs">{module.groups.map(group=><div key={group.value} className="flex gap-1.5"><dt className="capitalize text-slate-500">{module.id==='staff'?(group.value==='true'?'Active':group.value==='false'?'Inactive / removed':group.value):group.value.replace(/_/g,' ')}:</dt><dd className="font-semibold text-slate-700">{count(group.count)}</dd></div>)}</dl>}
       {module.completedMoney&&<div className="mt-3 rounded-xl bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-800">{module.id.endsWith('_entries')?'Entry receipts received':'Prize receipts paid'}</p><p className="mt-1 text-lg font-bold text-emerald-900">{money(module.completedMoney.minor,module.completedMoney.currency)}</p><p className="mt-1 text-xs text-emerald-800">Completed recorded transfers only. Pending amounts are excluded.</p>{module.unverifiedCompleted!=='0'&&<p className="mt-2 text-xs text-amber-800">{count(module.unverifiedCompleted)} completed records lacked a usable receipt or amount and were excluded.</p>}</div>}
       {module.id==='wallets'&&<p className="mt-3 text-xs text-slate-500">This is a wallet count by currency. Cached balances are not added to live Monime balances.</p>}
      </>}
     </article>)}
    </section>}
    {canAccess(access,'dispatch')&&overview&&modules.find(m=>m.id==='dispatch')?.status==='ok'&&<section className="overflow-hidden rounded-2xl border bg-white"><div className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-bold">Recent platform bookings</h2><Link to="/dispatch" className="text-sm font-semibold text-indigo-600">Open dispatch</Link></div>{!overview.recentBookings.length?<p className="p-4 text-sm text-slate-600">No bookings have been recorded yet.</p>:<div className="divide-y">{overview.recentBookings.map(booking=><article key={booking.id} className="space-y-1 px-4 py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold capitalize">{booking.service_type||'Service not supplied'}</p><p className="capitalize text-slate-600">{booking.status?.replace(/_/g,' ')||'Status not supplied'}</p></div><p className="break-words text-xs text-slate-500">{booking.pickup_location||'Pickup not supplied'} → {booking.destination_location||'Destination not supplied'}</p><p className="text-xs text-slate-500">Quoted fare: {booking.fare_amount===null?'Not supplied':`SLE ${booking.fare_amount}`} · {time(booking.created_at)}</p><p className="break-all text-xs text-slate-400">{booking.id}</p></article>)}</div>}</section>}
   </>}
   {financial&&<section className="space-y-3 rounded-2xl border bg-white p-4"><div className="flex items-center gap-2"><Wallet size={20} className="text-emerald-600"/><h2 className="font-bold">Live platform accounts</h2></div><p className="text-xs text-slate-500">Last synced: {ready&&balanceAt?time(balanceAt):'Not yet synced'}. Escrow may include funds held for customers; it is not a profit figure. Shared account IDs are shown once.</p>
    {!ready||(!balanceAt&&balanceLoading)?<p role="status" className="text-sm text-slate-600">Loading live Monime balances…</p>:balanceError?<div role="alert" className="text-sm text-red-700"><p>{balanceError}</p><button type="button" onClick={()=>setReload(n=>n+1)} className="mt-2 font-semibold underline">Retry live balances</button></div>:<>{balanceLoading&&<p role="status" className="text-xs text-indigo-700">Refreshing live balances…</p>}{!treasury.length?<p className="text-sm text-amber-800">No platform account IDs were configured in the balance response.</p>:<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{treasury.map(account=><article key={account.id} className="min-w-0 rounded-xl bg-slate-50 p-3"><h3 className="text-sm font-semibold">{account.label}</h3><p className="mt-1 text-xl font-bold">{account.amount||'Unavailable'}</p><p className="mt-1 break-all text-xs text-slate-500">{account.id}</p>{account.message&&<p role="alert" className="mt-2 text-xs text-amber-800">{account.message}</p>}</article>)}</div>}</>}
   </section>}
   {!!targets.length&&<section className="flex flex-wrap gap-2" aria-label="Assigned sections">{targets.map(([key,label,path])=><Link key={key} to={path} className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-600">{label}<ArrowRight size={13}/></Link>)}</section>}
  </div>}
 </AdminLayout>;
}
