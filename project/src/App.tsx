

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

function Denied({message='Access denied. This section has not been assigned to your staff account.'}:{message?:string}){return <AdminLayout title="Access denied"><p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">{message}</p></AdminLayout>;}
function Gate({access,section,children}:{access:AdminAccess;section:string;children:React.ReactNode}){return canAccess(access,section)?<>{children}</>:<Denied/>;}
function GameGate({access}:{access:AdminAccess}){const loc=useLocation();const tab=new URLSearchParams(loc.search).get('tab');if(!tab){const first=['overview','players','entries','winnings','settings','recovery'].find(t=>canAccess(access,`games.${t}`));return first?<Navigate to={`/games?tab=${first}`} replace/>:<Denied/>;}if(!['overview','players','entries','winnings','settings','recovery'].includes(tab))return <Denied/>;return <Gate access={access} section={`games.${tab}`}><GamesPage/></Gate>;}
function Console({session,recovery,onRecoveryDone}:{session:any;recovery:boolean;onRecoveryDone:()=>void}){
 const [access,setAccess]=useState<AdminAccess|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const loc=useLocation();
 useEffect(()=>{let live=true;const refresh=async()=>{const r=await supabase.rpc('matmove_admin_me');if(!live)return;if(r.error){setError('Unable to verify staff permissions. Run STAFF_ACCESS_SETUP.sql and refresh.');setAccess(null);}else{setAccess(r.data);setError('');}setLoading(false);};void refresh();const timer=setInterval(()=>void refresh(),15000);return()=>{live=false;clearInterval(timer);};},[session.user.id]);
 async function finished(){const r=await supabase.rpc('matmove_admin_me');if(!r.error)setAccess(r.data);onRecoveryDone();window.history.replaceState(null,'','/');window.location.assign('/');}
 if(loading)return <p className="p-8">Checking staff assignments…</p>;
 return <AdminAccessContext.Provider value={access}>{!access?.is_active?<Denied message={error||'Access denied. An active Admin staff assignment is required.'}/>:recovery||access.requires_password_setup||loc.pathname==='/accept-invite'?<StaffPasswordPage onComplete={()=>void finished()}/>:<Routes>
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
