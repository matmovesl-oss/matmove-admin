import {useEffect,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {canAccess,useAdminAccess} from '@/lib/adminAccess';
import {loadAdminMap} from '@/lib/adminMap';
const visible=()=>document.visibilityState!=='hidden';
const point=(p:any)=>p&&typeof p.lat==='number'&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&typeof p.lng==='number'&&Number.isFinite(p.lng)&&Math.abs(p.lng)<=180;
const time=(v:unknown)=>v&&Number.isFinite(Date.parse(String(v)))?new Date(String(v)).toLocaleString():'Not recorded';
export function validateAdminTrip(d:any,userId:string,bookingId:string){
 if(!d||d.actor!==userId||d.bookingId!==bookingId||typeof d.status!=='string'||typeof d.trackingActive!=='boolean'||!Number.isFinite(Date.parse(d.serverTime))||!d.rider?.id)throw Error('Trip review could not be verified.');
 for(const key of ['pickupPin','destinationPin','driverPosition','customerPosition'])if(d[key]!==null&&!point(d[key]))throw Error('Trip map coordinates could not be verified.');
 for(const key of ['driverPosition','customerPosition'])if(d[key]&&(!d.trackingActive||!Number.isFinite(Date.parse(d[key].receivedAt))||!Number.isFinite(Date.parse(d[key].observedAt))||!Number.isFinite(d[key].accuracy)||d[key].accuracy<0||d[key].accuracy>150||Date.parse(d.serverTime)-Date.parse(d[key].receivedAt)>45000||Date.parse(d[key].receivedAt)>Date.parse(d.serverTime)+15000||Date.parse(d.serverTime)-Date.parse(d[key].observedAt)>60000))throw Error('The tracking response is stale or invalid.');
 return d;
}
export default function AdminTripReview({userId,bookingId}:{userId:string;bookingId:string}){
 const access=useAdminAccess(),allowed=canAccess(access,'dispatch')&&access?.id===userId;
 const stamp=JSON.stringify([userId,bookingId,allowed,access?.is_active,access?.is_owner,[...(access?.permissions||[])].sort()]);
 const current=useRef(stamp);current.current=stamp;
 const [loadedStamp,setLoadedStamp]=useState('');
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0),[mapError,setMapError]=useState(''),[mapReady,setMapReady]=useState(false);
 const [flagNote,setFlagNote]=useState('Payment not yet confirmed. Please verify the provider receipt before closing this request.');
 const [resolutionNote,setResolutionNote]=useState('Payment status has been verified against the provider receipt.');
 const [actionBusy,setActionBusy]=useState(false),[actionError,setActionError]=useState(''),[actionNotice,setActionNotice]=useState('');
 async function runFlagAction(kind:'flag'|'resolve',flagId?:string){
  if(actionBusy||!safe)return;
  if((kind==='flag'?flagNote:resolutionNote).trim().length<3||(kind==='flag'?flagNote:resolutionNote).trim().length>300)return;
  setActionBusy(true);setActionError('');setActionNotice('');
  try{
   const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
   if(sessionError||sessionData.session?.user.id!==userId)throw new Error('Your Admin session changed. Reopen Dispatch.');
   const result=kind==='flag'
    ? await supabase.rpc('matmove_admin_flag_unpaid_booking',{p_booking_id:bookingId,p_note:flagNote.trim(),p_expected_actor:userId})
    : await supabase.rpc('matmove_admin_resolve_ride_flag',{p_flag_id:flagId,p_note:resolutionNote.trim(),p_expected_actor:userId});
   if(result.error)throw result.error;
   if(result.data?.actor!==userId||result.data?.bookingId!==bookingId||!result.data?.status)throw new Error('The Admin flag action was not verified.');
   setActionNotice(kind==='flag'?'Payment follow-up flag recorded. This does not mark payment as received.':'Payment follow-up flag resolved and audited.');
   setRetry(n=>n+1);
  }catch(e:any){setActionError(String(e?.message||'Admin payment flag action failed.').replace(/^[A-Z_]+:\\s*/,''));}
  finally{setActionBusy(false);}
 }
 const host=useRef<HTMLDivElement|null>(null),map=useRef<any>(null),markers=useRef<Record<string,any>>({}),centered=useRef(false);
 useEffect(()=>{let live=true,busy=false,epoch=0;let controller:AbortController|null=null;setData(null);setError('');setLoading(allowed);
  async function read(){if(!live||busy||!allowed||document.visibilityState==='hidden')return;busy=true;const n=epoch,requestStamp=stamp;controller=new AbortController();const timer=setTimeout(()=>controller?.abort(),10000);
   try{const before=await supabase.auth.getSession();if(before.error||before.data.session?.user.id!==userId||!before.data.session.access_token)throw Error('Your Admin sign-in changed.');if(!live||epoch!==n||current.current!==requestStamp)return;
    const result=await supabase.rpc('matmove_admin_trip_review',{p_booking:bookingId}).setHeader('Authorization',`Bearer ${before.data.session.access_token}`).abortSignal(controller.signal);
    if(result.error)throw Error('Trip review is unavailable. Check your Dispatch assignment and installed SQL, then retry.');
    const d=validateAdminTrip(result.data,userId,bookingId),after=await supabase.auth.getSession();if(after.error||after.data.session?.user.id!==userId)throw Error('Your Admin sign-in changed.');
    if(live&&epoch===n&&current.current===requestStamp&&visible()){setLoadedStamp(requestStamp);setData(d);setError('');}
   }catch(e){if(live&&epoch===n&&current.current===requestStamp){setData(null);setError(e instanceof Error?e.message:'Trip review unavailable.');}}
   finally{clearTimeout(timer);busy=false;if(live&&epoch===n)setLoading(false);}
  }
  const hidden=()=>{epoch++;controller?.abort();setData(null);if(visible())void read();};
  void read();const poll=setInterval(()=>{setData((old:any)=>old&&Date.now()-Date.parse(old.serverTime)>45000?{...old,driverPosition:null,customerPosition:null}:old);void read();},5000);document.addEventListener('visibilitychange',hidden);
  return()=>{live=false;epoch++;controller?.abort();clearInterval(poll);document.removeEventListener('visibilitychange',hidden);};
 },[stamp,allowed,retry,userId,bookingId]);
 useEffect(()=>{let live=true;setMapReady(false);setMapError('');if(!allowed)return;
  loadAdminMap().then(()=>{if(!live||!host.current)return;const gm=(window as any).google.maps;map.current=new gm.Map(host.current,{center:{lat:8.4808,lng:-13.229},zoom:13,gestureHandling:'greedy',streetViewControl:false,mapTypeControl:false});centered.current=false;setMapReady(true);}).catch(e=>{if(live)setMapError(e.message);});
  return()=>{live=false;Object.values(markers.current).forEach(m=>m.setMap(null));markers.current={};map.current=null;};
 },[allowed,bookingId,retry]);
 const safe=allowed&&loadedStamp===stamp?data:null;
 useEffect(()=>{if(!mapReady||!map.current)return;const gm=(window as any).google.maps;const values:any={A:safe?.pickupPin,B:safe?.destinationPin,D:safe?.driverPosition,C:safe?.customerPosition};
  for(const[label,p]of Object.entries(values)){if(!p){markers.current[label]?.setMap(null);delete markers.current[label];continue;}if(!markers.current[label])markers.current[label]=new gm.Marker({map:map.current,position:p,label});else markers.current[label].setPosition(p);}
  if(!centered.current&&safe?.pickupPin){const bounds=new gm.LatLngBounds();Object.values(values).filter(Boolean).forEach(p=>bounds.extend(p));map.current.fitBounds(bounds,45);centered.current=true;}
 },[safe,mapReady]);
 if(!allowed)return null;
 const openFlags=(safe?.adminFlags||[]).filter((flag:any)=>flag.status==='open');
 const unfinished=['pending','pending_admin','cash_reserve_pending','cash_review_required','accepted','in_progress'].includes(safe?.status);
 return <section aria-label="Admin trip details" className="space-y-3 border-b pb-4">
  <h2 className="text-lg font-bold">Full trip record and live tracking</h2>
  {error?<p role="alert" className="text-sm text-red-700">{error}<button type="button" onClick={()=>setRetry(n=>n+1)} className="ml-2 min-h-11 underline">Retry trip review</button></p>:loading&&!safe?<p role="status">Loading trip details…</p>:safe?<>
   <dl className="grid gap-3 text-sm sm:grid-cols-2">
    {[
     ['Booking reference',safe.bookingId],['Status',safe.status],['Service',safe.serviceType],['Customer / requester',safe.rider.name||safe.rider.id],['Customer phone',safe.rider.phone],['Customer email',safe.rider.email],
     ['Assigned / accepting driver',safe.driver?.name||'Awaiting assignment'],['Driver phone',safe.driver?.phone],['Driver email',safe.driver?.email],['Vehicle / plate',[safe.vehicleType,safe.driver?.plate].filter(Boolean).join(' / ')],
     ['Pickup',safe.pickup],['Destination',safe.destination],['Fare',safe.fare==null?'Unavailable':`SLE ${Number(safe.fare).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`],
     ['Passengers',safe.passengerCount],['Passenger name',safe.passengerName],['Payment method',safe.paymentMethod||'Not recorded'],
     ['Requested',time(safe.createdAt)],['Scheduled',safe.scheduledAt?time(safe.scheduledAt):'Not scheduled'],['Accepted by / accepted at',safe.driver?.name?time(safe.acceptedAt):'Not accepted'],['Started',time(safe.startedAt)],['Completed',time(safe.completedAt)]
    ].map(([label,value])=><div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="break-words font-semibold">{value||'Not recorded'}</dd></div>)}
   </dl>
   <section className="space-y-2 rounded-xl border bg-slate-50 p-3">
    <h3 className="font-bold">Payment and settlement evidence</h3>
    {safe.cashPayment?<>
     <div className="grid gap-2 text-sm sm:grid-cols-2">
      <p>Cash ledger: <strong className="capitalize">{safe.cashPayment.status}</strong></p>
      <p>Physical cash to driver: <strong>SLE {Number(safe.cashPayment.driverCash||0).toFixed(2)}</strong></p>
      <p>MatMove fee reserve: <strong>SLE {Number(safe.cashPayment.platformFee||0).toFixed(2)}</strong></p>
      <p>Driver confirmed cash received: <strong>{safe.cashPayment.driverCashConfirmed?'Yes':'No'}</strong></p>
      <p>Customer confirmed handover: <strong>{safe.cashPayment.riderCashConfirmed?'Yes':'No'}</strong></p>
      {safe.cashPayment.adminReturnRequested&&<><p>Admin return requested: <strong>Yes</strong></p><p>Return instruction: <strong>{safe.cashPayment.adminReturnNote||'Physical cash return requested'}</strong></p><p>Driver confirmed cash returned: <strong>{safe.cashPayment.driverReturnConfirmed?'Yes':'No'}</strong></p><p>Customer confirmed cash received back: <strong>{safe.cashPayment.riderReturnConfirmed?'Yes':'No'}</strong></p></>}
     </div>
    </>:safe.digitalPayment?<div className="grid gap-2 text-sm sm:grid-cols-2"><p>Digital payment: <strong className="capitalize">{safe.digitalPayment.status}</strong></p><p>Fare funded: <strong>SLE {Number(safe.digitalPayment.fare||0).toFixed(2)}</strong></p><p>Driver share: <strong>SLE {Number(safe.digitalPayment.driverShare||0).toFixed(2)}</strong></p><p>MatMove fee: <strong>SLE {Number(safe.digitalPayment.platformFee||0).toFixed(2)}</strong></p></div>:<p className="text-sm text-amber-800">No digital payment ledger or cash-payment record is present for this request.</p>}
    {(safe.digitalTransfers||[]).length>0&&<div><h4 className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">Digital transfers</h4><ul className="space-y-1 text-xs">{safe.digitalTransfers.map((t:any,i:number)=><li key={i} className="rounded-lg bg-white p-2">{t.kind} · {t.status} · SLE {Number(t.amount||0).toFixed(2)}{t.providerReference? ` · ${t.providerReference}`:''}{t.error? ` · ${t.error}`:''}</li>)}</ul></div>}
    {(safe.cashLegs||[]).length>0&&<div><h4 className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">Cash reserve / capture / refund legs</h4><ul className="space-y-1 text-xs">{safe.cashLegs.map((t:any,i:number)=><li key={i} className="rounded-lg bg-white p-2">{t.kind} · {t.status} · SLE {Number(t.amount||0).toFixed(2)}{t.providerReference? ` · ${t.providerReference}`:''}{t.verifiedAt? ` · Verified ${time(t.verifiedAt)}`:''}{t.error? ` · ${t.error}`:''}</li>)}</ul></div>}
   </section>
   {(safe.investigations||[]).length>0&&<section className="rounded-xl border border-amber-200 bg-amber-50 p-3"><h3 className="font-bold">Investigation history</h3><ul className="mt-2 space-y-2 text-xs">{safe.investigations.map((row:any,i:number)=><li key={i}>{row.reasonCode?.replace(/_/g,' ')} · {row.status} · First flagged {time(row.firstSeenAt)} · Last checked {time(row.lastSeenAt)}</li>)}</ul></section>}
   <section className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Admin payment flags</h3><span className="text-xs text-slate-500">{openFlags.length} open</span></div>
    {(safe.adminFlags||[]).length===0?<p className="text-xs text-slate-600">No payment follow-up flags have been recorded.</p>:<ul className="space-y-2">{safe.adminFlags.map((flag:any)=><li key={flag.id} className="rounded-lg border bg-white p-3 text-xs"><div className="flex justify-between gap-2"><strong>{flag.type?.replace(/_/g,' ')}</strong><span className="capitalize">{flag.status}</span></div><p className="mt-1">{flag.note}</p>{flag.resolutionNote&&<p className="mt-1 text-emerald-700">Resolution: {flag.resolutionNote}</p>}{flag.status==='open'&&<div className="mt-2 space-y-2"><textarea aria-label="Payment flag resolution note" value={resolutionNote} onChange={e=>setResolutionNote(e.target.value)} maxLength={300} className="w-full rounded-lg border p-2" /><button type="button" disabled={actionBusy||resolutionNote.trim().length<3} onClick={()=>void runFlagAction('resolve',flag.id)} className="min-h-9 rounded-lg bg-slate-900 px-3 font-bold text-white disabled:opacity-50">Resolve flag</button></div>}</li>)}</ul>}
    {unfinished&&openFlags.length===0&&<div className="space-y-2 border-t border-indigo-100 pt-3"><label className="block text-xs font-semibold">Flag this request as payment not confirmed<textarea aria-label="Payment flag note" value={flagNote} onChange={e=>setFlagNote(e.target.value)} maxLength={300} className="mt-1 w-full rounded-lg border bg-white p-2" /></label><button type="button" disabled={actionBusy||flagNote.trim().length<3} onClick={()=>void runFlagAction('flag')} className="min-h-10 rounded-lg border border-indigo-300 bg-white px-3 text-sm font-bold disabled:opacity-50">{actionBusy?'Saving…':'Flag payment not confirmed'}</button></div>}
    {actionError&&<p role="alert" className="text-xs text-red-700">{actionError}</p>}{actionNotice&&<p role="status" className="text-xs text-emerald-800">{actionNotice}</p>}
   </section>
   <p role="status" className="text-xs text-slate-600">{!safe.trackingActive?'Live tracking is closed for this trip.':safe.driverPosition?`Driver location received ${time(safe.driverPosition.receivedAt)}; accuracy about ${Math.ceil(safe.driverPosition.accuracy)} m.`:'Waiting for the driver to share fresh GPS. This is not a live position until a reading arrives.'}</p>
   <p className="text-xs text-slate-500">A: pickup · B: destination · D: driver · C: customer. Only fresh, explicitly shared locations are shown. No background GPS is inferred.</p>
  </>:null}
  {mapError&&<p role="alert" className="text-xs text-amber-900">{mapError}</p>}<div ref={host} aria-label="Admin trip tracking map" className="h-72 w-full rounded-xl bg-slate-100"/>
 </section>;
}