
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';
import {Loader2,Mail,Lock} from 'lucide-react';
export default function LoginPage({recoveryError=''}:{recoveryError?:string}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[mode,setMode]=useState<'login'|'reset'>(recoveryError?'reset':'login'),[busy,setBusy]=useState(false),[error,setError]=useState(recoveryError),[notice,setNotice]=useState('');
 const mounted=useRef(true),mutex=useRef(false),epoch=useRef(0);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;};},[]);
 function changeMode(next:'login'|'reset'){if(mutex.current)return;epoch.current++;setMode(next);setPassword('');setError('');setNotice('');if(next==='login'&&window.location.pathname==='/reset-password')window.location.assign('/');}
 async function submit(e:React.FormEvent){
  e.preventDefault();if(mutex.current)return;const address=email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)){setError('Enter your email address.');return;}
  mutex.current=true;setBusy(true);setError('');setNotice('');const token=epoch.current;
  try{
   if(mode==='reset'){
    // Same-origin fixed path. Supabase verifies the email link; no staff lookup leaks account membership.
    const r=await supabase.auth.resetPasswordForEmail(address,{redirectTo:new URL('/reset-password',window.location.origin).href});
    if(r.error)throw r.error;
    if(mounted.current&&epoch.current===token)setNotice('If this email has an account, a password reset link has been requested. Check your inbox and spam folder. Open the newest link to continue.');
   }else{
    const r=await supabase.auth.signInWithPassword({email:address,password});if(r.error)throw r.error;
   }
  }catch{if(mounted.current&&epoch.current===token)setError(mode==='reset'?'The reset request could not be confirmed. Please wait before trying again.':'Unable to sign in. Check your email and password and try again.');}
  finally{mutex.current=false;if(mounted.current&&epoch.current===token)setBusy(false);}
 }
 return <main className="min-h-screen bg-[#f5f8f7] text-slate-900 lg:grid lg:grid-cols-[1.05fr_.95fr]">
  <aside className="relative hidden min-h-screen overflow-hidden bg-[#0b263c] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
   <div aria-hidden="true" className="absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full border border-white/10 shadow-[0_0_0_40px_rgba(255,255,255,.025),0_0_0_90px_rgba(255,255,255,.02)]"/>
   <div className="relative z-10 flex items-center gap-3"><img src="/logo.png" alt="MatMove" className="h-14 w-14 rounded-2xl bg-white object-contain p-1"/><div><p className="text-xl font-black">MatMove</p><p className="text-[9px] font-bold uppercase tracking-[.2em] text-emerald-200">Operations console</p></div></div>
   <div className="relative z-10 mx-auto w-full max-w-xl py-10">
    <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-200/10 px-3 py-2 text-[10px] font-black uppercase tracking-[.18em] text-emerald-100">Sierra Leone · Operations</p>
    <h1 className="mt-5 text-4xl font-black leading-tight xl:text-5xl">Keep every part of MatMove moving.</h1>
    <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">Your workspace for customer support, operations, communications and platform administration.</p>
    <div className="mt-9 overflow-hidden rounded-[2rem] border border-white/15 bg-[#102e45] p-4 shadow-2xl">
     <div className="flex items-center justify-between"><span className="text-[10px] font-black tracking-[.2em] text-emerald-200">FREETOWN ROUTE PREVIEW</span><span className="flex items-center gap-1.5 text-[10px] text-slate-300"><i className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"/> LIVE DESIGN PREVIEW</span></div>
     <svg viewBox="0 0 520 220" className="mt-3 h-auto w-full" aria-hidden="true">
      <path d="M-10 180 C62 145 80 198 150 153 S245 54 310 106 S405 171 530 36" fill="none" stroke="#1c5364" strokeWidth="26" strokeLinecap="round"/>
      <path d="M-10 180 C62 145 80 198 150 153 S245 54 310 106 S405 171 530 36" fill="none" stroke="#a7f3d0" strokeWidth="2.5" strokeDasharray="8 10" strokeLinecap="round"/>
      <g fill="#a7f3d0" stroke="#0b263c" strokeWidth="4"><circle cx="36" cy="173" r="7"/><circle cx="310" cy="106" r="7"/><circle cx="475" cy="70" r="7"/></g>
      <g transform="translate(-17 -11)"><rect x="-14" y="-7" width="28" height="14" rx="5" fill="#a7f3d0"/><path d="M-8 -7L-4 -12H6L10 -7" fill="#d1fae5"/><circle cx="-8" cy="8" r="3" fill="#082f49"/><circle cx="8" cy="8" r="3" fill="#082f49"/><animateMotion dur="7s" repeatCount="indefinite" rotate="auto" path="M36 173 C62 145 80 198 150 153 S245 54 310 106 S405 171 475 70"/></g>
     </svg>
     <div className="flex items-center justify-between text-[10px] text-slate-300"><span>Aberdeen · Lumley</span><span className="text-emerald-200">Central Freetown</span></div>
     <p className="mt-2 text-[9px] text-slate-500">Illustrative route · not live tracking</p>
    </div>
   </div>
   <p className="relative z-10 text-xs text-slate-500">© 2026 MatMove · Authorized staff workspace</p>
  </aside>
  <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 sm:px-8">
   <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-emerald-100 blur-3xl"/>
   <div className="relative z-10 w-full max-w-md">
    <div className="mb-8 flex items-center gap-3 lg:hidden"><img src="/logo.png" alt="MatMove" className="h-12 w-12 rounded-xl bg-white object-contain p-1"/><div><p className="font-black">MatMove Admin</p><p className="text-[9px] font-bold uppercase tracking-[.18em] text-emerald-700">Operations console</p></div></div>
    <div className="mb-7 overflow-hidden rounded-2xl border border-slate-200 bg-[#0b263c] p-3 lg:hidden">
     <svg viewBox="0 0 520 90" className="h-20 w-full" aria-hidden="true"><path d="M-10 70 C62 35 80 88 150 53 S245 4 310 36 S405 61 530 6" fill="none" stroke="#1c5364" strokeWidth="18" strokeLinecap="round"/><path d="M-10 70 C62 35 80 88 150 53 S245 4 310 36 S405 61 530 6" fill="none" stroke="#a7f3d0" strokeWidth="2" strokeDasharray="7 9"/><g transform="translate(-12 -8)"><rect x="-10" y="-5" width="20" height="10" rx="4" fill="#a7f3d0"/><animateMotion dur="6s" repeatCount="indefinite" rotate="auto" path="M30 68 C62 35 80 88 150 53 S245 4 310 36 S405 61 490 20"/></g></svg>
    </div>
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,45,68,.1)] sm:p-9">
     <div className="mb-7"><p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-700">Staff access</p><h2 className="mt-2 text-3xl font-black tracking-tight">{mode==='reset'?'Reset your password':'Welcome back'}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{mode==='reset'?'We’ll send a secure link to your staff email.':'Sign in to your assigned MatMove Admin workspace.'}</p></div>
     {error&&<p role="alert" className="mb-4 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{notice&&<p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
     <form onSubmit={submit} className="space-y-4">
      <label className="block text-xs font-bold text-slate-700">Email address<div className="relative mt-2"><Mail size={17} className="pointer-events-none absolute left-3.5 top-3.5 text-slate-400"/><input type="email" autoComplete="username" required disabled={busy} value={email} onChange={e=>{setEmail(e.target.value);setNotice('');}} placeholder="staff@matmove.com" className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-3 text-base outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100"/></div></label>
      {mode==='login'&&<label className="block text-xs font-bold text-slate-700">Password<div className="relative mt-2"><Lock size={17} className="pointer-events-none absolute left-3.5 top-3.5 text-slate-400"/><input type="password" autoComplete="current-password" required disabled={busy} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password" className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-3 text-base outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100"/></div></label>}
      <button type="submit" disabled={busy||!!notice} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#1554a0] p-3 font-bold text-white transition hover:bg-[#10427f] disabled:opacity-60">{busy?<><Loader2 size={18} className="mr-2 animate-spin"/>Please wait…</>:mode==='reset'?'Send reset link':'Sign in to Admin'}</button>
     </form>
     <button type="button" disabled={busy} onClick={()=>changeMode(mode==='reset'?'login':'reset')} className="mt-4 min-h-11 w-full text-sm font-bold text-emerald-700 hover:text-emerald-800">{mode==='reset'?'Back to sign in':'Forgot password?'}</button>
     <p className="mt-5 border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-500">Only active staff can access Admin. Resetting a password does not change permissions or restore removed staff access.</p>
    </div>
   </div>
  </section>
 </main>;
