
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
 return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><section className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"><header className="bg-slate-900 px-6 py-7 text-center"><img src="/logo.png" alt="MatMove logo" width="144" height="144" className="mx-auto mb-4 h-36 w-36 rounded-2xl bg-white object-contain"/><h1 className="text-2xl font-bold text-white">{mode==='reset'?'Reset your Admin password':'MatMove Admin'}</h1><p className="mt-2 text-sm text-slate-300">{mode==='reset'?'We will email you a link to choose a new password.':'Sign in to your assigned Admin workspace.'}</p></header><div className="p-6 sm:p-8">
 {error&&<p role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice&&<p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
 <form onSubmit={submit} className="space-y-5"><label className="block text-sm font-semibold text-slate-700">Email address<div className="relative mt-2"><Mail size={18} className="pointer-events-none absolute left-3 top-3.5 text-slate-400"/><input type="email" autoComplete="username" required disabled={busy} value={email} onChange={e=>{setEmail(e.target.value);setNotice('');}} className="min-h-11 w-full rounded-lg border py-3 pl-10 pr-3 text-base"/></div></label>
 {mode==='login'&&<label className="block text-sm font-semibold text-slate-700">Password<div className="relative mt-2"><Lock size={18} className="pointer-events-none absolute left-3 top-3.5 text-slate-400"/><input type="password" autoComplete="current-password" required disabled={busy} value={password} onChange={e=>setPassword(e.target.value)} className="min-h-11 w-full rounded-lg border py-3 pl-10 pr-3 text-base"/></div></label>}
 <button type="submit" disabled={busy||!!notice} className="flex min-h-11 w-full items-center justify-center rounded-lg bg-indigo-700 p-3 font-bold text-white disabled:opacity-60">{busy?<><Loader2 size={18} className="mr-2 animate-spin"/>Please wait…</>:mode==='reset'?'Send reset link':'Secure Login'}</button></form>
 <button type="button" disabled={busy} onClick={()=>changeMode(mode==='reset'?'login':'reset')} className="mt-4 min-h-11 w-full text-sm font-bold text-indigo-700">{mode==='reset'?'Back to sign in':'Forgot password?'}</button><p className="mt-3 text-xs leading-relaxed text-slate-500">Only active staff can access Admin. Resetting a password does not change permissions or restore removed staff access.</p></div></section></main>;
}
