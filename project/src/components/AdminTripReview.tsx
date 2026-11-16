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
 const [actionNote,setActionNote]=useState(''),[actionBusy,setActionBusy]=useState(false),[actionNotice,setActionNotice]=useState(''),[actionError,setActionError]=useState('');
 const host=useRef<HTMLDivElement|null>(null),map=useRef<any>(null),markers=useRef<Record<string,any>>({}),routeLine=useRef<any>(null),centered=useRef(false);
 const [fallbackPins,setFallbackPins]=useState<{pickupPin:any;destinationPin:any}>({pickupPin:null,destinationPin:null});
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
 const cashReturnReady=safe?.cashPayment?.returnStatus==='both_confirmed';
 const paymentTransfers=safe?.payment?.transfers||[];
 const refundLeg=paymentTransfers.find((t:any)=>t.kind==='refund');
 const hasAdminFullRefund=!!refundLeg&&Number(refundLeg.amountMinor)===Number(safe?.payment?.fareMinor)&&!paymentTransfers.some((t:any)=>t.kind==='driver');
 const adminUncompleted=safe?.paymentMethod==='digital'&&safe?.status==='in_progress';
 const canCancel=!!safe&&['pending','pending_admin','cash_reserve_pending','cash_review_required','accepted','in_progress'].includes(safe.status)&&!(safe.paymentMethod==='cash'&&(safe.status==='in_progress'||!!safe.driver?.id)&&!cashReturnReady)&&safe.cashPayment?.status!=='review_required';
 const canFlagUnpaid=!!safe&&!safe.payment&&( !safe.cashPayment || (safe.paymentMethod==='cash'&&safe.status==='in_progress'&&!!safe.driver?.id&&safe.cashPayment.status==='collection_pending'&&!safe.cashPayment.driverConfirmedAt) );
 async function flagUnpaid(){
  if(!canFlagUnpaid||actionBusy||actionNote.trim().length<3)return;
  setActionBusy(true);setActionError('');setActionNotice('');
  try{
   const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
   if(sessionError||sessionData.session?.user.id!==userId)throw Error('Your Admin sign-in changed.');
   const result=await supabase.rpc('matmove_admin_flag_unpaid_ride',{p_booking_id:bookingId,p_note:actionNote.trim(),p_expected_actor:userId});
   if(result.error)throw result.error;
   if(result.data?.actor!==userId||result.data?.bookingId!==bookingId||result.data?.flagged!==true)throw Error('The payment-review flag was not confirmed.');
   setActionNotice(safe.cashPayment?'Uncollected cash fare flagged for Admin review. The driver will see the payment investigation in Trips; no cash receipt or payout is marked complete.':'Unpaid request flagged for payment review. It remains open and visible in the investigation queue.');
   setRetry(n=>n+1);
  }catch(e:any){setActionError(e?.message||'Could not flag this request.');}
  finally{setActionBusy(false);}
 }
 async function requestCashReturn(){
  if(!safe||actionBusy||safe.paymentMethod!=='cash'||safe.status!=='in_progress'||!safe.driver?.id||actionNote.trim().length<3||cashReturnReady)return;
  setActionBusy(true);setActionError('');setActionNotice('');
  try{
   const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
   if(sessionError||sessionData.session?.user.id!==userId)throw Error('Your Admin sign-in changed.');
   const {data,error}=await supabase.rpc('matmove_admin_request_cash_return',{p_booking_id:bookingId,p_note:actionNote.trim(),p_expected_actor:userId});
   if(error)throw error;
   if(data?.bookingId!==bookingId||data?.requested!==true||!['requested','driver_confirmed','rider_confirmed','both_confirmed'].includes(data?.returnStatus))throw Error('Physical cash return request was not confirmed.');
   setActionNotice('Cash return verification has been opened. The driver must return the physical fare to the customer, and both parties must confirm it in their Trips section before Admin can process the MatMove fee-reserve refund.');
   setRetry(n=>n+1);
  }catch(e:any){setActionError(e?.message||'Could not request cash return verification.');}
  finally{setActionBusy(false);}
 }
 async function cancelAndRefund(){
  if(!safe||!canCancel||actionBusy||actionNote.trim().length<3||!safe.dispatchVersion)return;
  if(!window.confirm(adminUncompleted?'Mark this digital ride uncompleted? MatMove will refund 100% of the escrowed fare to the original customer. The driver receives no payout and MatMove receives no platform fee from this cancelled ride. The ride only closes after the full provider refund is verified.':'Cancel this exact request? Any required refund will remain pending until the provider receipt is verified.'))return;
  setActionBusy(true);setActionError('');setActionNotice('');
  try{
   const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
   if(sessionError||sessionData.session?.user.id!==userId||!sessionData.session.access_token)throw Error('Your Admin sign-in changed.');
   const requestId=crypto.randomUUID();
   const {data:result,error:rpcError}=await supabase.rpc('matmove_admin_cancel_booking',{
    p_booking_id:bookingId,p_expected:safe.dispatchVersion,p_request_id:requestId,p_note:actionNote.trim(),p_expected_actor:userId
   });
   if(rpcError)throw rpcError;
   if(result?.actor!==userId||result?.applied!==true||result?.bookingId!==bookingId||result?.action!=='cancel'||result?.requestId!==requestId)throw Error('Cancellation was not confirmed. Refresh this same request before retrying.');
   let refundStatus=result.refundStatus;
   if(refundStatus==='refund_pending'){
    try{
     const response=await fetch('https://matmoveent.vercel.app/api/accept-ride-escrow?action=admin_reconcile',{method:'POST',headers:{Authorization:`Bearer ${sessionData.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({bookingId})});
     const reconciliation=await response.json().catch(()=>null);
     if(response.ok&&reconciliation?.refundVerified===true)refundStatus='refunded';
    }catch{/* Keep refund pending until verified by the scheduled worker. */}
   }
   setActionNotice(refundStatus==='refunded'?'Cancellation and provider-verified refund completed.':refundStatus==='refund_pending'?'Cancellation recorded. Refund is pending provider verification; do not treat it as paid back yet.':safe.paymentMethod==='cash'?'Request cancelled. No provider refund was required.':'Request cancelled. No refund was required.');
   setRetry(n=>n+1);
  }catch(e:any){setActionError(String(e?.message||'Cancellation could not be verified.').replace(/^[A-Z_]+:\\s*/,''));}
  finally{setActionBusy(false);}
 }

 useEffect(()=>{
  if(!mapReady||!map.current||!safe)return;
  let live=true;
  setFallbackPins({pickupPin:null,destinationPin:null});
  const gm=(window as any).google.maps,geocoder=new gm.Geocoder();
  const lookup=(address:string)=>new Promise<any>(resolve=>{
   if(!address?.trim()){resolve(null);return;}
   geocoder.geocode({address:`${address}, Freetown, Sierra Leone`},(results:any,status:string)=>{
    if(status==='OK'&&results?.[0]?.geometry?.location){
     const pos=results[0].geometry.location;resolve({lat:pos.lat(),lng:pos.lng()});
    }else resolve(null);
   });
  });
  const pickupJob=safe.pickupPin?Promise.resolve(safe.pickupPin):lookup(safe.pickup);
  const destinationJob=safe.destinationPin?Promise.resolve(safe.destinationPin):lookup(safe.destination);
  void Promise.all([pickupJob,destinationJob]).then(([pickupPin,destinationPin])=>{
   if(live)setFallbackPins({pickupPin,destinationPin});
  });
  return()=>{live=false;};
 },[mapReady,bookingId,retry,safe?.pickup,safe?.destination,safe?.pickupPin?.lat,safe?.pickupPin?.lng,safe?.destinationPin?.lat,safe?.destinationPin?.lng]);
 const pickupPin=safe?.pickupPin||fallbackPins.pickupPin;
 const destinationPin=safe?.destinationPin||fallbackPins.destinationPin;
 useEffect(()=>{
  if(!mapReady||!map.current)return;
  const gm=(window as any).google.maps;
  const values:any={A:pickupPin,B:destinationPin,D:safe?.driverPosition,C:safe?.customerPosition};
  for(const[label,p]of Object.entries(values)){
   if(!p){markers.current[label]?.setMap(null);delete markers.current[label];continue;}
   if(!markers.current[label])markers.current[label]=new gm.Marker({map:map.current,position:p,label,title:({A:'Pickup',B:'Destination',D:'Driver (fresh GPS)',C:'Customer (fresh GPS)'})[label]});
   else markers.current[label].setPosition(p);
  }
  if(pickupPin&&destinationPin){
   const path=[pickupPin,destinationPin];
   if(!routeLine.current)routeLine.current=new gm.Polyline({map:map.current,path,geodesic:true,strokeColor:'#2563eb',strokeOpacity:.85,strokeWeight:4});
   else{routeLine.current.setMap(map.current);routeLine.current.setPath(path);}
  }else if(routeLine.current)routeLine.current.setMap(null);
  if(!centered.current&&pickupPin){
   const bounds=new gm.LatLngBounds();Object.values(values).filter(Boolean).forEach((p:any)=>bounds.extend(p));
   map.current.fitBounds(bounds,45);centered.current=true;
  }
 },[safe,mapReady,pickupPin,destinationPin]);
 if(!allowed)return null;
 return <section aria-label="Admin trip details" className="border-b pb-4">
  <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,.9fr)]">
   <div className="min-w-0 space-y-3">
    <h2 className="text-lg font-bold">Trip details and live tracking</h2>
    {error?<p role="alert" className="text-sm text-red-700">{error}<button type="button" onClick={()=>setRetry(n=>n+1)} className="ml-2 min-h-11 underline">Retry trip review</button></p>:loading&&!safe?<p role="status">Loading trip details…</p>:safe?<>
     <dl className="grid gap-3 text-sm sm:grid-cols-2">{[['Booking reference',safe.bookingId],['Status',safe.status],['Customer / requester',safe.rider.name||safe.rider.id],['Customer phone',safe.rider.phone],['Driver who accepted',safe.driver?.name||'Awaiting assignment'],['Driver phone',safe.driver?.phone],['Driver email',safe.driver?.email],['Vehicle / plate',[safe.vehicleType,safe.driver?.plate].filter(Boolean).join(' / ')],['Pickup',safe.pickup],['Destination',safe.destination],['Fare',safe.fare==null?'Unavailable':`SLE ${Number(safe.fare).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`],['Payment method',safe.paymentMethod||'Not recorded'],['Passengers',safe.passengerCount],['Passenger name',safe.passengerName],['Requested',time(safe.createdAt)],['Scheduled',safe.scheduledAt?time(safe.scheduledAt):'Not scheduled'],['Accepted',time(safe.acceptedAt)],['Started',time(safe.startedAt)],['Completed',time(safe.completedAt)]].map(([label,value])=><div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="break-words font-semibold">{value||'Not recorded'}</dd></div>)}</dl>
     <section className="space-y-2 rounded-xl border bg-slate-50 p-3"><h3 className="font-bold">Payment and settlement</h3>{safe.payment?<><p className="text-sm">Digital payment: <b>{safe.payment.state}</b></p><p className="text-xs text-slate-600">Fare: {safe.payment.fareMinor} minor units · Driver: {safe.payment.driverMinor} · Platform fee: {safe.payment.feeMinor}</p></>:safe.cashPayment?<><p className="text-sm">Cash payment: <b>{safe.cashPayment.status}</b></p><p className="text-xs text-slate-600">Driver cash: {safe.cashPayment.driverCashMinor} minor units · MatMove fee reserve: {safe.cashPayment.matmoveFeeMinor} · Driver confirmed: {safe.cashPayment.driverConfirmedAt?time(safe.cashPayment.driverConfirmedAt):'No'} · Customer confirmed: {safe.cashPayment.customerConfirmedAt?time(safe.cashPayment.customerConfirmedAt):'No'}</p><p className="text-xs text-slate-600">Physical cash return: <b>{safe.cashPayment.returnStatus||'not requested'}</b> · Driver returned/confirmed: {safe.cashPayment.returnDriverConfirmedAt?time(safe.cashPayment.returnDriverConfirmedAt):'No'} · Customer received/confirmed: {safe.cashPayment.returnRiderConfirmedAt?time(safe.cashPayment.returnRiderConfirmedAt):'No'}</p></>:<p className="text-sm text-amber-800">No digital or cash payment ledger was found. This request can be flagged for unpaid-request review.</p>}</section>
     {hasAdminFullRefund&&<section className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3"><h3 className="font-bold text-indigo-950">Admin uncompleted · full customer refund</h3><p className="text-sm">Customer refund: <b>SLE {(Number(refundLeg.amountMinor)/100).toFixed(2)}</b></p><p className="text-sm">Driver payout from this cancelled ride: <b>SLE 0.00</b></p><p className="text-sm">MatMove platform fee from this cancelled ride: <b>SLE 0.00</b></p><p className="text-xs text-indigo-800">Payment state: {safe.payment.state}. The ride closes only after the full customer refund is verified by the provider.</p></section>}
     <section className="space-y-2 rounded-xl border p-3"><h3 className="font-bold">Request and payment timeline</h3>{(safe.timeline||[]).length?<ol className="space-y-2">{safe.timeline.map((event:any,index:number)=><li key={index} className="border-l-2 border-indigo-200 pl-3"><p className="text-sm font-semibold">{event.label}</p><p className="text-xs text-slate-500">{time(event.at)}{event.detail? ` · ${event.detail}`:''}</p></li>)}</ol>:<p className="text-sm text-slate-500">No additional timeline events were recorded.</p>}</section>
     <section className="space-y-2 rounded-xl border p-3"><h3 className="font-bold">Admin resolution</h3><label className="block text-xs font-semibold">Investigation note (required)<textarea value={actionNote} onChange={e=>setActionNote(e.target.value)} minLength={3} maxLength={300} rows={3} className="mt-1 w-full rounded-lg border p-2 text-sm" placeholder="Record what was checked and why this action is needed."/></label>{actionError&&<p role="alert" className="text-sm text-red-700">{actionError}</p>}{actionNotice&&<p role="status" className="text-sm text-emerald-800">{actionNotice}</p>}<div className="flex flex-wrap gap-2">{canFlagUnpaid&&<button type="button" disabled={actionBusy||actionNote.trim().length<3} onClick={()=>void flagUnpaid()} className="min-h-10 rounded-lg border border-amber-300 px-3 text-sm font-bold text-amber-900 disabled:opacity-50">{actionBusy?'Saving…':safe.cashPayment?'Flag unpaid cash fare':'Flag unpaid request'}</button>}{safe.paymentMethod==='cash'&&safe.status==='in_progress'&&safe.driver?.id&&!cashReturnReady&&<button type="button" disabled={actionBusy||actionNote.trim().length<3||['requested','driver_confirmed','rider_confirmed'].includes(safe.cashPayment?.returnStatus)} onClick={()=>void requestCashReturn()} className="min-h-10 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-bold text-emerald-900 disabled:opacity-50">{['requested','driver_confirmed','rider_confirmed'].includes(safe.cashPayment?.returnStatus)?'Cash return confirmation requested':'Request physical cash return confirmation'}</button>}<button type="button" disabled={!canCancel||actionBusy||actionNote.trim().length<3||!safe.dispatchVersion} onClick={()=>void cancelAndRefund()} className="min-h-10 rounded-lg bg-red-600 px-3 text-sm font-bold text-white disabled:opacity-40">{actionBusy?'Processing…':adminUncompleted?'Mark uncompleted · full customer refund':'Cancel request and verify refund'}</button></div>{adminUncompleted&&<p className="text-xs text-indigo-800">Admin uncompleted resolution returns 100% of the digitally escrowed fare to the original Rider or Merchant. No driver payout or MatMove platform-fee transfer is made. The ride closes only after the full provider refund is verified.</p>}{safe.paymentMethod==='cash'&&safe.driver?.id&&!cashReturnReady&&<p className="text-xs text-amber-900">A driver is linked to this cash request. Admin first requests physical cash return verification. The driver returns the physical fare to the customer; both must confirm in their Trips section. Only then can Admin cancel and refund the MatMove fee reserve. The physical fare and platform fee reserve are separate amounts.</p>}{cashReturnReady&&<p className="text-xs text-emerald-800">Both parties confirmed physical cash return. Admin may now cancel this booking and initiate the fee-reserve refund. The provider refund must still be verified.</p>}</section>
    </>:null}
   </div>
   <aside className="min-w-0 space-y-2 lg:sticky lg:top-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Request map</h3><span className="text-xs text-slate-500">{safe?.trackingActive?'Live GPS when fresh':'Saved pickup and destination'}</span></div>
    <div ref={host} aria-label="Admin trip tracking map" className="h-[360px] w-full rounded-xl border bg-slate-100"/>
    {mapError&&<p role="alert" className="text-xs text-amber-900">{mapError}</p>}
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600"><span>A · Pickup</span><span>B · Destination</span><span>D · Driver</span><span>C · Customer</span></div>
    <p role="status" className="text-xs text-slate-600">{!safe?'Select a request to load its map.':!safe.trackingActive?'Live tracking is closed for this trip.':safe.driverPosition? `Driver GPS received ${time(safe.driverPosition.receivedAt)} · accuracy about ${Math.ceil(safe.driverPosition.accuracy)} m.`:'Waiting for fresh driver GPS. The saved route remains visible.'}</p>
    {safe&&(!pickupPin||!destinationPin)&&<p className="text-xs text-amber-800">One or more saved GPS coordinates are missing. MatMove is attempting an address lookup; an unverified location will not be shown as a live position.</p>}
   </aside>
  </div>
 </section>;

}
