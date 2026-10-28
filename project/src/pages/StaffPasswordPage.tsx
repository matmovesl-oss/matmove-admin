
import {useEffect,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {loadAdminSession} from '@/lib/adminSession';
export default function StaffPasswordPage({onComplete,userId,mode='invite'}:{onComplete:()=>void|Promise<void>;userId?:string;mode?:'invite'|'recovery'}){
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const mounted=useRef(true),mutex=useRef(false),actor=useRef(userId);actor.current=userId;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function verified(expected?:string){
  const s=await supabase.auth.getSession();if(s.error||!s.data.session||expected&&s.data.session.user.id!==expected)throw new Error('Your sign-in changed or expired. Open the newest email link again.');
  const identity=await supabase.auth.getUser();if(identity.error||identity.data.user?.id!==s.data.session.user.id)throw new Error('Your sign-in could not be verified. Open the newest email link again.');
  const access=await loadAdminSession(supabase,s.data.session);if(!access?.is_active)throw new Error('Active Admin staff access is required. Contact the owner.');
  return {id:s.data.session.user.id,access};
 }
 async function save(e:React.FormEvent){
  e.preventDefault();if(mutex.current)return;if(!saved&&(password.length<12||password.length>128||password!==confirm)){setError('Use 12–128 characters and enter the same password twice.');return;}
  mutex.current=true;setBusy(true);setError('');const expected=actor.current;
  try{
   const current=await verified(expected);if(!mounted.current||actor.current!==expected)return;
   if(!saved){const changed=await supabase.auth.updateUser({password});if(changed.error)throw new Error('The new password could not be confirmed. Open a fresh reset link if it has expired.');if(!mounted.current||actor.current!==expected)return;setPassword('');setConfirm('');setSaved(true);}
   const after=await verified(current.id);if(!mounted.current||actor.current!==expected)return;
   if(after.access.requires_password_setup){const done=await supabase.rpc('matmove_staff_finish_setup');if(done.error)throw new Error('Your password was saved, but staff setup needs another check. Select Continue.');}
   await verified(current.id);if(mounted.current&&actor.current===expected)await onComplete();
  }catch(e){if(mounted.current&&actor.current===expected)setError(e instanceof Error?e.message:'Unable to complete password setup.');}
  finally{mutex.current=false;if(mounted.current&&actor.current===expected)setBusy(false);}
 }
 async function signOut(){if(mutex.current)return;mutex.current=true;setBusy(true);try{const r=await supabase.auth.signOut({scope:'local'});if(r.error)throw r.error;}catch{if(mounted.current)setError('Sign out was not confirmed. Try again.');}finally{mutex.current=false;if(mounted.current)setBusy(false);}}
 return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5"><form onSubmit={save} className="w-full max-w-md space-y-4 rounded-2xl border bg-white p-6 shadow-lg"><img src="/logo.png" alt="MatMove logo" width="112" height="112" className="mx-auto h-28 w-28 rounded-xl object-contain"/><h1 className="text-2xl font-bold">{mode==='recovery'?'Choose a new Admin password':'Set your MatMove staff password'}</h1><p className="text-sm text-slate-600">{saved?'Your password was saved. Continue to recheck your staff access.':'Use at least 12 characters. Your staff permissions will be checked before opening Admin.'}</p>{error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
 {!saved&&<><label className="block">New password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" disabled={busy} value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full rounded-lg border p-3 text-base"/></label><label className="block">Confirm password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" disabled={busy} value={confirm} onChange={e=>setConfirm(e.target.value)} className="mt-1 w-full rounded-lg border p-3 text-base"/></label></>}
 <button type="submit" disabled={busy} className="min-h-11 w-full rounded-lg bg-indigo-700 p-3 font-bold text-white disabled:opacity-50">{busy?'Checking…':saved?'Continue to Admin':'Save password and continue'}</button><button type="button" disabled={busy} onClick={()=>void signOut()} className="min-h-11 w-full rounded-lg border p-3">Sign out</button></form></main>;
}
