
import {useEffect,useRef,useState,type ChangeEvent} from 'react';
import {supabase} from '@/lib/supabase';
import {useAdminAccess,canAccess} from '@/lib/adminAccess';
import AdminLayout from '@/components/AdminLayout';
import {matchPayrollCsv} from '@/lib/payrollCsv';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const account=(v:unknown):v is string=>typeof v==='string'&&/^fac-[A-Za-z0-9_-]+$/.test(v);
export function adminMoneyMinor(v:string){if(!/^\d{1,10}(\.\d{1,2})?$/.test(v))throw Error('Enter a positive SLE amount with up to two decimal places.');const [a,b='']=v.split('.');const n=BigInt(a)*100n+BigInt(b.padEnd(2,'0'));if(n<1n||n>1000000000000n)throw Error('Invalid amount.');return n;}
const display=(v:bigint)=>`SLE ${(v/100n).toLocaleString('en-US')}.${String(v%100n).padStart(2,'0')}`;
type Kind='payroll'|'refund';
type Recipient={id:string;full_name?:string;email?:string;phone?:string;role:string;is_payroll_staff?:boolean;wallets?:{id:string;currency:string;monime_account_id?:string;metadata?:{monime_account_id?:string};is_frozen?:boolean}[]};
type Payment={name:string;body:Record<string,string>};
function destination(r:Recipient){const w=r.wallets?.filter(w=>w.currency==='SLE');if(w?.length!==1||w[0].is_frozen||!account(w[0].monime_account_id||w[0].metadata?.monime_account_id))throw Error('Recipient needs one unfrozen, linked SLE wallet.');return w[0].monime_account_id||w[0].metadata!.monime_account_id!;}
export function validateMoneyDraft(v:any,actor:string,kind:Kind):Payment[]{
 if(!v||v.version!==1||v.actor!==actor||v.kind!==kind||!Array.isArray(v.items)||!v.items.length||v.items.length>500)throw Error('Saved payment review is invalid.');
 const keys=new Set(),people=new Set();
 for(const p of v.items){const b=p?.body,fields=kind==='payroll'?['staffUserId','requestKey','amount','reason']:['recipientUserId','recipientAccountId','requestKey','amount','reason'];
  if(typeof p.name!=='string'||p.name.length>200||!b||Object.keys(b).length!==fields.length||Object.keys(b).some(k=>!fields.includes(k))||!uuid(b.requestKey)||keys.has(b.requestKey)||!uuid(b.staffUserId||b.recipientUserId)||people.has(b.staffUserId||b.recipientUserId)||typeof b.reason!=='string'||b.reason!==b.reason.trim()||b.reason.length<3||b.reason.length>(kind==='payroll'?140:300)||typeof b.amount!=='string'||kind==='refund'&&!account(b.recipientAccountId))throw Error('Saved payment review is invalid.');
  adminMoneyMinor(b.amount);keys.add(b.requestKey);people.add(b.staffUserId||b.recipientUserId);
 }return v.items;
}
export default function AdminMoneyOperations({kind}:{kind:Kind}){
 const access=useAdminAccess(),actor=access?.id||'',allowed=canAccess(access,'special')||(kind==='refund'&&canAccess(access,'financials'));
 const stamp=JSON.stringify([kind,actor,allowed,access?.permissions,access?.is_active]);const current=useRef(stamp);current.current=stamp;
 const live=useRef(false),mutex=useRef(false),generation=useRef(0);const key=`matmove-admin-money:v2:${kind}:${actor}`,endpoint=kind==='payroll'?'/api/admin-pay-staff':'/api/admin-refund';
 const [balance,setBalance]=useState<any>(null),[rows,setRows]=useState<Recipient[]>([]),[history,setHistory]=useState<any[]>([]),[selected,setSelected]=useState<string[]>([]),[query,setQuery]=useState(''),[amount,setAmount]=useState(''),[amounts,setAmounts]=useState<Record<string,string>>({}),[reason,setReason]=useState(''),[review,setReview]=useState<Payment[]|null>(null),[pending,setPending]=useState<Payment[]|null>(null),[blocked,setBlocked]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[importNotice,setImportNotice]=useState('');
 const valid=(s=stamp)=>live.current&&current.current===s;
 async function session(){const r=await supabase.auth.getSession();if(!valid()||r.error||r.data.session?.user.id!==actor||!r.data.session.access_token)throw Error('Your signed-in account changed. Reopen this section.');return r.data.session;}
 async function call(view:string,body?:Record<string,string>){const s=stamp,auth=await session();if(!valid(s))throw Error('This view changed.');const r=await fetch(endpoint+(view?'?view='+view:''),{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+auth.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});const data=await r.json();await session();if(!valid(s))throw Error('This view changed.');if(!r.ok)throw Error(data.error||'Request was not confirmed. Retain the original request.');return data;}
 async function refresh(){if(!allowed)return;const n=++generation.current;setLoading(true);setError('');setBalance(null);setHistory([]);
  try{const [b,h]=await Promise.all([call('balance'),call('history')]);if(!valid()||n!==generation.current)return;if(b.actor!==actor||!account(b.accountId)||b.currency!=='SLE'||b.balance?.currency!=='SLE'||!Number.isSafeInteger(b.balance.value)||b.balance.value<0||typeof b.newPaymentsEnabled!=='boolean'||h.actor!==actor||!Array.isArray(h.rows)||h.rows.some((v:any)=>!uuid(v.id)||!uuid(v.request_key)||v.currency!=='SLE'||!/^\d{1,13}$/.test(String(v.amount_minor))||!['initiating','pending','processing','review_required','completed','failed'].includes(v.state)))throw Error('Money overview was not confirmed.');setBalance(b);setHistory(h.rows);}
  catch(e:any){if(valid()&&n===generation.current)setError(e.message);}finally{if(valid()&&n===generation.current)setLoading(false);}
 }
 useEffect(()=>{live.current=true;mutex.current=false;setRows([]);setSelected([]);setAmounts({});setReview(null);setPending(null);setBlocked(false);setBusy(false);setError('');setNotice('');setImportNotice('');setAmount('');setReason('');setQuery('');
  if(allowed){try{const legacy=kind==='payroll'?sessionStorage.getItem('matmove.admin.payroll.pending.v1'):null;if(legacy&&Object.keys(JSON.parse(legacy)?.keys||{}).length){setBlocked(true);setError('A previous payroll batch needs review in the original ledger before creating new payments.');}const raw=localStorage.getItem(key);if(raw)setPending(validateMoneyDraft(JSON.parse(raw),actor,kind));}catch{setBlocked(true);setError('Saved payment data could not be read. No new payment can be submitted.');}void refresh();}
  return()=>{live.current=false;generation.current++;};
 },[stamp]);
 async function search(searchValue=query){
  if(mutex.current||pending||blocked)return;
  mutex.current=true;setBusy(true);setError('');
  try{
   const auth=await session();
   const response=await fetch(endpoint+'?view=recipients&q='+encodeURIComponent(searchValue.trim()),{
    headers:{Authorization:'Bearer '+auth.access_token},cache:'no-store',signal:AbortSignal.timeout(15000)
   });
   const data=await response.json();await session();
   if(!response.ok)throw Error(data.error||'Recipient lookup failed.');
   if(data.actor!==actor||!Array.isArray(data.rows)||data.rows.length>500||data.rows.some((v:any)=>!uuid(v.id)))throw Error('Recipient list was not confirmed.');
   if(valid()){
    setRows(previous=>{const merged=new Map(previous.map(person=>[person.id,person]));for(const person of data.rows)merged.set(person.id,person);return [...merged.values()].slice(-500);});
   }
  }catch(e:any){if(valid())setError(e.message);}
  finally{if(valid()){mutex.current=false;setBusy(false);}}
 }
 async function importPayrollCsv(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value='';if(!file||kind!=='payroll')return;
  setError('');setImportNotice('');
  try{
   if(file.size>2_000_000)throw Error('CSV must be 2 MB or smaller.');
   if(!file.name.toLowerCase().endsWith('.csv'))throw Error('Save your Excel workbook as CSV UTF-8, then upload it.');
   if(!rows.length)throw Error('Load the staff directory before importing a payroll file.');
   const imported=matchPayrollCsv(await file.text(),rows);
   const ids=Object.keys(imported);
   if(!ids.length)throw Error('No payroll recipients were matched.');
   setAmounts(previous=>({...previous,...imported}));
   setSelected(previous=>[...new Set([...previous,...ids])]);
   setReview(null);
   setImportNotice(`Imported ${ids.length} staff salary rows. Check each salary and the total in the review.`);
  }catch(e:any){setError(e.message||'Payroll CSV could not be imported.');}
 }
 function buildReview(){
  try{
   if(blocked||pending||!balance)throw Error('The account balance is not ready or another request needs confirmation.');
   const period=reason.trim();
   if(period.length<3||period.length>(kind==='payroll'?140:300))throw Error('Enter a valid payment reason.');
   if(!selected.length)throw Error('Select a recipient.');
   if(selected.length>500)throw Error('A payroll batch can contain at most 500 recipients.');
   const items=selected.map(id=>{
    const person=rows.find(row=>row.id===id);
    if(!person)throw Error('Reload and select the recipient again.');
    const amountValue=(kind==='payroll'?(amounts[id]??amount):amount).trim();
    adminMoneyMinor(amountValue);
    const linkedAccount=destination(person);
    const dest=kind==='refund'?linkedAccount:undefined;
    return {
     name:(person.full_name||person.email||person.phone||person.id).slice(0,200),
     body:{...(kind==='payroll'?{staffUserId:id}:{recipientUserId:id,recipientAccountId:dest!}),requestKey:crypto.randomUUID(),amount:amountValue,reason:period}
    } as Payment;
   });
   const total=items.reduce((sum,item)=>sum+adminMoneyMinor(item.body.amount),0n);
   if(total>BigInt(balance.balance.value))throw Error('The confirmed available balance does not cover this review.');
   setReview(items);setError('');
  }catch(e:any){setError(e.message);}
 }
 function persist(items:Payment[]){if(items.length){const raw=JSON.stringify({version:1,actor,kind,items});validateMoneyDraft(JSON.parse(raw),actor,kind);localStorage.setItem(key,raw);if(localStorage.getItem(key)!==raw)throw Error('Payment review could not be saved. No transfer submitted.');}else localStorage.removeItem(key);}
 async function execute(){if(mutex.current||blocked||!allowed)return;const original=pending||review;if(!original)return;if(!pending&&!balance?.newPaymentsEnabled){setError('New payments are paused until production release checks are complete. Your review has not been submitted.');return;}mutex.current=true;setBusy(true);setError('');setNotice('');const s=stamp;let left=[...original];let completedCount=0;
  try{await session();persist(left);if(!valid(s))return;setPending(left);setReview(null);
   for(let groupStart=0;groupStart<original.length;groupStart+=50){const group=original.slice(groupStart,groupStart+50);setNotice(`Processing group ${Math.floor(groupStart/50)+1} of ${Math.ceil(original.length/50)} (up to 50 recipients).`);let stopAfterGroup=false;for(const p of group){if(!valid(s))return;const d=await call('',p.body);const recipient=p.body.staffUserId||p.body.recipientUserId;
    if(d.requestKey!==p.body.requestKey||d.recipientUserId!==recipient||d.amount?.currency!=='SLE'||d.amount.value!==Number(adminMoneyMinor(p.body.amount))||!['initiating','pending','processing','review_required','completed','failed'].includes(d.status))throw Error('Payment receipt did not match the reviewed request. Keep the original request.');
    if(!['completed','failed'].includes(d.status)){setNotice(`${p.name}: ${d.status}. Use Check original requests; no replacement payment is created.`);stopAfterGroup=true;break;}
    if(typeof d.providerTransferId!=='string'||!/^trn-[A-Za-z0-9_-]+$/.test(d.providerTransferId)||d.success!==(d.status==='completed'))throw Error('Terminal payment receipt was not verified.');
    left=left.filter(v=>v.body.requestKey!==p.body.requestKey);persist(left);setPending(left.length?left:null);completedCount+=1;setNotice(`${p.name}: ${d.status}. Reference ${d.providerTransferId}. ${completedCount} of ${original.length} requests confirmed.`);
   }if(stopAfterGroup)break;}
   if(!left.length){setSelected([]);setAmounts({});setAmount('');setReason('');}await refresh();
  }catch(e:any){if(valid(s))setError(e.message||'Payment was not confirmed. Keep the original request.');}
  finally{if(valid(s)){mutex.current=false;setBusy(false);}}
 }
 if(!allowed)return <AdminLayout title="Access denied"><p role="alert">This money section has not been assigned to your account.</p></AdminLayout>;
 return <AdminLayout title={kind==='payroll'?'Administrative Payroll':'Customer Refunds'} subtitle={kind==='payroll'?'Staff compensation is managed separately from customer refunds. Choose payroll-eligible staff and review each salary before payment.':'Refunds are only for Riders, Drivers and Merchants. Staff salaries are handled separately in Administrative Payroll.'}><div className="mt-4 space-y-5">
  <section className="rounded-2xl bg-slate-900 p-5 text-white"><h2 className="font-bold">{kind==='payroll'?'Dedicated Staff Payroll funding account':'Dedicated Customer Refund funding account'}</h2><p className="mt-2 text-2xl font-bold">{loading?'Loading…':balance?display(BigInt(balance.balance.value)):'Balance unavailable'}</p>{balance&&<p className="mt-2 break-all text-xs">{balance.accountId}</p>}<button disabled={busy||loading} onClick={()=>void refresh()} className="mt-3 rounded-lg border px-4 py-2">Reload allocated account balance</button>{balance&&!balance.newPaymentsEnabled&&<p className="mt-3 text-amber-200">New transfers are paused. The account balance can be reviewed, but confirmations remain blocked until the dedicated account, provider checks and live-payment authorization are completed.</p>}</section>
  {blocked&&<p role="alert" className="rounded-xl bg-amber-50 p-4">New payments are blocked because retained payment data needs review. Keep the original request references.</p>}{error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}{notice&&<p role="status" className="rounded-xl bg-emerald-50 p-4">{notice}</p>}
  {pending&&<section className="rounded-xl border border-amber-400 p-4"><h2 className="font-bold">Original requests need confirmation</h2><p>No request is submitted automatically on reopening this page.</p>{pending.map(p=><p key={p.body.requestKey} className="mt-2 break-all">{p.name} · {display(adminMoneyMinor(p.body.amount))} · {p.body.requestKey}</p>)}<button disabled={busy||blocked} onClick={()=>void execute()} className="mt-4 rounded-lg bg-slate-900 px-4 py-3 text-white">{busy?'Checking…':'Check original requests'}</button></section>}
  <fieldset disabled={busy||!!pending||blocked} className="space-y-4 rounded-2xl border p-5"><legend className="font-bold">{kind==='payroll'?'Select payroll-eligible staff':'Select a customer to refund'}</legend><div className="flex gap-2"><input aria-label="Recipient search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, email or phone" className="min-w-0 flex-1 rounded-lg border p-3"/><button type="button" onClick={()=>void search()} className="rounded-lg border px-4">Search</button></div><div className="flex flex-wrap items-center gap-2"><button type="button" disabled={busy||kind!=='payroll'} onClick={()=>void search('')} className="rounded-lg border px-3 py-2 text-sm">Load staff directory (up to 500)</button><span className="text-sm text-slate-600">{selected.length} selected · selections stay selected when you search again</span></div>{kind==='payroll'&&<div className="rounded-xl border border-dashed p-3"><label className="block text-sm font-semibold">Import payroll CSV from Excel or another spreadsheet<input type="file" accept=".csv,text/csv" onChange={event=>void importPayrollCsv(event)} className="mt-2 block w-full text-sm"/></label><p className="mt-1 text-xs text-slate-500">Required columns: Email, Phone or Full Name, plus Salary/Amount. Save Excel files as CSV UTF-8.</p>{importNotice&&<p role="status" className="mt-2 text-sm text-emerald-700">{importNotice}</p>}</div>}<div className="flex flex-wrap gap-2"><button type="button" disabled={busy||kind!=='payroll'||!rows.length} onClick={()=>setSelected(previous=>[...new Set([...previous,...rows.map(person=>person.id)])])} className="rounded-lg border px-3 py-2 text-sm">Select all loaded staff</button><button type="button" disabled={busy||kind!=='payroll'||!selected.length} onClick={()=>{setSelected([]);setReview(null);}} className="rounded-lg border px-3 py-2 text-sm">Clear selection</button></div><div className="max-h-80 space-y-2 overflow-auto">{rows.map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><label className="flex min-w-0 flex-1 gap-3"><input type={kind==='payroll'?'checkbox':'radio'} name="recipient" checked={selected.includes(r.id)} onChange={()=>{setReview(null);setSelected(v=>kind==='refund'?[r.id]:v.includes(r.id)?v.filter(id=>id!==r.id):v.length<500?[...v,r.id]:v);}}/><span className="min-w-0">{r.full_name||r.email||r.id}<small className="block">{r.email} · {r.phone} · {r.role}{kind==='payroll'?' · Payroll eligible':''}</small></span></label>{kind==='payroll'&&selected.includes(r.id)&&<input aria-label={`Salary for ${r.full_name||r.email||r.id}`} inputMode="decimal" placeholder="Salary (SLE)" value={amounts[r.id]??amount} onChange={event=>{setAmounts(previous=>({...previous,[r.id]:event.target.value}));setReview(null);}} className="w-40 rounded-lg border p-2 text-sm"/>}</div>)}</div><label className="block">{kind==='payroll'?'Default salary for staff without an individual amount (SLE)':'Refund amount (SLE)'}<input aria-label="Payment amount" inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);setReview(null);}} className="mt-1 block w-full rounded-lg border p-3"/></label><label className="block">Reason or period<input aria-label="Payment reason" maxLength={kind==='payroll'?140:300} value={reason} onChange={e=>{setReason(e.target.value);setReview(null);}} className="mt-1 block w-full rounded-lg border p-3"/></label><button type="button" onClick={buildReview} className="rounded-lg bg-indigo-700 px-4 py-3 font-bold text-white">Review payment</button></fieldset>
  {review&&!pending&&<section className="rounded-xl border border-indigo-300 p-5"><h2 className="font-bold">{kind==='payroll'?'Review staff payroll batch':'Review customer refund'}</h2><p className="mt-1 text-sm text-slate-600">{review.length} {kind==='payroll'?'staff member(s) · processed in groups of up to 50':'customer refund recipient'}</p>{review.map(p=><p key={p.body.requestKey}>{p.name}: {display(adminMoneyMinor(p.body.amount))}</p>)}<p className="mt-3 font-bold">Total: {display(review.reduce((sum,p)=>sum+adminMoneyMinor(p.body.amount),0n))}</p><p>Reason: {review[0].body.reason}</p><button disabled={busy||blocked||!balance?.newPaymentsEnabled} onClick={()=>void execute()} className="mt-3 rounded-lg bg-indigo-700 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{kind==='payroll'?'Confirm staff payroll batch':'Confirm customer refund'}</button>{!balance?.newPaymentsEnabled&&<p role="status" className="mt-3 text-sm text-amber-800">{kind==='payroll'?'Payroll is ready for review, but the live transfer switch is still off.':'Refund is ready for review, but the live transfer switch is still off.'} No transfer has been sent. The Admin server must authorize live money operations before this confirmation becomes available.</p>}<button disabled={busy} onClick={()=>setReview(null)} className="ml-3 p-3">Edit review</button></section>}
  <section className="rounded-2xl border p-5"><h2 className="font-bold">{kind==='payroll'?'Latest 50 payroll records':'Latest 50 customer refund records'}</h2><p className="text-sm">Each result retains the original request reference. Pending records are not completed payments.</p>{loading?<p>Loading history…</p>:!balance?<p>History could not be verified. Reload to retry.</p>:!history.length?<p>No payment records in this completed read.</p>:<div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Request</th><th>Amount</th><th>Status</th><th>Transfer</th></tr></thead><tbody>{history.map(h=><tr key={h.id}><td className="break-all p-2">{h.request_key}</td><td className="p-2">{display(BigInt(h.amount_minor))}</td><td className="p-2">{h.state}</td><td className="break-all p-2">{h.provider_transfer_id||'Not confirmed'}</td></tr>)}</tbody></table></div>}</section>
 </div></AdminLayout>;
}
