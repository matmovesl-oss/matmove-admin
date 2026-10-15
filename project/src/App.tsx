


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
import AuditPage from './pages/AuditPage';
import DispatchRadarPage from './pages/DispatchRadarPage';
import { PricingPage } from './pages/PricingPage'; 
import { TransactionsPage } from './pages/TransactionsPage'; 

import {AdminAccessContext,canAccess,homeFor,type AdminAccess} from './lib/adminAccess';
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
 async function finished(){try{setAccess(await loadAdminSession(supabase,session));onRecoveryDone();window.history.replaceState(null,'','/');window.location.assign('/');}catch(e){setError(e instanceof Error?e.message:'Unable to refresh permissions.');}}

 if(loading)return <p className="p-8">Checking staff assignments…</p>;
 return <AdminAccessContext.Provider value={access}>{!access?.is_active?<Denied message={error||'Access denied. An active Admin staff assignment is required.'} retry={()=>setReload(n=>n+1)}/>:recovery||access.requires_password_setup||loc.pathname==='/accept-invite'?<StaffPasswordPage onComplete={()=>void finished()}/>:<Routes>
 <Route path="/" element={<Navigate to={homeFor(access)} replace/>}/>
 <Route path="/dashboard" element={<Gate access={access} section="dashboard"><DashboardPage/></Gate>}/>
 <Route path="/dispatch" element={<Gate access={access} section="dispatch"><DispatchRadarPage/></Gate>}/>
 <Route path="/pricing" element={<Gate access={access} section="pricing"><PricingPage/></Gate>}/>
 <Route path="/games" element={<GameGate access={access}/>}/>
 <Route path="/kyc" element={<Gate access={access} section="kyc"><KycPage/></Gate>}/>
 <Route path="/financials" element={<Gate access={access} section="financials"><FinancialsPage/></Gate>}/>
 <Route path="/transactions" element={<Gate access={access} section="transactions"><TransactionsPage/></Gate>}/>
 <Route path="/payouts" element={<Gate access={access} section="payouts"><PayoutsPage/></Gate>}/>
 <Route path="/customers" element={<Gate access={access} section="customers"><UsersPage/></Gate>}/>
 <Route path="/staff" element={<Gate access={access} section="staff"><StaffGovernancePage/></Gate>}/>
 <Route path="/logs" element={<Gate access={access} section="logs"><LogsPage/></Gate>}/>
 <Route path="/audit" element={<Gate access={access} section="logs"><AuditPage/></Gate>}/>
 <Route path="/wallets" element={<Navigate to="/financials" replace/>}/><Route path="/withdrawals" element={<Navigate to="/payouts" replace/>}/><Route path="/users" element={<Navigate to="/customers" replace/>}/>
 <Route path="*" element={<Denied/>}/>
 </Routes>}</AdminAccessContext.Provider>;
}
export default function App(){
 const [session,setSession]=useState<any>(null);const [loading,setLoading]=useState(true);const [recovery,setRecovery]=useState(false);
 useEffect(()=>{let live=true;void supabase.auth.getSession().then(({data})=>{if(live){setSession(data.session);setLoading(false);}});const {data:{subscription}}=supabase.auth.onAuthStateChange((event,next)=>{setSession(next);setLoading(false);if(event==='PASSWORD_RECOVERY')setRecovery(true);if(event==='SIGNED_OUT')setRecovery(false);});return()=>{live=false;subscription.unsubscribe();};},[]);
 if(loading)return <p className="p-8">Loading Admin…</p>;
 return <BrowserRouter>{session?<Console session={session} recovery={recovery} onRecoveryDone={()=>setRecovery(false)}/>:<LoginPage/>}</BrowserRouter>;
}
