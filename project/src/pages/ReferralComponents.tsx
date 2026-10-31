
import {exportCompleteCsv} from '@/lib/csvExport';

import { useEffect, useState, useRef, useCallback } from 'react';
import {useAdminAccess,canAccess} from '@/lib/adminAccess';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';

type Row = {
  id: string;
  user_id: string;
  currency: string;
  balance: number;
  is_frozen: boolean;
  monime_account_id?: string | null;
  metadata: {
    monime_account_id?: string;
  } | null;
  profiles: {
    full_name?: string;
    phone?: string;
    email?: string;
    role?: string;
  } | null;
};

type Account = {
  id: string;
  currency: string;
  balance?: {
    available?: {
      currency: string;
      value: number;
    };
  };
};

type Platform = {
  escrowAccountId: string | null;
  feeAccountId: string | null;
  spinAccountId: string | null;
  referralAccountId: string | null;
  mainAccountId: string | null;
  businessAccountIds: string[];
};

const emptyPlatform: Platform = {
  escrowAccountId: null,
  feeAccountId: null,
  spinAccountId: null,
  referralAccountId: null,
  mainAccountId: null,
  businessAccountIds: [],
};

const money = (value: number, currency: string) =>
  `${currency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const accountId = (wallet: Row) =>
  wallet.monime_account_id ||
  wallet.metadata?.monime_account_id ||
  '';

const availableBalance = (
  account?: Account
): number | null => {
  const amount = account?.balance?.available;

  return amount &&
    amount.currency === account?.currency &&
    Number.isSafeInteger(amount.value) &&
    amount.value >= 0
    ? amount.value / 100
    : null;
};

export function referralDisplayMoney(v:string){if(!unsigned(v))throw new Error('Invalid referral amount.');const n=BigInt(v),fraction=n%100n;return `SLE ${(n/100n).toLocaleString('en-US')}${fraction?'.'+fraction.toString().padStart(2,'0'):''}`;}
export function referralBudget(v:string){if(!/^\d+(\.\d{1,2})?$/.test(v.trim()))throw new Error('Enter a budget with up to two decimal places.');const [a,b='']=v.trim().split('.'),n=BigInt(a)*100n+BigInt(b.padEnd(2,'0'));if(n>9000000000000000n)throw new Error('Budget is too large.');return n.toString();}
export function validateReferralOverview(v:any,actor:string):ReferralOverview{
 if(v?.actor!==actor||typeof v.owner!=='boolean'||typeof v.activationReady!=='boolean'||!unsigned(v.campaign?.revision)||!unsigned(v.campaign.budgetMinor)||typeof v.campaign.accepting!=='boolean'||typeof v.campaign.payments!=='boolean'||!['referrals','pendingMinor','creditedMinor','reviewMinor','budgetUsedMinor','reservedMinor'].every(k=>unsigned(v.totals?.[k]))||!(v.treasury===null&&typeof v.treasuryError==='string'||v.treasury?.currency==='SLE'&&unsigned(v.treasury.availableMinor)&&/^fac-[A-Za-z0-9_-]+$/.test(v.treasury.accountId)&&Number.isFinite(Date.parse(v.treasury.observedAt))))throw new Error('Referral overview was not confirmed.');return v;
}
export function validateReferralPage(v:any,actor:string){
 if(v?.actor!==actor||!Array.isArray(v.rows)||v.rows.length>50||JSON.stringify(v.columns)!==JSON.stringify(referralFields)||typeof v.complete!=='boolean'||!Number.isFinite(Date.parse(v.cutoff))||!(v.nextCursor===null||typeof v.nextCursor==='string'&&v.nextCursor.length>0)||v.complete!==(v.nextCursor===null))throw new Error('Referral report page was not confirmed.');
 const ids=new Set();for(const row of v.rows){if(!row||typeof row.id!=='string'||ids.has(row.id)||Object.keys(row).some(k=>!referralFields.includes(k))||row.amount_minor!=='100'||row.currency!=='SLE'||!['pending','processing','completed','review_required','failed'].includes(row.state))throw new Error('Referral records were not confirmed.');ids.add(row.id);}return v;
}
export function ReferralAdminPanel({onSource}:{onSource?:(id:string|null)=>void}={}){
 const access=useAdminAccess(),allowed=canAccess(access,'financials'),actor=access?.id||'',stamp=JSON.stringify([actor,allowed,access?.is_active,access?.is_owner,access?.permissions]);
 const current=useRef(stamp);current.current=stamp;const live=useRef(false),mutex=useRef(false),abort=useRef<AbortController|null>(null);
 const [exporting,setExporting]=useState(false);
 const [overview,setOverview]=useState<ReferralOverview|null>(null),[rows,setRows]=useState<Record<string,string|null>[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[state,setState]=useState('all'),[more,setMore]=useState(false),[progress,setProgress]=useState(0);
 const [budget,setBudget]=useState('0'),[accepting,setAccepting]=useState(false),[payments,setPayments]=useState(false),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[retained,setRetained]=useState<any>(null),[loaded,setLoaded]=useState('');
 const valid=()=>live.current&&current.current===stamp;
 const request=useCallback(async(view:string,options:{method?:string;body?:string;signal?:AbortSignal;cursor?:string;state?:string}={})=>{
  const before=await supabase.auth.getSession();if(before.error||before.data.session?.user.id!==actor||!live.current||current.current!==stamp)throw new Error('Your sign-in changed. Reopen Financial & Wallets.');
  const q=new URLSearchParams({view,actor});if(options.state)q.set('state',options.state);if(options.cursor)q.set('cursor',options.cursor);
  const r=await fetch(`/api/admin-staff?${q}`,{method:options.method||'GET',body:options.body,signal:options.signal,cache:'no-store',headers:{Authorization:`Bearer ${before.data.session.access_token}`,'Content-Type':'application/json'}}),b=await r.json();
  const after=await supabase.auth.getSession();if(after.error||after.data.session?.user.id!==actor||!live.current||current.current!==stamp||options.signal?.aborted)throw new Error('Your sign-in changed or this request was cancelled.');if(!r.ok)throw new Error(b.error||'Referral request was not confirmed.');return b;
 },[stamp,actor]);
 const reload=useCallback(async()=>{
  if(!allowed||mutex.current)return;mutex.current=true;setLoading(true);setError('');setOverview(null);setRows([]);const control=new AbortController();abort.current=control;
  try{const [a,p]=await Promise.all([request('referral-overview',{signal:control.signal}),request('referral-page',{state,signal:control.signal})]);const v=validateReferralOverview(a,actor),page=validateReferralPage(p,actor);if(live.current&&current.current===stamp){setOverview(v);onSource?.(v.treasury?.accountId||v.campaign.source||null);setRows(page.rows);setMore(!page.complete);setLoaded(stamp);setBudget((BigInt(v.campaign.budgetMinor)/100n).toString()+'.'+(BigInt(v.campaign.budgetMinor)%100n).toString().padStart(2,'0'));setAccepting(v.campaign.accepting);setPayments(v.campaign.payments);setConfirmed(false);}}
  catch(e:any){if(live.current&&current.current===stamp){setError(e.message||'Referral information is unavailable.');setLoaded(stamp);}}
  finally{if(live.current&&current.current===stamp){setLoading(false);mutex.current=false;}}
 },[request,state,stamp,actor,allowed]);
 useEffect(()=>{live.current=true;mutex.current=false;setOverview(null);setRows([]);setNotice('');setRetained(null);setBusy(false);try{const raw=localStorage.getItem(`matmove-referral-settings:${actor}`);if(raw){const v=JSON.parse(raw);if(v.actor!==actor||!v.body||!/^[-a-f0-9]{36}$/i.test(v.body.requestId||'')||!unsigned(v.body.expectedRevision)||!unsigned(v.body.budgetMinor)||typeof v.body.accepting!=='boolean'||typeof v.body.payments!=='boolean'||typeof v.body.reason!=='string'||v.body.reason.length<3||v.body.reason.length>500||v.body.confirmed!==true||Object.keys(v.body).some(k=>!['requestId','expectedRevision','accepting','payments','budgetMinor','reason','confirmed'].includes(k)))throw Error();setRetained(v.body);}}catch{setRetained({blocked:true});}void reload();return()=>{live.current=false;abort.current?.abort();};},[stamp,reload]);
 async function save(retry=false){
  if(!allowed||!access?.is_owner||mutex.current)return;mutex.current=true;setBusy(true);setError('');setNotice('');
  try{
   let body=retained;
   if(retry){if(!body||body.blocked)throw new Error('The retained settings request could not be read. Contact support before replacing it.');}
   else{if(retained)throw new Error('Resolve the saved settings request first.');if(!overview||!confirmed||reason.trim().length<3)throw new Error('Review the loaded settings, enter a reason and confirm the change.');body={requestId:crypto.randomUUID(),expectedRevision:overview.campaign.revision,accepting,payments,budgetMinor:referralBudget(budget),reason:reason.trim(),confirmed:true};const serialized=JSON.stringify({actor,body});try{localStorage.setItem(`matmove-referral-settings:${actor}`,serialized);if(localStorage.getItem(`matmove-referral-settings:${actor}`)!==serialized)throw Error();}catch{throw new Error('Allow browser storage before saving campaign settings.');}setRetained(body);}
   const receipt=await request('referral-settings',{method:'POST',body:JSON.stringify(body)});
   if(receipt.actor!==actor||receipt.requestId!==body.requestId||receipt.saved!==true||receipt.revision!==(BigInt(body.expectedRevision)+1n).toString())throw new Error('The save receipt was not confirmed. Retry the same saved request.');
   if(!valid())return;localStorage.removeItem(`matmove-referral-settings:${actor}`);setRetained(null);setNotice('Campaign settings saved. Reloaded settings determine the current state.');setReason('');mutex.current=false;await reload();
  }catch(e:any){if(valid())setError(e.message||'Settings were not confirmed. Retry the same saved request.');}
  finally{if(valid()){mutex.current=false;setBusy(false);}}
 }
 async function download(){
  if(!allowed||mutex.current)return;mutex.current=true;setBusy(true);setExporting(true);setError('');setProgress(0);const control=new AbortController();abort.current=control;
  try{const all:Record<string,string|number|boolean|null>[]=[],seen=new Set(),cursors=new Set();let cursor:string|undefined,cutoff='';
   for(;;){const p=validateReferralPage(await request('referral-page',{state,cursor,signal:control.signal}),actor);if(cutoff&&p.cutoff!==cutoff)throw new Error('Report cutoff changed. Restart the export.');cutoff=p.cutoff;for(const row of p.rows){if(seen.has(row.id))throw new Error('A report page repeated. No CSV was downloaded.');seen.add(row.id);all.push(row);}if(!valid()||control.signal.aborted)return;setProgress(all.length);if(p.complete)break;if(!p.rows.length||cursors.has(p.nextCursor))throw new Error('Report continuation repeated.');cursors.add(p.nextCursor);cursor=p.nextCursor;}
   await exportCompleteCsv({userId:actor,section:'financials',filename:`matmove-referral-${state}`,signal:control.signal,isCurrent:valid,report:{actor,report:'referrals',columns:referralFields,rows:all,cutoff,complete:true,note:'Referral reward history. Amounts are SLE cents; only completed receipts count as credited.'}});if(valid())setNotice(`Exported ${all.length.toLocaleString('en-US')} reward records.`);
  }catch(e:any){if(valid())setError(control.signal.aborted?'Export cancelled. No complete CSV was downloaded.':e.message||'Export failed. No complete CSV was downloaded.');}
  finally{if(valid()){mutex.current=false;setBusy(false);setExporting(false);}}
 }
 if(!allowed)return null;
 const data=loaded===stamp?overview:null;
 return <section aria-label="Referral campaign" className="mb-6 rounded-2xl border border-emerald-200 bg-white p-5"><h2 className="text-xl font-bold">Invite & Earn — referral campaign</h2><p className="mt-2 text-sm text-slate-600">Each qualified referral has two separate SLE 1 rewards. Pending records are not wallet credits. This account is separate from Games and Escrow.</p>
 {loading&&<p role="status" className="mt-4">Loading referral information…</p>}{error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}{notice&&<p role="status" className="mt-3 text-emerald-800">{notice}</p>}
 <button type="button" disabled={busy||loading} onClick={()=>void reload()} className="mt-3 min-h-11 rounded-lg border px-4 font-bold">Reload referrals</button>
 {data&&<><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><p>Live referral account</p><strong>{data.treasury?referralDisplayMoney(data.treasury.availableMinor):'Unavailable — retry'}</strong><p className="break-all text-xs">{data.treasury?.accountId||''}</p>{data.treasuryError&&<p className="text-xs text-red-700">{data.treasuryError}</p>}</div><div className="rounded-xl bg-amber-50 p-3"><p>Pending rewards</p><strong>{referralDisplayMoney(data.totals.pendingMinor)}</strong><p className="text-xs">Reserved: {referralDisplayMoney(data.totals.reservedMinor)}</p></div><div className="rounded-xl bg-emerald-50 p-3"><p>Confirmed credited rewards</p><strong>{referralDisplayMoney(data.totals.creditedMinor)}</strong><p className="text-xs">Needs review: {referralDisplayMoney(data.totals.reviewMinor)}</p></div></div><p className="mt-3 text-sm">Referrals: {BigInt(data.totals.referrals).toLocaleString('en-US')} · Registration {data.campaign.accepting?'open':'paused'} · Payments {data.campaign.payments?'enabled':'paused'} · Budget reserved so far: {referralDisplayMoney(data.totals.budgetUsedMinor)}</p>
 {data.owner&&<fieldset disabled={busy||!!retained} className="mt-4 space-y-3 rounded-xl border p-4"><legend className="px-2 font-bold">Owner campaign controls</legend><label className="block">Campaign budget (SLE)<input aria-label="Referral budget" value={budget} onChange={e=>{setBudget(e.target.value);setConfirmed(false);}} inputMode="decimal" className="mt-1 w-full rounded-lg border p-3"/></label><label className="flex items-center gap-2"><input type="checkbox" checked={accepting} disabled={!data.activationReady&&!accepting} onChange={e=>{setAccepting(e.target.checked);if(!e.target.checked)setPayments(false);setConfirmed(false);}}/>Accept new referral codes</label><label className="flex items-center gap-2"><input type="checkbox" checked={payments} disabled={!accepting||!data.activationReady&&!payments} onChange={e=>{setPayments(e.target.checked);setConfirmed(false);}}/>Process qualified reward payments</label>{!data.activationReady&&<p className="text-sm text-amber-800">Activation is locked until final server and scheduling setup. You can save a budget or pause the campaign.</p>}<label className="block">Reason<input aria-label="Campaign change reason" maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);setConfirmed(false);}} className="mt-1 w-full rounded-lg border p-3"/></label><label className="flex items-center gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed the budget and campaign switches.</label><button type="button" disabled={!confirmed} onClick={()=>void save()} className="min-h-11 rounded-lg bg-slate-900 px-4 font-bold text-white disabled:opacity-50">Save reviewed settings</button></fieldset>}
 {data.owner&&<ReferralReceiptRecovery key={actor} onRecorded={()=>void reload()} />}
 <div className="mt-5 flex flex-wrap items-center gap-3"><label>Reward state<select aria-label="Referral reward state" disabled={busy} value={state} onChange={e=>setState(e.target.value)} className="ml-2 rounded-lg border p-2">{['all','pending','processing','completed','review_required','failed'].map(v=><option key={v} value={v}>{v}</option>)}</select></label><button type="button" disabled={busy||loading} onClick={()=>void download()} className="min-h-11 rounded-lg border px-4 font-bold">Export full referral CSV</button>{exporting&&<button type="button" onClick={()=>abort.current?.abort()} className="min-h-11 rounded-lg border px-3">Cancel report read</button>}</div>{busy&&progress>0&&<p role="status">{progress.toLocaleString('en-US')} records loaded…</p>}
 <p className="mt-3 text-xs text-slate-500">Showing the first {rows.length} reward records for this filter{more?'; use Export full referral CSV for all pages.':'.'} Report states reflect when each page is read.</p><div className="mt-2 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr>{['New customer','Inviter','Beneficiary','Reward','State'].map(v=><th key={v} className="p-2">{v}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-t"><td className="p-2">{row.new_user_email||'Email unavailable'}<span className="block text-xs text-slate-500">{row.code}</span></td><td className="p-2">{row.inviter_email||'Email unavailable'}</td><td className="p-2">{row.beneficiary_email||'Email unavailable'}</td><td className="p-2">{referralDisplayMoney(row.amount_minor!)}{data.owner&&<span className="block max-w-xs break-all font-mono text-xs text-slate-500">{row.id}</span>}</td><td className="p-2">{row.state}</td></tr>)}</tbody></table></div>{!rows.length&&<p className="mt-3 text-sm">No reward records match this completed read.</p>}</>}
 {retained&&access?.is_owner&&<div className="mt-4 rounded-xl bg-amber-50 p-4"><p>A saved settings request needs confirmation. It will not be sent automatically.</p>{!retained.blocked&&<p className="mt-2 text-sm">Budget: {referralDisplayMoney(retained.budgetMinor)} · Registration: {retained.accepting?'open':'paused'} · Payments: {retained.payments?'enabled':'paused'}. Reason: {retained.reason}</p>}{!retained.blocked&&<button type="button" disabled={busy||loading} onClick={()=>void save(true)} className="mt-2 min-h-11 rounded-lg border px-4 font-bold">Retry original settings request</button>}</div>}
 </section>;
}

type RecoveryPreview={actor:string;rewardId:string;providerId:string;amountMinor:'100';currency:'SLE';sourceAccount:string;destinationAccount:string;kind:'inviter'|'new_user';rewardState:string;providerState:string;updatedAt:string};
const recoveryUuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const recoveryTransfer=(v:unknown):v is string=>typeof v==='string'&&/^trn-[A-Za-z0-9_-]+$/.test(v)&&v.length<=120;
export function validateRecoveryPreview(v:any,actor:string,reward:string,provider:string):RecoveryPreview{
 if(v?.actor!==actor||v.rewardId!==reward||v.providerId!==provider||!recoveryUuid(reward)||!recoveryTransfer(provider)||v.amountMinor!=='100'||v.currency!=='SLE'||!['inviter','new_user'].includes(v.kind)||!['pending','processing','completed','review_required','failed'].includes(v.rewardState)||!['pending','processing','completed','failed'].includes(v.providerState)||![v.sourceAccount,v.destinationAccount].every(id=>typeof id==='string'&&/^fac-[A-Za-z0-9_-]+$/.test(id))||v.sourceAccount===v.destinationAccount||!Number.isFinite(Date.parse(v.updatedAt)))throw new Error('The reviewed receipt could not be verified. Inspect the original receipt again.');return v;
}
export function ReferralReceiptRecovery({onRecorded}:{onRecorded?:()=>void}={}){
 const access=useAdminAccess(),allowed=canAccess(access,'financials')&&access?.is_owner===true,actor=access?.id||'',stamp=JSON.stringify([actor,allowed,access?.is_active,access?.permissions]);
 const current=useRef(stamp);current.current=stamp;const mounted=useRef(false),mutex=useRef(false),abort=useRef<AbortController|null>(null);
 const [reward,setReward]=useState(''),[provider,setProvider]=useState(''),[preview,setPreview]=useState<RecoveryPreview|null>(null),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[retained,setRetained]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const valid=()=>mounted.current&&current.current===stamp;
 const key=`matmove-referral-recovery:${actor}`;
 useEffect(()=>{
  mounted.current=true;mutex.current=false;setReward('');setProvider('');setPreview(null);setRetained(null);setReason('');setConfirmed(false);setBusy(false);setError('');setNotice('');
  if(allowed)try{const raw=localStorage.getItem(key);if(raw){const v=JSON.parse(raw),b=v.body;if(v.actor!==actor||!b||!recoveryUuid(b.requestId)||!recoveryUuid(b.rewardId)||!recoveryTransfer(b.providerId)||typeof b.expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(b.expectedUpdatedAt))||typeof b.reason!=='string'||b.reason.length<3||b.reason.length>500||b.confirmed!==true||Object.keys(b).some(k=>!['requestId','rewardId','providerId','expectedUpdatedAt','reason','confirmed'].includes(k)))throw Error();const p=validateRecoveryPreview(v.preview,actor,b.rewardId,b.providerId);if(p.updatedAt!==b.expectedUpdatedAt)throw Error();setRetained(b);setPreview(p);setReward(b.rewardId);setProvider(b.providerId);setReason(b.reason);}}
  catch{setRetained({blocked:true});setError('Your saved recovery request could not be read. Do not replace an uncertain request; contact support.');}
  return()=>{mounted.current=false;abort.current?.abort();};
 },[stamp,allowed,actor,key]);
 async function request(view:string,options:{body?:string;reward?:string;transfer?:string;signal?:AbortSignal}={}){
  const s=await supabase.auth.getSession();if(s.error||s.data.session?.user.id!==actor||!valid())throw new Error('Your sign-in changed. Reopen Financial & Wallets.');
  const q=new URLSearchParams({view,actor});if(options.reward)q.set('reward',options.reward);if(options.transfer)q.set('transfer',options.transfer);
  const r=await fetch(`/api/admin-staff?${q}`,{method:options.body?'POST':'GET',body:options.body,signal:options.signal,cache:'no-store',headers:{Authorization:`Bearer ${s.data.session.access_token}`,'Content-Type':'application/json'}}),b=await r.json();
  const after=await supabase.auth.getSession();if(after.error||after.data.session?.user.id!==actor||!valid()||options.signal?.aborted)throw new Error('Your sign-in changed or this read was cancelled.');if(!r.ok)throw new Error(b.error||'The original receipt could not be confirmed.');return b;
 }
 async function inspect(){
  if(!allowed||mutex.current||retained)return;mutex.current=true;setBusy(true);setError('');setNotice('');setPreview(null);setConfirmed(false);const r=reward.trim(),p=provider.trim(),control=new AbortController();abort.current=control;
  try{if(!recoveryUuid(r)||!recoveryTransfer(p))throw new Error('Enter a valid reward UUID and the original trn- transfer ID.');const v=validateRecoveryPreview(await request('referral-recovery',{reward:r,transfer:p,signal:control.signal}),actor,r,p);if(valid())setPreview(v);}
  catch(e:any){if(valid())setError(e.message||'The original transfer was not confirmed.');}
  finally{if(valid()){mutex.current=false;setBusy(false);}}
 }
 async function attach(retry=false){
  if(!allowed||mutex.current)return;mutex.current=true;setBusy(true);setError('');setNotice('');
  try{
   let body=retained;
   if(retry){if(!body||body.blocked)throw new Error('The original saved attachment is unavailable. Do not create another request.');}
   else{
    if(retained||!preview||preview.rewardId!==reward.trim()||preview.providerId!==provider.trim()||!confirmed||reason.trim().length<3)throw new Error('Inspect the exact original receipt, enter a reason and confirm the attachment.');
    body={requestId:crypto.randomUUID(),rewardId:preview.rewardId,providerId:preview.providerId,expectedUpdatedAt:preview.updatedAt,reason:reason.trim(),confirmed:true};
    const saved=JSON.stringify({actor,body,preview});try{localStorage.setItem(key,saved);if(localStorage.getItem(key)!==saved)throw Error();}catch{throw new Error('Allow browser storage before attaching a receipt.');}setRetained(body);
   }
   const receipt=await request('referral-recovery-save',{body:JSON.stringify(body)});
   if(receipt.actor!==actor||receipt.requestId!==body.requestId||receipt.rewardId!==body.rewardId||receipt.providerId!==body.providerId||receipt.recorded!==true||!['processing','completed','failed'].includes(receipt.state))throw new Error('The attachment receipt was not confirmed. Retry the original saved attachment.');
   if(!valid())return;localStorage.removeItem(key);setRetained(null);setPreview(null);setReason('');setConfirmed(false);setNotice(`Original transfer receipt recorded. Reward state: ${receipt.state}. No new transfer was sent.`);onRecorded?.();
  }catch(e:any){if(valid())setError(e.message||'Attachment was not confirmed. Retry the original saved request.');}
  finally{if(valid()){mutex.current=false;setBusy(false);}}
 }
 if(!allowed)return null;
 return <section aria-label="Referral receipt recovery" className="mt-4 rounded-xl border border-amber-200 p-4"><h3 className="font-bold">Recover an original reward receipt</h3><p className="mt-2 text-sm text-slate-600">Use this only for an existing reward transfer. Enter its reward ID and original Monime transfer ID, then review the exact SLE 1 receipt. This does not send another payment.</p>
 {error&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice&&<p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
 <fieldset disabled={busy||!!retained} className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block text-sm">Reward UUID<input aria-label="Recovery reward UUID" value={reward} maxLength={36} onChange={e=>{setReward(e.target.value);setPreview(null);setConfirmed(false);setNotice('');}} className="mt-1 w-full rounded-lg border p-3 font-mono text-sm"/></label><label className="block text-sm">Original Monime transfer ID<input aria-label="Original reward transfer ID" value={provider} maxLength={120} placeholder="trn-…" onChange={e=>{setProvider(e.target.value);setPreview(null);setConfirmed(false);setNotice('');}} className="mt-1 w-full rounded-lg border p-3 font-mono text-sm"/></label><button type="button" onClick={()=>void inspect()} className="min-h-11 rounded-lg border px-4 font-bold">Inspect original receipt</button></fieldset>
 {preview&&<div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm"><p className="font-bold">Reviewed amount: {referralDisplayMoney(preview.amountMinor)}</p><p className="mt-1 break-all">Reward: {preview.rewardId}</p><p className="break-all">Transfer: {preview.providerId}</p><p className="break-all">From: {preview.sourceAccount}</p><p className="break-all">To: {preview.destinationAccount}</p><p>Provider state: {preview.providerState} · Saved reward state: {preview.rewardState}</p><p className="mt-2">A pending or processing provider receipt remains pending. A failed receipt does not credit the customer.</p></div>}
 {preview&&!retained&&<fieldset disabled={busy} className="mt-3 space-y-3"><label className="block text-sm">Recovery reason<input aria-label="Receipt recovery reason" maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);setConfirmed(false);}} className="mt-1 w-full rounded-lg border p-3"/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed the original receipt, amount and destination.</label><button type="button" disabled={!confirmed} onClick={()=>void attach()} className="min-h-11 rounded-lg bg-slate-900 px-4 font-bold text-white disabled:opacity-50">Attach reviewed receipt</button></fieldset>}
 {retained&&!retained.blocked&&<div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm"><p>A saved attachment needs confirmation. It will not be submitted automatically.</p><p className="mt-2">Reason: {retained.reason}</p><button type="button" disabled={busy} onClick={()=>void attach(true)} className="mt-2 min-h-11 rounded-lg border px-4 font-bold">Retry original attachment</button></div>}{busy&&<p role="status" className="mt-2 text-sm">Checking the original reward receipt…</p>}
 </section>;
}

