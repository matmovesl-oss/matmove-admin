


import {useState,useEffect,useRef,useCallback} from 'react';
import AdminLayout from '@/components/AdminLayout';
import Modal from '@/components/Modal';
import {adminFetch} from '@/lib/adminFetch';
import {SECTION_GROUPS,useAdminAccess,canAccess} from '@/lib/adminAccess';
const ALL_ASSIGNMENTS=SECTION_GROUPS.flatMap(g=>g.items.map(([key])=>key));
const isFull=(permissions:string[])=>ALL_ASSIGNMENTS.every(key=>permissions.includes(key));
const empty={id:'',email:'',fullName:'',permissions:[] as string[],isActive:true};
export function StaffGovernancePage(){
 const access=useAdminAccess();const allowed=canAccess(access,'staff');const owner=allowed&&access?.is_owner===true;
 const [staff,setStaff]=useState<any[]>([]);const [loading,setLoading]=useState(true);const [search,setSearch]=useState('');const [open,setOpen]=useState(false);const [draft,setDraft]=useState(empty);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const [directoryError,setDirectoryError]=useState('');
 const [removalReady,setRemovalReady]=useState(false);
 const [removeTarget,setRemoveTarget]=useState<any>(null);
 const [removeReason,setRemoveReason]=useState('');
 const [restoreTarget,setRestoreTarget]=useState<any>(null);
 const identity=useRef(access?.id);identity.current=access?.id;
 const mounted=useRef(false),generation=useRef(0),writeBusy=useRef(false);
 const refresh=useCallback(async()=>{
  const request=++generation.current;
  if(!allowed)return;
  setLoading(true);setDirectoryError('');
  try{
   const r=await adminFetch('/api/admin-staff');const b=await r.json();
   if(!r.ok||!Array.isArray(b.staff))throw new Error(b.error||'Staff directory unavailable.');
   if(mounted.current&&identity.current===access?.id&&request===generation.current){setStaff(b.staff);setRemovalReady(b.removalReady===true);}
  }catch(e){if(mounted.current&&request===generation.current)setDirectoryError(e instanceof Error?e.message:'Staff unavailable.');}
  finally{if(mounted.current&&request===generation.current)setLoading(false);}
 },[allowed,access?.id]);
 useEffect(()=>{mounted.current=true;setStaff([]);setOpen(false);setRemoveTarget(null);setRestoreTarget(null);setError('');setNotice('');if(allowed)void refresh();else setLoading(false);return()=>{mounted.current=false;generation.current++;};},[refresh]);
 function toggle(keys:string[],checked:boolean){setDraft(d=>({...d,permissions:checked?[...new Set([...d.permissions,...keys])]:d.permissions.filter(k=>!keys.includes(k))}));}
 async function request(body:any){
  if(writeBusy.current||!owner)return;
  const userId=access?.id;writeBusy.current=true;setBusy(true);setError('');setNotice('');
  try{
   const r=await adminFetch('/api/admin-staff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const b=await r.json();
   if(!mounted.current||identity.current!==userId)return;
   if(!r.ok){
    if(b.code==='STAFF_REMOVED'&&b.restore?.id&&b.restore?.updated_at)setRestoreTarget(b.restore);
    throw new Error(b.error||'Staff change was not confirmed.');
   }
   if(b.success!==true)throw new Error('Staff change was not confirmed. Refresh the directory before retrying.');
   setNotice(b.message);setOpen(false);setDraft(empty);setRemoveTarget(null);setRemoveReason('');setRestoreTarget(null);
   if(body.action==='remove')setStaff(previous=>previous.filter(row=>row.id!==body.id));
   await refresh();
  }catch(e){if(mounted.current&&identity.current===userId)setError(e instanceof Error?e.message:'Unable to change staff.');}
  finally{writeBusy.current=false;if(mounted.current&&identity.current===userId)setBusy(false);}
 }
 if(!allowed)return <AdminLayout title="Access denied"><p role="alert">Access denied. Staff directory access has not been assigned.</p></AdminLayout>;
 const rows=staff.filter(s=>`${s.full_name||''} ${s.email||''} ${s.department||''}`.toLowerCase().includes(search.toLowerCase()));
 return <AdminLayout title="Staff & Department Governance" subtitle="Email invitations and individual section assignments">
  {error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}{notice&&<p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-700">{notice}</p>}
  <div className="mb-5 flex flex-wrap gap-3"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search staff" className="rounded-xl border p-3"/><button disabled={busy||loading} onClick={()=>{setRemoveTarget(null);setRemoveReason('');setRestoreTarget(null);void refresh();}} className="rounded-xl border bg-white p-3">Refresh</button>{owner&&<button disabled={busy} onClick={()=>{setDraft(empty);setRestoreTarget(null);setRemoveTarget(null);setError('');setOpen(true);}} className="rounded-xl bg-indigo-700 p-3 font-bold text-white">Invite staff</button>}</div>
  {!owner&&<p className="mb-4 text-sm text-slate-600">You can view the staff directory. Only the super admin can invite staff or change assignments.</p>}
  {directoryError&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-800">{directoryError}<button type="button" disabled={busy||loading} onClick={()=>void refresh()} className="ml-2 min-h-11 font-bold underline">Retry staff directory</button></p>}
  {owner&&!loading&&!directoryError&&!removalReady&&<p role="status" className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Run the complete STAFF_REMOVAL_SETUP.sql before removing staff. Invitations and existing assignments remain available.</p>}
  {removeTarget&&owner&&<section role="group" aria-label="Confirm staff removal" className="mb-5 space-y-3 rounded-2xl border border-red-300 bg-red-50 p-4">
   <h2 className="font-bold">Remove Admin access for {removeTarget.full_name||removeTarget.email}?</h2>
   <p className="break-all text-sm">{removeTarget.email}</p>
   <p className="text-sm">This removes their Admin assignments and hides them from this directory. Their login, Customer account, wallets and financial history are preserved. The action is recorded in the audit log.</p>
   <label className="block text-sm font-bold">Reason for removal<textarea aria-label="Reason for removal" maxLength={500} value={removeReason} disabled={busy} onChange={e=>setRemoveReason(e.target.value)} className="mt-2 w-full rounded-xl border p-3 text-base font-normal"/></label>
   <div className="flex flex-wrap gap-3"><button type="button" disabled={busy||removeReason.trim().length<3||!removeTarget.updated_at} onClick={()=>void request({action:'remove',id:removeTarget.id,expectedUpdatedAt:removeTarget.updated_at,reason:removeReason})} className="min-h-11 rounded-xl bg-red-700 px-4 py-2 font-bold text-white disabled:opacity-50">{busy?'Removing…':'Confirm removal'}</button><button type="button" disabled={busy} onClick={()=>{setRemoveTarget(null);setRemoveReason('');}} className="min-h-11 rounded-xl border bg-white px-4 py-2 font-bold">Keep staff member</button></div>
  </section>}
  <div className="overflow-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead><tr><th className="p-4">Staff member</th><th>Departments</th><th>Assignments</th><th>Status</th><th>Actions</th></tr></thead><tbody>{!loading&&!directoryError&&rows.length===0&&<tr><td colSpan={5} className="p-4 text-slate-600">{search?'No staff match your search.':'No staff members to display.'}</td></tr>}{rows.map(s=><tr key={s.id} className="border-t"><td className="p-4"><b>{s.full_name||'Staff'}</b><p>{s.email}</p></td><td>{s.department||'Owner'}</td><td>{s.is_owner?'Super admin — all sections':isFull(s.permissions||[])?'Administrative admin — all sections; staff directory read-only':SECTION_GROUPS.flatMap(g=>g.items).filter(([k])=>s.permissions?.includes(k)).map(([,name])=>name).join(', ')||'No assignments'}</td><td>{s.is_active?'Active':'Disabled'}<p>{s.invite_state}</p></td><td>{owner&&!s.is_owner&&<div className="flex flex-wrap gap-2 p-3"><button disabled={busy} onClick={()=>{setRestoreTarget(null);setRemoveTarget(null);setError('');setDraft({id:s.id,email:s.email||'',fullName:s.full_name||'',permissions:s.permissions||[],isActive:s.is_active});setOpen(true);}} className="rounded-lg border p-2">Edit assignments</button><button disabled={busy||!s.is_active} onClick={()=>void request({action:'resend',id:s.id})} className="rounded-lg border p-2 disabled:opacity-50">Send login email</button><button type="button" aria-label={`Remove staff ${s.email}`} disabled={busy||loading||!!directoryError||!removalReady||!s.updated_at} onClick={()=>{setRemoveTarget(s);setRemoveReason('');setOpen(false);setError('');}} className="rounded-lg border border-red-300 p-2 text-red-700 disabled:opacity-50">Remove staff</button></div>}</td></tr>)}</tbody></table>{loading&&<p className="p-4">Loading staff…</p>}</div>
  <Modal open={open} onClose={()=>{if(!busy)setOpen(false);}} title={draft.id?'Edit staff assignments':'Invite staff by email'} maxWidth="max-w-3xl">
   <form onSubmit={e=>{e.preventDefault();if(!restoreTarget)void request({action:draft.id?'update':'invite',...draft});}} className="space-y-4">
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    <label className="block">Full name<input required value={draft.fullName} onChange={e=>setDraft({...draft,fullName:e.target.value})} className="mt-1 w-full rounded-lg border p-3"/></label>
    <label className="block">Work email<input required type="email" disabled={!!draft.id} value={draft.email} onChange={e=>{setDraft({...draft,email:e.target.value});setRestoreTarget(null);}} className="mt-1 w-full rounded-lg border p-3"/></label>
    <p className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">Select departments and individual assignments. Games expands into separate permissions. Staff set their own password using an email link.</p>
    <label className="flex gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4"><input type="checkbox" checked={isFull(draft.permissions)} onChange={e=>setDraft(d=>({...d,permissions:e.target.checked?[...ALL_ASSIGNMENTS]:[]}))}/><span><b>Administrative admin — full operational access</b><span className="block text-sm">Access to every listed section, including all Games tabs. Staff directory is read-only. Only the super admin can invite staff, resend login emails, or change assignments. Uncheck to choose individual assignments.</span></span></label>
    <div className="max-h-[45vh] space-y-3 overflow-auto">{SECTION_GROUPS.map(g=>{const keys=g.items.map(i=>i[0]);return <details key={g.label} open className="rounded-xl border p-4"><summary className="cursor-pointer font-bold">{g.label}</summary><label className="mt-3 flex gap-2"><input type="checkbox" checked={keys.every(k=>draft.permissions.includes(k))} onChange={e=>toggle(keys,e.target.checked)}/>All {g.label} assignments</label><div className="mt-3 grid gap-3 pl-6 sm:grid-cols-2">{g.items.map(([key,name])=><label key={key} className="flex gap-2"><input type="checkbox" checked={draft.permissions.includes(key)} onChange={e=>toggle([key],e.target.checked)}/>{name}</label>)}</div></details>;})}</div>
    {draft.id&&<label className="flex gap-2"><input type="checkbox" checked={draft.isActive} onChange={e=>setDraft({...draft,isActive:e.target.checked})}/>Staff account active</label>}
    {restoreTarget&&<section role="group" aria-label="Restore removed staff" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="text-sm"><b>{restoreTarget.email}</b> was previously removed. Confirm restoring Admin access with the assignments selected above. The existing login is reused; no Customer account or wallet is recreated.</p><button type="button" disabled={busy||!draft.permissions.length} onClick={()=>void request({action:'invite',...draft,restoreRemoved:true,restoreId:restoreTarget.id,expectedUpdatedAt:restoreTarget.updated_at})} className="min-h-11 rounded-xl bg-amber-800 px-4 py-2 font-bold text-white disabled:opacity-50">Confirm restore and send login email</button></section>}
    <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={()=>setOpen(false)} className="rounded-lg border p-3">Cancel</button><button disabled={busy||!draft.permissions.length||!!restoreTarget} className="rounded-lg bg-indigo-700 p-3 font-bold text-white disabled:opacity-50">{busy?'Saving…':draft.id?'Save assignments':'Authorize and send invitation'}</button></div>
   </form>
  </Modal>
 </AdminLayout>;
}
