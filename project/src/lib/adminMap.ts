let pending:Promise<void>|null=null;
export function loadAdminMap(){
 if((window as any).google?.maps?.Map)return Promise.resolve();
 if(pending)return pending;
 const key=import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
 if(!key)return Promise.reject(Error('The Admin map needs its Google Maps key configured. Trip details remain available.'));
 pending=new Promise<void>((resolve,reject)=>{
  const script=document.createElement('script');let done=false;
  const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timeout);clearInterval(check);if(error){script.remove();reject(error);}else resolve();};
  const timeout=setTimeout(()=>finish(Error('Map loading timed out. Reload the trip review.')),15000);
  const check=setInterval(()=>{if((window as any).google?.maps?.Map)finish();},100);
  script.onerror=()=>finish(Error('The Admin map could not load. Check the connection and map key.'));
  script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async`;script.async=true;document.head.appendChild(script);
 }).catch(e=>{pending=null;throw e;});return pending;
}
