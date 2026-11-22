import {useCallback,useEffect,useState} from 'react';
import {CheckCircle2,Globe,MessageCircle,PencilLine,Plus,RefreshCw,Trash2,X} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {useAdminAccess} from '@/lib/adminAccess';

type Contact={id:string;kind:'social'|'whatsapp';platform_name:string;link_url:string|null;whatsapp_phone:string|null;icon_key:string;is_active:boolean;display_order:number;version:number;created_at:string;updated_at:string};
type Draft={id:string|null;version:number;kind:'social'|'whatsapp';platform_name:string;link_url:string;whatsapp_phone:string;icon_key:string;is_active:boolean;display_order:number};
const iconOptions=[['instagram','Instagram'],['facebook','Facebook'],['tiktok','TikTok'],['youtube','YouTube'],['linkedin','LinkedIn'],['x','X'],['telegram','Telegram'],['snapchat','Snapchat'],['website','Website'],['generic','Other']];
const iconGlyph=(key:string)=>({instagram:'◎',facebook:'f',tiktok:'♪',youtube:'▶',linkedin:'in',x:'𝕏',telegram:'➤',snapchat:'◉',website:'↗',generic:'↗',whatsapp:'◉'} as Record<string,string>)[key]||'↗';
const emptyDraft=(kind:'social'|'whatsapp'='social'):Draft=>({id:null,version:0,kind,platform_name:kind==='whatsapp'?'WhatsApp Support':'',link_url:'',whatsapp_phone:'',icon_key:kind==='whatsapp'?'whatsapp':'instagram',is_active:true,display_order:0});
const onlyDigits=(value:string)=>value.replace(/[^0-9]/g,'');

