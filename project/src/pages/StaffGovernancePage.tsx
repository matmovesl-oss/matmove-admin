
import {useState,useEffect} from 'react';
import AdminLayout from '@/components/AdminLayout';
import Modal from '@/components/Modal';
import {adminFetch} from '@/lib/adminFetch';
import {SECTION_GROUPS,useAdminAccess} from '@/lib/adminAccess';
const empty={id:'',email:'',fullName:'',permissions:[] as string[],isActive:true};
export function StaffGovernancePage(){
 const access=useAdminAccess();const owner=!!(access?.is_owner||access?.role==='super_admin');
 const [staff,setStaff]=useState<any[]>([]);const [loading,setLoading]=useState(true);const [search,setSearch]=useState('');const [open,setOpen]=useState(false);const [draft,setDraft]=useState(empty);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 async function refresh(){setLoading(true);try{const r=await adminFetch('/api/admin-staff');const b=await r.json();if(!r.ok)throw new Error(b.error);setStaff(b.staff||[]);}catch(e){setError(e instanceof Error?e.message:'Staff unavailable.');}finally{setLoading(false);}}
 useEffect(()=>{void refresh();},[]);
 function toggle(keys:string[],checked:boolean){setDraft(d=>({...d,permissions:checked?[...new Set([...d.permissions,...keys])]:d.permissions.filter(k=>!keys.includes(k))}));}
 async function request(body:any){if(busy)return;setBusy(true);setError('');setNotice('');try{const r=await adminFetch('/api/admin-staff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const b=await r.json();if(!r.ok)throw new Error(b.error);setNotice(b.message);setOpen(false);setDraft(empty);await refresh();}catch(e){setError(e instanceof Error?e.message:'Unable to authorize staff.');}finally{setBusy(false);}}
 const rows=staff.filter(s=>`${s.full_name||''} ${s.email||''} ${s.department||''}`.toLowerCase().includes(search.toLowerCase()));
 return <AdminLayout title="Staff & Department Governance" subtitle="Email invitations and individual section assignments">
  {error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}{notice&&<p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-700">{notice}</p>}
  <div className="mb-5 flex flex-wrap gap-3"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search staff" className="rounded-xl border p-3"/><button onClick={()=>void refresh()} className="rounded-xl border bg-white p-3">Refresh</button>{owner&&<button onClick={()=>{setDraft(empty);setOpen(true);}} className="rounded-xl bg-indigo-700 p-3 font-bold text-white">Invite staff</button>}</div>
  {!owner&&<p className="mb-4 text-sm text-slate-600">You can view the staff directory. Only the owner can authorize staff or change assignments.</p>}
  <div className="overflow-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead><tr><th className="p-4">Staff member</th><th>Departments</th><th>Assignments</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map(s=><tr key={s.id} className="border-t"><td className="p-4"><b>{s.full_name||'Staff'}</b><p>{s.email}</p></td><td>{s.department||'Owner'}</td><td>{s.is_owner||s.role==='super_admin'?'Owner — all sections':SECTION_GROUPS.flatMap(g=>g.items).filter(([k])=>s.permissions?.includes(k)).map(([,name])=>name).join(', ')||'No assignments'}</td><td>{s.is_active?'Active':'Disabled'}<p>{s.invite_state}</p></td><td>{owner&&!s.is_owner&&s.role!=='super_admin'&&<div className="flex flex-wrap gap-2 p-3"><button onClick={()=>{setDraft({id:s.id,email:s.email||'',fullName:s.full_name||'',permissions:s.permissions||[],isActive:s.is_active});setOpen(true);}} className="rounded-lg border p-2">Edit assignments</button><button disabled={busy||!s.is_active} onClick={()=>void request({action:'resend',id:s.id})} className="rounded-lg border p-2 disabled:opacity-50">Send login email</button></div>}</td></tr>)}</tbody></table>{loading&&<p className="p-4">Loading staff…</p>}</div>
  <Modal open={open} onClose={()=>{if(!busy)setOpen(false);}} title={draft.id?'Edit staff assignments':'Invite staff by email'} maxWidth="max-w-3xl">
   <form onSubmit={e=>{e.preventDefault();void request({action:draft.id?'update':'invite',...draft});}} className="space-y-4">
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    <label className="block">Full name<input required value={draft.fullName} onChange={e=>setDraft({...draft,fullName:e.target.value})} className="mt-1 w-full rounded-lg border p-3"/></label>
    <label className="block">Work email<input required type="email" disabled={!!draft.id} value={draft.email} onChange={e=>setDraft({...draft,email:e.target.value})} className="mt-1 w-full rounded-lg border p-3"/></label>
    <p className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">Select departments and individual assignments. Games expands into separate permissions. Staff set their own password using an email link.</p>
    <div className="max-h-[45vh] space-y-3 overflow-auto">{SECTION_GROUPS.map(g=>{const keys=g.items.map(i=>i[0]);return <details key={g.label} open className="rounded-xl border p-4"><summary className="cursor-pointer font-bold">{g.label}</summary><label className="mt-3 flex gap-2"><input type="checkbox" checked={keys.every(k=>draft.permissions.includes(k))} onChange={e=>toggle(keys,e.target.checked)}/>All {g.label} assignments</label><div className="mt-3 grid gap-3 pl-6 sm:grid-cols-2">{g.items.map(([key,name])=><label key={key} className="flex gap-2"><input type="checkbox" checked={draft.permissions.includes(key)} onChange={e=>toggle([key],e.target.checked)}/>{name}</label>)}</div></details>;})}</div>
    {draft.id&&<label className="flex gap-2"><input type="checkbox" checked={draft.isActive} onChange={e=>setDraft({...draft,isActive:e.target.checked})}/>Staff account active</label>}
    <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={()=>setOpen(false)} className="rounded-lg border p-3">Cancel</button><button disabled={busy||!draft.permissions.length} className="rounded-lg bg-indigo-700 p-3 font-bold text-white disabled:opacity-50">{busy?'Saving…':draft.id?'Save assignments':'Authorize and send invitation'}</button></div>
   </form>
  </Modal>
 </AdminLayout>;
}
