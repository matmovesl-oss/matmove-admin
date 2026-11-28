




import {loadAdminSession} from './lib/adminSession';
import { lazy, Suspense, useState, useEffect, useRef } from 'react';
const ConciergePage = lazy(() => import('./pages/ConciergePage'));
const HomepagePostsPage = lazy(() => import('./pages/HomepagePostsPage'));
const SpecialOperationsPage = lazy(() => import('./pages/SpecialOperationsPage').then(m => ({default: m.SpecialOperationsPage})));
const AdministrativePayrollPage = lazy(() => import('./pages/AdministrativePayrollPage').then(m => ({default: m.AdministrativePayrollPage})));
const CivitasAdministrativePage = lazy(() => import('./pages/CivitasAdministrativePage').then(m => ({default: m.CivitasAdministrativePage})));
const AdminTravelPage = lazy(() => import('./pages/AdminTravelPage').then(m => ({default: m.AdminTravelPage})));
const AdminEventsPage = lazy(() => import('./pages/AdminEventsPage').then(m => ({default: m.AdminEventsPage})));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const CustomerSupportPage = lazy(() => import('./pages/CustomerSupportPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const GamesPage = lazy(() => import('./pages/GamesPage').then(m => ({default: m.GamesPage})));
const SportsPage = lazy(() => import('./pages/SportsPage').then(m => ({default: m.SportsPage})));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const KycPage = lazy(() => import('./pages/KycPage').then(m => ({default: m.KycPage})));
const FinancialsPage = lazy(() => import('./pages/FinancialsPage').then(m => ({default: m.FinancialsPage})));
const LoadingBonanzaPage = lazy(() => import('./pages/LoadingBonanzaPage'));
const PayoutsPage = lazy(() => import('./pages/PayoutsPage').then(m => ({default: m.PayoutsPage})));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const StaffGovernancePage = lazy(() => import('./pages/StaffGovernancePage').then(m => ({default: m.StaffGovernancePage})));
const LogsPage = lazy(() => import('./pages/LogsPage').then(m => ({default: m.LogsPage})));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const DispatchRadarPage = lazy(() => import('./pages/DispatchRadarPage'));
const PricingPage = lazy(() => import('./pages/PricingPage').then(m => ({default: m.PricingPage})));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage').then(m => ({default: m.TransactionsPage})));
const CashPaymentsPage = lazy(() => import('./pages/CashPaymentsPage'));
const StaffPasswordPage = lazy(() => import('./pages/StaffPasswordPage'));
const AppReleasePage = lazy(() => import('./pages/AppReleasePage'));
const AdminSecurityPage = lazy(() => import('./pages/AdminSecurityPage'));
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';
import LoginPage from './pages/LoginPage';


import {AdminAccessContext,canAccess,homeFor,sections,type AdminAccess} from './lib/adminAccess';
import AdminLayout from './components/AdminLayout';
import StaffMfaGate from './components/StaffMfaGate';

function Denied({message='Access denied. This section has not been assigned to your staff account.',retry}:{message?:string;retry?:()=>void}){return <AdminLayout title="Access denied"><p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">{message}</p>{retry&&<button type="button" onClick={retry} className="mt-4 rounded-xl border bg-white px-5 py-3 font-bold">Retry permission check</button>}</AdminLayout>;}
function Gate({access,section,children}:{access:AdminAccess;section:string;children:React.ReactNode}){return canAccess(access,section)?<>{children}</>:<Denied/>;}
function GameGate({access}:{access:AdminAccess}){const loc=useLocation();const tab=new URLSearchParams(loc.search).get('tab');if(!tab){const first=['overview','players','entries','winnings','settings','recovery'].find(t=>canAccess(access,`games.${t}`));return first?<Navigate to={`/games?tab=${first}`} replace/>:<Denied/>;}if(!['overview','players','entries','winnings','settings','recovery'].includes(tab))return <Denied/>;return <Gate access={access} section={`games.${tab}`}><GamesPage/></Gate>;}
function Console({session,recovery,onRecoveryDone}:{session:any;recovery:boolean;onRecoveryDone:()=>void}){
 const [reload,setReload]=useState(0);const [access,setAccess]=useState<AdminAccess|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const loc=useLocation();
 useEffect(()=>{
  let live=true,inFlight=false;
  const refresh=async()=>{
   if(inFlight)return;
   if(typeof navigator!=='undefined'&&!navigator.onLine){
    if(live){setAccess(null);setError('Connect to the internet to verify your MatMove Admin session. The workspace is locked while offline.');setLoading(false);}
    return;
   }
   inFlight=true;
   try{
    const valid=await supabase.rpc('matmove_admin_session_valid');
    if(valid.error||valid.data!==true){
     if(live){setAccess(null);setError('Your Admin session has expired or been revoked. Sign in again.');}
     void supabase.auth.signOut({scope:'local'});
     return;
    }
    const row=await loadAdminSession(supabase,session);
    if(live){setAccess(row);setError('');}
   }catch(e){
    if(live){setAccess(null);setError(e instanceof Error?e.message:'Unable to verify Admin session. Access remains locked.');}
   }finally{inFlight=false;if(live)setLoading(false);}
  };
  setLoading(true);
  void refresh();
  const timer=setInterval(()=>void refresh(),15000);
  window.addEventListener('online',refresh);
  return()=>{live=false;clearInterval(timer);window.removeEventListener('online',refresh);};
 },[session.user.id,session.access_token,reload]);
 async function finished(){const row=await loadAdminSession(supabase,session);if(!row?.is_active)throw new Error('Your current staff access could not be confirmed. Contact the owner.');setAccess(row);onRecoveryDone();window.history.replaceState(null,'','/');window.location.assign('/');}

 if(loading)return <p className="p-8">Checking staff assignments…</p>;
 return <AdminAccessContext.Provider value={access}>{error&&access?.is_active&&<div role="status" className="fixed bottom-4 left-1/2 z-[100] w-[min(92vw,620px)] -translate-x-1/2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 shadow-lg">{error}</div>}{!access?.is_active?<Denied message={error||'Access denied. An active Admin staff assignment is required.'} retry={()=>setReload(n=>n+1)}/>:<Suspense fallback={<div role="status" aria-live="polite" className="mx-auto max-w-4xl p-8 text-sm font-semibold text-slate-600">Loading your MatMove Admin section…</div>}>{recovery||access.requires_password_setup||loc.pathname==='/accept-invite'?<StaffPasswordPage key={session.user.id} userId={session.user.id} mode={recovery?'recovery':'invite'} onComplete={finished}/>:<Routes>
 <Route path="/" element={<Navigate to={homeFor(access)} replace/>}/>
 <Route path="/support" element={<Gate access={access} section="support"><CustomerSupportPage/></Gate>}/>
 <Route path="/notifications" element={<Gate access={access} section="notifications"><NotificationsPage/></Gate>}/>
 <Route path="/homepage-posts" element={<Gate access={access} section="notifications"><HomepagePostsPage/></Gate>}/>
 <Route path="/concierge" element={<Gate access={access} section="concierge"><ConciergePage/></Gate>}/>
 <Route path="/dashboard" element={<Gate access={access} section="dashboard"><DashboardPage/></Gate>}/>
 <Route path="/reports" element={sections.some(([key])=>canAccess(access,key))?<ReportsPage key={access.id}/>:<Denied/>}/>
 <Route path="/dispatch" element={<Gate access={access} section="dispatch"><DispatchRadarPage/></Gate>}/>
 <Route path="/pricing" element={<Gate access={access} section="pricing"><PricingPage/></Gate>}/>
 <Route path="/games" element={<GameGate access={access}/>}/>
 <Route path="/sports" element={<Gate access={access} section="sports"><SportsPage/></Gate>}/>
 <Route path="/kyc" element={<Gate access={access} section="kyc"><KycPage/></Gate>}/>
 <Route path="/civitas" element={<Gate access={access} section="financials"><CivitasAdministrativePage/></Gate>}/>
 <Route path="/special" element={<Gate access={access} section="special"><SpecialOperationsPage/></Gate>}/>
 <Route path="/payroll" element={<Gate access={access} section="special"><AdministrativePayrollPage/></Gate>}/>
 <Route path="/travel" element={<Gate access={access} section="travel"><AdminTravelPage/></Gate>}/>
 <Route path="/events" element={<Gate access={access} section="events"><AdminEventsPage/></Gate>}/>
 <Route path="/financials" element={<Gate access={access} section="financials"><FinancialsPage/></Gate>}/>
 <Route path="/loading-bonanza" element={<Gate access={access} section="financials"><LoadingBonanzaPage/></Gate>}/>
 <Route path="/cash-payments" element={<Gate access={access} section="financials"><CashPaymentsPage/></Gate>}/>
 <Route path="/transactions" element={<Gate access={access} section="transactions"><TransactionsPage/></Gate>}/>
 <Route path="/payouts" element={<Gate access={access} section="payouts"><PayoutsPage/></Gate>}/>
 <Route path="/customers" element={<Gate access={access} section="customers"><UsersPage/></Gate>}/>
 <Route path="/staff" element={<Gate access={access} section="staff"><StaffGovernancePage/></Gate>}/>
 <Route path="/security" element={<AdminSecurityPage/>}/>
  <Route path="/app-releases" element={<Gate access={access} section="staff"><AppReleasePage/></Gate>}/>
 <Route path="/logs" element={<Gate access={access} section="logs"><LogsPage/></Gate>}/>
 <Route path="/audit" element={<Gate access={access} section="logs"><AuditPage/></Gate>}/>
 <Route path="/wallets" element={<Navigate to="/financials" replace/>}/><Route path="/withdrawals" element={<Navigate to="/payouts" replace/>}/><Route path="/users" element={<Navigate to="/customers" replace/>}/>
 <Route path="*" element={<Denied/>}/>
 </Routes>}</Suspense>}</AdminAccessContext.Provider>;
}
const recoveryKey='matmove_admin_recovery';
export function validRecoveryMarker(raw:string|null,userId:string,now=Date.now()){
 try{const v=JSON.parse(raw||'null');return v?.id===userId&&Number.isFinite(v.until)&&v.until>now&&v.until<=now+3600000;}catch{return false;}
}
export function hasRecoveryLinkError(search:string,hash:string){const a=new URLSearchParams(search),b=new URLSearchParams(hash.replace(/^#/,''));return ['error','error_code','error_description'].some(k=>a.has(k)||b.has(k));}
function adminDeviceLabel(){
 const ua=typeof navigator!=='undefined'?navigator.userAgent:'';
 const browser=/Edg\//.test(ua)?'Edge':/Chrome\//.test(ua)?'Chrome':/Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)?'Safari':'Browser';
 const platform=/Windows/i.test(ua)?'Windows':/Macintosh|Mac OS/i.test(ua)?'Mac':/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iOS':'Device';
 return browser+' on '+platform;
}
function AdminSessionGuard({children}:{children:React.ReactNode}){
 const [warning,setWarning]=useState(false);
 const [checking,setChecking]=useState(false);
 useEffect(()=>{
  let lastActivity=Date.now(),lastTouch=Date.now(),inFlight=false,expired=false;
  const idleWarningMs=13*60*1000,idleExpiryMs=15*60*1000;
  const expire=async()=>{
   if(expired)return;
   expired=true;
   await supabase.auth.signOut({scope:'local'});
  };
  const touch=async(force=false)=>{
   const now=Date.now();
   if(inFlight||(!force&&now-lastTouch<45000)||expired)return;
   inFlight=true;
   try{
    const result=await supabase.rpc('matmove_admin_session_touch',{
     p_device_label:adminDeviceLabel(),
     p_user_agent:typeof navigator!=='undefined'?navigator.userAgent:'',
    });
    if(result.error){await expire();return;}
    lastTouch=Date.now();
   }catch{await expire();}
   finally{inFlight=false;}
  };
  const activity=()=>{
   if(expired)return;
   const now=Date.now();
   if(now-lastActivity>=idleExpiryMs){void expire();return;}
   lastActivity=now;
   setWarning(false);
   void touch();
  };
  const validate=async()=>{
   if(expired||inFlight)return;
   setChecking(true);
   try{
    const result=await supabase.rpc('matmove_admin_session_valid');
    if(result.error||result.data!==true){await expire();return;}
   }catch{await expire();}
   finally{setChecking(false);}
  };
  const onVisibility=()=>{if(document.visibilityState==='visible')void validate();};
  window.addEventListener('pointerdown',activity,{passive:true});
  window.addEventListener('keydown',activity);
  window.addEventListener('touchstart',activity,{passive:true});
  window.addEventListener('wheel',activity,{passive:true});
  document.addEventListener('visibilitychange',onVisibility);
  const idleTimer=window.setInterval(()=>{
   const idle=Date.now()-lastActivity;
   if(idle>=idleExpiryMs){void expire();return;}
   setWarning(idle>=idleWarningMs);
  },1000);
  const validateTimer=window.setInterval(()=>void validate(),5000);
  return()=>{
   window.removeEventListener('pointerdown',activity);
   window.removeEventListener('keydown',activity);
   window.removeEventListener('touchstart',activity);
   window.removeEventListener('wheel',activity);
   document.removeEventListener('visibilitychange',onVisibility);
   window.clearInterval(idleTimer);window.clearInterval(validateTimer);
  };
 },[]);
 async function continueSession(){
  setChecking(true);
  try{
   const result=await supabase.rpc('matmove_admin_session_touch',{
    p_device_label:adminDeviceLabel(),
    p_user_agent:typeof navigator!=='undefined'?navigator.userAgent:'',
   });
   if(result.error){await supabase.auth.signOut({scope:'local'});return;}
   setWarning(false);
  }finally{setChecking(false);}
 }
 return <>{children}{warning&&<div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/70 p-4"><section role="dialog" aria-modal="true" aria-labelledby="admin-idle-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 id="admin-idle-title" className="text-lg font-bold text-slate-900">Your Admin session is about to expire</h2><p className="mt-2 text-sm leading-6 text-slate-600">You have been inactive for 13 minutes. MatMove Admin will sign you out after 15 minutes of inactivity.</p><div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={checking} onClick={()=>void continueSession()} className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-50">{checking?'Checking…':'Continue working'}</button><button type="button" disabled={checking} onClick={()=>void supabase.auth.signOut({scope:'local'})} className="min-h-11 rounded-xl border px-4 py-2 font-semibold">Sign out</button></div></section></div>}</>;
}

export default function App(){
 const [session,setSession]=useState<any>(null),[loading,setLoading]=useState(true),[recoveryUser,setRecoveryUser]=useState<string|null>(null);
 const [linkError]=useState(()=>window.location.pathname==='/reset-password'&&hasRecoveryLinkError(window.location.search,window.location.hash));
 useEffect(()=>{
  let live=true,sequence=0;
  const remember=(id:string)=>{try{sessionStorage.setItem(recoveryKey,JSON.stringify({id,until:Date.now()+3600000}));}catch{/* Current tab can finish without optional storage. */}};
  const forget=()=>{try{sessionStorage.removeItem(recoveryKey);}catch{/* Optional storage. */}};
  const apply=(next:any,event?:string)=>{
   if(!live)return;setSession(next);setLoading(false);
   if(event==='PASSWORD_RECOVERY'&&next?.user?.id&&!linkError){setRecoveryUser(next.user.id);remember(next.user.id);}
   else if(!next){setRecoveryUser(null);forget();}
   else if(window.location.pathname==='/reset-password'&&!linkError){try{if(validRecoveryMarker(sessionStorage.getItem(recoveryKey),next.user.id))setRecoveryUser(next.user.id);}catch{/* No restored recovery without its marker. */}}
  };
  // Subscribe first: PASSWORD_RECOVERY must not be missed while getSession initializes.
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,next)=>{sequence++;apply(next,event);});
  const started=sequence;void supabase.auth.getSession().then(({data,error})=>{if(live&&sequence===started)apply(error?null:data.session);}).catch(()=>{if(live&&sequence===started)apply(null);});
  return()=>{live=false;subscription.unsubscribe();};
 },[linkError]);
 function recovered(){try{sessionStorage.removeItem(recoveryKey);}catch{/* Optional storage. */}setRecoveryUser(null);}
 if(loading)return <p className="p-8">Loading Admin…</p>;
 const resetPath=window.location.pathname==='/reset-password',recovery=!!session&&recoveryUser===session.user.id;
 const invalid=resetPath&&(linkError||!recovery);
 async function startVerifiedAdminSession(){
  const result=await supabase.rpc('matmove_admin_session_touch',{
   p_device_label:adminDeviceLabel(),
   p_user_agent:typeof navigator!=='undefined'?navigator.userAgent:'',
  });
  if(result.error)throw new Error(result.error.message||'Admin session could not be registered. Access remains blocked.');
 }
 return <BrowserRouter>{invalid?<LoginPage recoveryError="This password reset link is expired, incomplete or already used. Request a new link below."/>:session?<StaffMfaGate key={session.user.id} userId={session.user.id} onVerified={startVerifiedAdminSession}><AdminSessionGuard><Console key={session.user.id} session={session} recovery={recovery} onRecoveryDone={recovered}/></AdminSessionGuard></StaffMfaGate>:<LoginPage/>}</BrowserRouter>;
}