export default function AdminSupportLinksManager(){
 const access=useAdminAccess(),actor=access?.id;
 const [items,setItems]=useState<Contact[]>([]);
 const [draft,setDraft]=useState<Draft|null>(null);
 const [deleteId,setDeleteId]=useState<string|null>(null);
 const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  if(!actor)return;
  setLoading(true);setError('');
  try{
   const {data,error}=await supabase.rpc('matmove_admin_public_contacts',{p_actor:actor,p_action:'list',p_id:null,p_expected:0,p_data:{}});
   if(error)throw error;
   if(!Array.isArray(data?.items))throw new Error('Social links could not be verified.');
   setItems(data.items as Contact[]);
  }catch(e){setError(e instanceof Error?e.message:'Social links are unavailable.');}
  finally{setLoading(false);}
 },[actor]);
 useEffect(()=>{void load();},[load]);
 function edit(item:Contact){
  setDraft({id:item.id,version:item.version,kind:item.kind,platform_name:item.platform_name,link_url:item.link_url||'',whatsapp_phone:item.whatsapp_phone?('+'+item.whatsapp_phone):'',icon_key:item.icon_key,is_active:item.is_active,display_order:item.display_order});
  setDeleteId(null);setError('');setNotice('');
 }
 async function save(e:React.FormEvent){
  e.preventDefault();if(!draft||!actor||busy)return;
  const digits=onlyDigits(draft.whatsapp_phone);
  if(draft.kind==='social'){
   let parsed:URL|null=null;try{parsed=new URL(draft.link_url.trim());}catch{}
   if(draft.platform_name.trim().length<2||draft.platform_name.trim().length>50||!parsed||parsed.protocol!=='https:'||!parsed.hostname){setError('Enter a platform name and a valid HTTPS link.');return;}
  }else if(digits.length<8||digits.length>15||digits.startsWith('0')){setError('Enter the full international WhatsApp number, including country code.');return;}
  if(!Number.isInteger(draft.display_order)||draft.display_order<0||draft.display_order>10000){setError('Display order must be between 0 and 10,000.');return;}
  setBusy(true);setError('');setNotice('');
  const payload={kind:draft.kind,platform_name:draft.kind==='whatsapp'?'WhatsApp Support':draft.platform_name.trim(),link_url:draft.kind==='social'?draft.link_url.trim():null,whatsapp_phone:draft.kind==='whatsapp'?draft.whatsapp_phone:null,icon_key:draft.kind==='whatsapp'?'whatsapp':draft.icon_key,is_active:draft.is_active,display_order:draft.display_order};
  try{
   const {data,error}=await supabase.rpc('matmove_admin_public_contacts',{p_actor:actor,p_action:'save',p_id:draft.id,p_expected:draft.version,p_data:payload});
   if(error)throw error;
   if(typeof data?.id!=='string'||!Number.isSafeInteger(Number(data.version)))throw new Error('The contact update was not confirmed. Refresh and retry.');
   setDraft(null);setNotice(draft.kind==='whatsapp'?'WhatsApp support was saved and published.':'Social link was saved and published.');
   await load();
  }catch(e){setError(e instanceof Error?e.message:'The contact could not be saved.');}
  finally{setBusy(false);}
 }
 async function remove(item:Contact){
  if(!actor||busy||item.kind==='whatsapp')return;
  setBusy(true);setError('');setNotice('');
  try{
   const {data,error}=await supabase.rpc('matmove_admin_public_contacts',{p_actor:actor,p_action:'delete',p_id:item.id,p_expected:item.version,p_data:{}});
   if(error)throw error;
   if(data?.id!==item.id||data?.deleted!==true)throw new Error('The delete was not confirmed. Refresh and retry.');
   setItems(current=>current.filter(x=>x.id!==item.id));setDeleteId(null);setNotice('Social link permanently removed from MatMove.');await load();
  }catch(e){setError(e instanceof Error?e.message:'The social link could not be deleted.');}
  finally{setBusy(false);}
 }
 const whatsapp=items.find(x=>x.kind==='whatsapp'),socials=items.filter(x=>x.kind==='social');
 return <div className="space-y-4">
  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
   <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-emerald-800"><Globe size={19}/></span><div><h2 className="font-black text-emerald-950">MatMove socials & WhatsApp</h2><p className="mt-1 text-xs leading-5 text-emerald-900">Add official MatMove profiles and control the WhatsApp support number shown in the customer app. Active changes are published from Supabase and refresh connected customer apps automatically.</p></div></div>
  </div>
  {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
  {notice&&<p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
  <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-black text-slate-950">Published contact profiles</h3><p className="mt-1 text-xs text-slate-500">{socials.filter(x=>x.is_active).length} active social link(s) · {whatsapp?.is_active?'WhatsApp active':'WhatsApp inactive'}</p></div><button type="button" onClick={()=>void load()} disabled={loading||busy} className="inline-flex min-h-10 items-center gap-2 rounded-xl border bg-white px-3 text-xs font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={14}/> Refresh</button></div>
  <div className="grid gap-3 md:grid-cols-2">
   <article className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><MessageCircle size={19}/></span><div className="min-w-0 flex-1"><p className="font-black text-slate-900">WhatsApp Support</p><p className="truncate text-xs text-slate-500">{whatsapp?.whatsapp_phone?('+'+whatsapp.whatsapp_phone):'No number configured'}</p></div><span className={whatsapp?.is_active?'rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800':'rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600'}>{whatsapp?.is_active?'Active':'Inactive'}</span></div>
    <p className="mt-3 text-xs leading-5 text-slate-500">Customers open a direct WhatsApp conversation to this official support number. The app builds the routing link from the verified international number.</p>
    <button type="button" onClick={()=>{whatsapp?edit(whatsapp):setDraft(emptyDraft('whatsapp'));setError('');setNotice('');}} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 px-3 text-xs font-bold text-emerald-800"><PencilLine size={14}/>{whatsapp?'Change WhatsApp number':'Add WhatsApp number'}</button>
   </article>
   <article className="rounded-2xl border border-dashed border-slate-300 bg-white p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700"><Globe size={19}/></span><div><p className="font-black text-slate-900">Social media profiles</p><p className="text-xs text-slate-500">Add more official platforms at any time</p></div></div><button type="button" onClick={()=>{setDraft(emptyDraft('social'));setError('');setNotice('');}} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#073b2f] px-3 text-xs font-bold text-white"><Plus size={14}/> Add social link</button></article>
  </div>
  {loading?<p role="status" className="rounded-xl border bg-white p-4 text-sm text-slate-500">Loading public contact settings…</p>:socials.length===0?<p className="rounded-xl border bg-white p-4 text-sm text-slate-500">No social profiles have been added yet. Add MatMove's official pages above.</p>:<div className="space-y-2">{socials.map(item=><article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex flex-wrap items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sm font-black text-sky-800">{iconGlyph(item.icon_key)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-900">{item.platform_name}</p><span className={item.is_active?'rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800':'rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600'}>{item.is_active?'Published':'Hidden'}</span></div><p className="truncate text-xs text-slate-500">{item.link_url}</p></div><button type="button" disabled={busy} onClick={()=>edit(item)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 text-xs font-bold disabled:opacity-50"><PencilLine size={13}/> Edit</button><button type="button" disabled={busy} onClick={()=>setDeleteId(deleteId===item.id?null:item.id)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-700 disabled:opacity-50"><Trash2 size={13}/> Delete</button></div>{deleteId===item.id&&<div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">Permanently remove {item.platform_name} from the customer app?<div className="mt-2 flex gap-2"><button type="button" disabled={busy} onClick={()=>void remove(item)} className="rounded-lg bg-rose-700 px-3 py-2 font-bold text-white">Confirm delete</button><button type="button" onClick={()=>setDeleteId(null)} className="rounded-lg border border-rose-300 px-3 py-2 font-bold">Cancel</button></div></div>}</article>)}</div>}
  {draft&&<form onSubmit={save} className="space-y-4 rounded-2xl border border-sky-200 bg-white p-4 shadow-sm sm:p-5">
   <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-sky-700">{draft.id?'Edit contact profile':'New contact profile'}</p><h3 className="mt-1 font-black text-slate-950">{draft.kind==='whatsapp'?'WhatsApp Support number':'Social media link'}</h3></div><button type="button" aria-label="Close contact editor" onClick={()=>setDraft(null)} className="grid h-10 w-10 place-items-center rounded-xl border"><X size={17}/></button></div>
   {draft.kind==='whatsapp'?<label className="block text-xs font-bold text-slate-700">WhatsApp number with country code<input required value={draft.whatsapp_phone} onChange={e=>setDraft({...draft,whatsapp_phone:e.target.value})} placeholder="+232 76 123 456" className="mt-1.5 min-h-11 w-full rounded-xl border bg-slate-50 px-3 text-sm font-normal"/><span className="mt-1 block text-[11px] font-normal text-slate-500">Use the full international number including country code.</span></label>:<div className="grid gap-3 sm:grid-cols-2">
    <label className="block text-xs font-bold text-slate-700">Platform name<input required minLength={2} maxLength={50} value={draft.platform_name} onChange={e=>setDraft({...draft,platform_name:e.target.value})} placeholder="e.g. Instagram, TikTok, LinkedIn" className="mt-1.5 min-h-11 w-full rounded-xl border bg-slate-50 px-3 text-sm font-normal"/></label>
    <label className="block text-xs font-bold text-slate-700">Platform icon<select value={draft.icon_key} onChange={e=>setDraft({...draft,icon_key:e.target.value})} className="mt-1.5 min-h-11 w-full rounded-xl border bg-slate-50 px-3 text-sm">{iconOptions.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label className="block text-xs font-bold text-slate-700 sm:col-span-2">Official HTTPS link<input required type="url" value={draft.link_url} onChange={e=>setDraft({...draft,link_url:e.target.value})} placeholder="https://www.instagram.com/matmove.sl" className="mt-1.5 min-h-11 w-full rounded-xl border bg-slate-50 px-3 text-sm font-normal"/></label>
   </div>}
   <div className="grid gap-3 sm:grid-cols-2"><label className="flex min-h-11 items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={draft.is_active} onChange={e=>setDraft({...draft,is_active:e.target.checked})} className="h-4 w-4 accent-emerald-700"/> Publish to customer app</label><label className="block text-xs font-bold text-slate-700">Display order<input type="number" min={0} max={10000} value={draft.display_order} onChange={e=>setDraft({...draft,display_order:Number(e.target.value)})} className="mt-1 min-h-10 w-full rounded-xl border bg-slate-50 px-3 text-sm font-normal"/></label></div>
   <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#073b2f] px-5 text-sm font-bold text-white disabled:opacity-50"><CheckCircle2 size={15}/>{busy?'Saving…':'Save & publish'}</button><button type="button" disabled={busy} onClick={()=>setDraft(null)} className="min-h-11 rounded-xl border px-4 text-sm font-semibold">Cancel</button></div>
  </form>}
 </div>;
}
