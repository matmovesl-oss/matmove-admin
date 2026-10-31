import ReportsPage from './pages/ReportsPage';
import {loadAdminSession} from './lib/adminSession';
import { GamesPage } from './pages/GamesPage';
import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';
import LoginPage from './pages/LoginPage';

import DashboardPage from './pages/DashboardPage';
import { KycPage } from './pages/KycPage';
import { FinancialsPage } from './pages/FinancialsPage';
import { PayoutsPage } from './pages/PayoutsPage';
import UsersPage from './pages/UsersPage'; 
import { StaffGovernancePage } from './pages/StaffGovernancePage';
import { LogsPage } from './pages/LogsPage';
import { SpecialOperationsPage } from './pages/SpecialOperationsPage';
import AuditPage from './pages/AuditPage';
import DispatchRadarPage from './pages/DispatchRadarPage';
import { PricingPage } from './pages/PricingPage'; 
import { TransactionsPage } from './pages/TransactionsPage'; 
import { CivitasAdministrativePage } from './pages/CivitasAdministrativePage';

import {AdminAccessContext,canAccess,homeFor,sections,type AdminAccess} from './lib/adminAccess';
import AdminLayout from './components/AdminLayout';
import StaffPasswordPage from './pages/StaffPasswordPage';

function Denied({message='Access denied. This section has not been assigned to your staff account.',retry}:{message?:string;retry?:()=>void}){return <AdminLayout title="Access denied"><p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">{message}</p>{retry&&<button type="button" onClick={retry} className="mt-4 rounded-xl border bg-white px-5 py-3 font-bold">Retry permission check</button>}</AdminLayout>;}
function Gate({access,section,children}:{access:AdminAccess;section:string;children:React.ReactNode}){return canAccess(access,section)?<>{children}</>:<Denied/>;}
function GameGate({access}:{access:AdminAccess}){const loc=useLocation();const tab=new URLSearchParams(loc.search).get('tab');if(!tab){const first=['overview','players','entries','winnings','settings','recovery'].find(t=>canAccess(access,`games.${t}`));return first?<Navigate to={`/games?tab=${first}`} replace/>:<Denied/>;}if(!['overview','players','entries','winnings','settings','recovery'].includes(tab))return <Denied/>;return <Gate access={access} section={`games.${tab}`}><GamesPage/></Gate>;}
function Console({session,recovery,onRecoveryDone}:{session:any;recovery:boolean;onRecoveryDone:()=>void}){
 const [reload,setReload]=useState(0);const [access,setAccess]=useState<AdminAccess|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const loc=useLocation();
 useEffect(()=>{
  let live=true,inFlight=false;
  const refresh=async()=>{
   if(inFlight)return;inFlight=true;
   try{const row=await loadAdminSession(supabase,session);if(live){setAccess(row);setError('');}}
   catch(e){if(live){setAccess(null);setError(e instanceof Error?e.message:'Unable to verify staff permissions.');}}
   finally{inFlight=false;if(live)setLoading(false);}
  };
  setAccess(null);setLoading(true);void refresh();
  const timer=setInterval(()=>void refresh(),15000);
  return()=>{live=false;clearInterval(timer);};
 },[session.user.id,session.access_token,reload]);
 async function finished(){const row=await loadAdminSession(supabase,session);if(!row?.is_active)throw new Error('Your current staff access could not be confirmed. Contact the owner.');setAccess(row);onRecoveryDone();window.history.replaceState(null,'','/');window.location.assign('/');}

 if(loading)return <p className="p-8">Checking staff assignments…</p>;
 return <AdminAccessContext.Provider value={access}>{!access?.is_active?<Denied message={error||'Access denied. An active Admin staff assignment is required.'} retry={()=>setReload(n=>n+1)}/>:recovery||access.requires_password_setup||loc.pathname==='/accept-invite'?<StaffPasswordPage key={session.user.id} userId={session.user.id} mode={recovery?'recovery':'invite'} onComplete={finished}/>:<Routes>
 <Route path="/" element={<Navigate to={homeFor(access)} replace/>}/>
 <Route path="/notifications" element={<Gate access={access} section="notifications"><AdminLayout title="Customer messages" subtitle="Announcements for riders, drivers and merchants"><section className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-bold">Send an in-app message</h2><p className="mt-2 text-sm text-slate-600">Select Messages in the header to compose an announcement or review sent messages. Choose all customers, a role, or one exact customer ID. Review the audience and content before confirming.</p><p className="mt-3 text-sm text-slate-600">Only the super admin can grant this assignment. Message access does not include customer management, KYC approval, payments, or staff administration.</p></section></AdminLayout></Gate>}/>
 <Route path="/dashboard" element={<Gate access={access} section="dashboard"><DashboardPage/></Gate>}/>
 <Route path="/reports" element={sections.some(([key])=>canAccess(access,key))?<ReportsPage key={access.id}/>:<Denied/>}/>
 <Route path="/dispatch" element={<Gate access={access} section="dispatch"><DispatchRadarPage/></Gate>}/>
 <Route path="/pricing" element={<Gate access={access} section="pricing"><PricingPage/></Gate>}/>
 <Route path="/games" element={<GameGate access={access}/>}/>
 <Route path="/kyc" element={<Gate access={access} section="kyc"><KycPage/></Gate>}/>
 <Route path="/civitas" element={<Gate access={access} section="financials"><CivitasAdministrativePage/></Gate>}/>
 <Route path="/financials" element={<Gate access={access} section="financials"><FinancialsPage/></Gate>}/>
 <Route path="/transactions" element={<Gate access={access} section="transactions"><TransactionsPage/></Gate>}/>
 <Route path="/payouts" element={<Gate access={access} section="payouts"><PayoutsPage/></Gate>}/>
 <Route path="/customers" element={<Gate access={access} section="customers"><UsersPage/></Gate>}/>
 <Route path="/staff" element={<Gate access={access} section="staff"><StaffGovernancePage/></Gate>}/>
 <Route path="/special" element={<Gate access={access} section="financials"><SpecialOperationsPage/></Gate>}/>
 <Route path="/logs" element={<Gate access={access} section="logs"><LogsPage/></Gate>}/>
 <Route path="/audit" element={<Gate access={access} section="logs"><AuditPage/></Gate>}/>
 <Route path="/wallets" element={<Navigate to="/financials" replace/>}/><Route path="/withdrawals" element={<Navigate to="/payouts" replace/>}/><Route path="/users" element={<Navigate to="/customers" replace/>}/>
 <Route path="*" element={<Denied/>}/>
 </Routes>}</AdminAccessContext.Provider>;
}
const recoveryKey='matmove_admin_recovery';
export function validRecoveryMarker(raw:string|null,userId:string,now=Date.now()){
 try{const v=JSON.parse(raw||'null');return v?.id===userId&&Number.isFinite(v.until)&&v.until>now&&v.until<=now+3600000;}catch{return false;}
}
export function hasRecoveryLinkError(search:string,hash:string){const a=new URLSearchParams(search),b=new URLSearchParams(hash.replace(/^#/,''));return ['error','error_code','error_description'].some(k=>a.has(k)||b.has(k));}
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
 return <BrowserRouter>{invalid?<LoginPage recoveryError="This password reset link is expired, incomplete or already used. Request a new link below."/>:session?<Console key={session.user.id} session={session} recovery={recovery} onRecoveryDone={recovered}/>:<LoginPage/>}</BrowserRouter>;
}