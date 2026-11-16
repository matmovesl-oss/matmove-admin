
import {useEffect,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {loadAdminSession} from '@/lib/adminSession';

const ADMIN_PASSWORD_SYMBOLS = "!@#$%^&*()_+-=[]{};:\"|<>?,./" + String.fromCharCode(39, 92, 96) + "~";
export function staffPasswordRequirements(value:string){
 return [
  {label:'At least 12 characters (maximum 128)',met:value.length>=12&&value.length<=128},
  {label:'At least one lowercase letter',met:/[a-z]/.test(value)},
  {label:'At least one uppercase letter',met:/[A-Z]/.test(value)},
  {label:'At least one number',met:/[0-9]/.test(value)},
  {label:'At least one symbol, such as ! or @',met:[...value].some(character=>ADMIN_PASSWORD_SYMBOLS.includes(character))}
 ];
}
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
  e.preventDefault();if(mutex.current)return;const requirements=staffPasswordRequirements(password);if(!saved&&!requirements.every(rule=>rule.met)){setError('Your password must be 12–128 characters and include at least one lowercase letter, one uppercase letter, one number and one symbol. A 12-digit-only password is not accepted.');return;}if(!saved&&password!==confirm){setError('The two passwords do not match. Enter the same password in both fields.');return;}
  mutex.current=true;setBusy(true);setError('');const expected=actor.current;
  try{
   const current=await verified(expected);if(!mounted.current||actor.current!==expected)return;
   if(!saved){const changed=await supabase.auth.updateUser({password});if(changed.error){const authError=changed.error as {status?:number;message?:string};if(authError.status===422||/password.*(character|each|strength|weak|required)/i.test(authError.message||''))throw new Error('Supabase rejected this password. Use 12–128 characters with lowercase, uppercase, a number and a symbol. A 12-digit-only password is not accepted.');throw new Error('The password could not be saved. Your session is still protected. If this email link was already used or has expired, ask the Admin owner to send a fresh login email.');}if(!mounted.current||actor.current!==expected)return;setPassword('');setConfirm('');setSaved(true);}
   const after=await verified(current.id);if(!mounted.current||actor.current!==expected)return;
   if(after.access.requires_password_setup){const done=await supabase.rpc('matmove_staff_finish_setup');if(done.error)throw new Error('Your password was saved, but staff setup needs another check. Select Continue.');}
   await verified(current.id);if(mounted.current&&actor.current===expected)await onComplete();
  }catch(e){if(mounted.current&&actor.current===expected)setError(e instanceof Error?e.message:'Unable to complete password setup.');}
  finally{mutex.current=false;if(mounted.current&&actor.current===expected)setBusy(false);}
 }
 async function signOut(){if(mutex.current)return;mutex.current=true;setBusy(true);try{const r=await supabase.auth.signOut({scope:'local'});if(r.error)throw r.error;}catch{if(mounted.current)setError('Sign out was not confirmed. Try again.');}finally{mutex.current=false;if(mounted.current)setBusy(false);}}
 return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5"><form onSubmit={save} className="w-full max-w-md space-y-4 rounded-2xl border bg-white p-6 shadow-lg"><img src="/logo.png" alt="MatMove logo" width="112" height="112" className="mx-auto h-28 w-28 rounded-xl object-contain"/><h1 className="text-2xl font-bold">{mode==='recovery'?'Choose a new Admin password':'Set your MatMove staff password'}</h1><p className="text-sm text-slate-600">{saved?'Your password was saved. Continue to recheck your staff access.':'Use at least 12 characters. Your staff permissions will be checked before opening Admin.'}</p>{error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
 {!saved&&<><label className="block">New password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" disabled={busy} value={password} onChange={e=>{setPassword(e.target.value);if(error)setError('');}} className="mt-1 w-full rounded-lg border p-3 text-base"/></label><div role="group" aria-label="Admin password requirements" aria-live="polite" className="rounded-xl border bg-slate-50 p-3"><p className="text-sm font-semibold text-slate-800">Password requirements</p><ul className="mt-2 space-y-1 text-sm">{staffPasswordRequirements(password).map(rule=><li key={rule.label} className={rule.met?'text-emerald-700':'text-slate-600'}><span aria-hidden="true">{rule.met?'✓':'○'}</span> <span className="ml-1">{rule.label}</span></li>)}</ul><p className="mt-2 text-xs text-slate-600">A password made up of 12 numbers only will fail Supabase security checks. Use a unique password that you do not share with anyone.</p></div><label className="block">Confirm password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" disabled={busy} value={confirm} onChange={e=>{setConfirm(e.target.value);if(error)setError('');}} className="mt-1 w-full rounded-lg border p-3 text-base"/></label></>}
 <button type="submit" disabled={busy} className="min-h-11 w-full rounded-lg bg-indigo-700 p-3 font-bold text-white disabled:opacity-50">{busy?'Checking…':saved?'Continue to Admin':'Save password and continue'}</button><button type="button" disabled={busy} onClick={()=>void signOut()} className="min-h-11 w-full rounded-lg border p-3">Sign out</button></form></main>;
}
