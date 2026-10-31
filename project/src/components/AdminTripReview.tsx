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
 return <section aria-label="Admin trip details" className="space-y-3 border-b pb-4"><h2 className="text-lg font-bold">Trip details and live tracking</h2>{error?<p role="alert" className="text-sm text-red-700">{error}<button type="button" onClick={()=>setRetry(n=>n+1)} className="ml-2 min-h-11 underline">Retry trip review</button></p>:loading&&!safe?<p role="status">Loading trip details…</p>:safe?<><dl className="grid gap-3 text-sm sm:grid-cols-2">{[['Status',safe.status],['Customer',safe.rider.name||safe.rider.id],['Customer phone',safe.rider.phone],['Driver',safe.driver?.name||'Awaiting assignment'],['Driver phone',safe.driver?.phone],['Driver email',safe.driver?.email],['Vehicle / plate',[safe.vehicleType,safe.driver?.plate].filter(Boolean).join(' / ')],['Pickup',safe.pickup],['Destination',safe.destination],['Fare',safe.fare==null?'Unavailable':`SLE ${Number(safe.fare).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`],['Passengers',safe.passengerCount],['Passenger name',safe.passengerName],['Requested',time(safe.createdAt)],['Scheduled',safe.scheduledAt?time(safe.scheduledAt):'Not scheduled'],['Accepted',time(safe.acceptedAt)],['Started',time(safe.startedAt)],['Completed',time(safe.completedAt)]].map(([label,value])=><div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="break-words font-semibold">{value||'Not recorded'}</dd></div>)}</dl><p role="status" className="text-xs text-slate-600">{!safe.trackingActive?'Live tracking is closed for this trip.':safe.driverPosition?`Driver location received ${time(safe.driverPosition.receivedAt)}; accuracy about ${Math.ceil(safe.driverPosition.accuracy)} m.`:'Waiting for the driver to share fresh GPS. This is not a live position until a reading arrives.'}</p><p className="text-xs text-slate-500">A: pickup · B: destination · D: driver · C: customer. Only fresh, explicitly shared locations are shown. No background GPS is inferred.</p></>:null}{mapError&&<p role="alert" className="text-xs text-amber-900">{mapError}</p>}<div ref={host} aria-label="Admin trip tracking map" className="h-72 w-full rounded-xl bg-slate-100"/></section>;
}
