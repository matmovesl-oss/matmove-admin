import {useCallback,useEffect,useRef,useState} from 'react';
import {CalendarClock,ImagePlus,Megaphone,PenLine,Plus,RefreshCw,Send,Trash2,Upload,X,Eye,EyeOff} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {canAccess,useAdminAccess} from '@/lib/adminAccess';
import AdminLayout from '@/components/AdminLayout';

type Post={id:string;title:string;summary:string;body:string;image_path:string|null;status:'draft'|'published'|'archived';starts_at:string|null;expires_at:string|null;display_order:number;price_amount:number|null;price_currency:'SLE'|'USD'|null;version:number;created_at:string;updated_at:string;deleted_at:string|null};
type Enquiry={id:string;post_id:string|null;post_title_snapshot:string;customer_name:string|null;customer_email:string|null;customer_phone:string|null;message:string;status:string;version:number;created_at:string};
type Draft={id:string;title:string;summary:string;body:string;image_path:string|null;starts_at:string;expires_at:string;display_order:number;price_amount:string;price_currency:'SLE'|'USD';version:number};
const BUCKET='matmove-homepage-posts';
const fresh=():Draft=>({id:crypto.randomUUID(),title:'',summary:'',body:'',image_path:null,starts_at:'',expires_at:'',display_order:0,price_amount:'',price_currency:'SLE',version:0});
function localDate(value:string|null){if(!value)return '';const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';const p=(n:number)=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;}
function publicImage(path:string|null){return path?supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl:null;}
export default function HomepagePostsPage(){
 const access=useAdminAccess(),actor=access?.id,allowed=canAccess(access,'notifications');
 const [posts,setPosts]=useState<Post[]>([]),[enquiries,setEnquiries]=useState<Enquiry[]>([]),[draft,setDraft]=useState<Draft|null>(null),[file,setFile]=useState<File|null>(null),[page,setPage]=useState(0),[more,setMore]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[archiveId,setArchiveId]=useState<string|null>(null);
 const mounted=useRef(false),mutex=useRef(false),stamp=useRef('');
 const identity=JSON.stringify([actor,allowed,access?.permissions]);stamp.current=identity;
 const call=useCallback(async(action:string,id:string|null=null,expected=0,data:any={},key=crypto.randomUUID(),p=page)=>{
  const session=await supabase.auth.getSession();
  if(session.error||session.data.session?.user.id!==actor||!allowed)throw new Error('Your Admin session changed or this section is not assigned.');
  const {data:result,error}=await supabase.rpc('matmove_admin_homepage_posts',{p_actor:actor,p_action:action,p_key:key,p_id:id,p_expected:expected,p_data:data,p_page:p});
  if(error)throw new Error(error.message||'Homepage post request failed.');
  return result;
 },[actor,allowed,page]);
 const load=useCallback(async()=>{
  if(!allowed)return;setLoading(true);setError('');
  try{
   const [p,e]=await Promise.all([call('list'),call('enquiries',null,0,{},crypto.randomUUID(),page)]);
   if(!Array.isArray(p?.rows)||!Array.isArray(e?.rows))throw new Error('Homepage content could not be confirmed.');
   if(mounted.current){setPosts(p.rows);setEnquiries(e.rows);setMore(e.hasMore===true);}
  }catch(err){if(mounted.current)setError(err instanceof Error?err.message:'Could not load homepage content.');}
  finally{if(mounted.current)setLoading(false);}
 },[allowed,call,page]);
 useEffect(()=>{mounted.current=true;void load();return()=>{mounted.current=false;};},[load]);
 async function save(e:React.FormEvent){
  e.preventDefault();if(!draft||mutex.current)return;
  if(draft.title.trim().length<3||draft.summary.trim().length<10||draft.body.trim().length<10){setError('Add a clear title, short description and full details.');return;}
  if(draft.expires_at&&draft.starts_at&&new Date(draft.expires_at)<=new Date(draft.starts_at)){setError('Expiry must be after the start date.');return;}
  mutex.current=true;setBusy(true);setError('');setNotice('');
  let uploaded:string|null=null;let persisted=false;
  try{
   let imagePath=draft.image_path;
   if(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Choose a JPG, PNG or WebP image up to 5 MB.');
    const extension=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
    const path=`${draft.id}/${crypto.randomUUID()}.${extension}`;
    const result=await supabase.storage.from(BUCKET).upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
    if(result.error){
     const detail=String(result.error.message||'');
     if(/row.level security|42501/i.test(detail))throw new Error('MatMove could not upload this image because the current Admin session is not authorized for Homepage Posts artwork. Refresh your Admin session and try again, or remove the image and publish the post without it.');
     throw new Error(`Homepage image upload failed: ${detail||'Please choose another image and retry.'}`);
    }
    uploaded=path;imagePath=path;
   }
   const hasPrice=draft.price_amount.trim()!=='';const price=hasPrice?Number(draft.price_amount):null;if(hasPrice&&(!Number.isFinite(price)||price!<=0||price!>1000000||!/^\\d+(?:\\.\\d{1,2})?$/.test(draft.price_amount.trim())))throw new Error('Enter a valid SLE or USD price with up to two decimal places.');const data={title:draft.title.trim(),summary:draft.summary.trim(),body:draft.body.trim(),image_path:imagePath,starts_at:draft.starts_at?new Date(draft.starts_at).toISOString():null,expires_at:draft.expires_at?new Date(draft.expires_at).toISOString():null,display_order:draft.display_order,price_amount:price,price_currency:hasPrice?draft.price_currency:null};
   const result=await call('save',draft.id,draft.version,data);
   if(result?.id!==draft.id||!Number.isSafeInteger(result.version))throw new Error('The save was not confirmed. Reload before retrying.');
   persisted=true;
   if(draft.image_path&&draft.image_path!==imagePath)void supabase.storage.from(BUCKET).remove([draft.image_path]);
   setFile(null);
   if(result.status!=='published'){
    try{
     const publishedResult=await call('publish',draft.id,result.version);
     if(publishedResult?.id!==draft.id||publishedResult.status!=='published')throw new Error('The post was saved, but publication was not confirmed.');
     setDraft(null);setNotice('Post published. It is live on the customer homepage now, or at its scheduled start time.');
    }catch(publishError){
     setDraft({...draft,version:result.version,image_path:imagePath});
     setError(publishError instanceof Error?publishError.message:'The post was saved, but could not be published. Check published slots and retry.');
    }
   }else{
    setDraft(null);setNotice('Post updated. Your changes are live on the customer homepage.');
   }
   await load();
  }catch(err){if(uploaded&&!persisted)void supabase.storage.from(BUCKET).remove([uploaded]);setError(err instanceof Error?err.message:'The post could not be saved.');}
  finally{mutex.current=false;setBusy(false);}
 }
 async function mutate(action:'publish'|'publish_now'|'unpublish'|'archive'|'status',id:string,version:number,data:any={}){
  if(mutex.current)return;mutex.current=true;setBusy(true);setError('');setNotice('');
  try{const r=await call(action,id,version,data);if(r?.id!==id||!Number.isSafeInteger(r.version))throw new Error('Change was not confirmed. Refresh before retrying.');setArchiveId(null);setNotice(action==='publish_now'?'Post is live on the customer homepage now.':action==='publish'?'Post published. It will appear on the customer homepage when its start time is reached.':action==='unpublish'?'Post unpublished.':'Change saved.');await load();}
  catch(err){setError(err instanceof Error?err.message:'Could not update homepage post.');}
  finally{mutex.current=false;setBusy(false);}
 }
 if(!allowed)return <AdminLayout title="Homepage posts"><p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">This section requires the Customer Messages permission.</p></AdminLayout>;
 const published=posts.filter(p=>p.status==='published'&&!p.deleted_at&&(!p.expires_at||new Date(p.expires_at)>new Date())).length;
 return <AdminLayout title="Homepage posts" subtitle="Save a post to publish it or schedule it for a later Freetown time. You can also make any scheduled post live immediately. Up to three published posts can be active at once.">
  <div className="space-y-5">
   <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><div><p className="text-sm font-black text-emerald-950">Published slots</p><p className="mt-1 text-xs text-emerald-800">Live and scheduled posts use a slot. Only posts inside their start and expiry window show to customers.</p></div><p className="text-2xl font-black tabular-nums text-emerald-900">{published}/3</p></div>
   {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}{notice&&<p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
   <div className="flex flex-wrap gap-2"><button type="button" disabled={busy||!!draft} onClick={()=>{setDraft(fresh());setFile(null);setError('');}} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1554a0] px-4 text-sm font-bold text-white disabled:opacity-50"><Plus size={16}/> Create post</button><button type="button" disabled={busy||loading} onClick={()=>void load()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={15}/> Refresh</button></div>
   {draft&&<form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-widest text-emerald-700">{draft.version?'Edit post':'New post'}</p><h2 className="mt-1 text-lg font-black text-slate-950">Customer homepage content</h2></div><button type="button" disabled={busy} onClick={()=>{setDraft(null);setFile(null);}} aria-label="Close editor" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button></div>
    <div className="grid gap-4 sm:grid-cols-2">
     <label className="block text-xs font-bold text-slate-700 sm:col-span-2">Post title<input required minLength={3} maxLength={80} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} className="mt-1.5 block min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal outline-none focus:border-emerald-600"/></label>
     <label className="block text-xs font-bold text-slate-700 sm:col-span-2">Short description<textarea required minLength={10} maxLength={180} rows={2} value={draft.summary} onChange={e=>setDraft({...draft,summary:e.target.value})} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal outline-none focus:border-emerald-600"/></label>
     <label className="block text-xs font-bold text-slate-700 sm:col-span-2">Full details<textarea required minLength={10} maxLength={4000} rows={5} value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal outline-none focus:border-emerald-600"/></label>
     <div className="grid grid-cols-1 gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 sm:col-span-2 sm:grid-cols-[1fr_160px]"><label className="block text-xs font-bold text-slate-700">Offer price (optional)<input inputMode="decimal" type="number" min="0.01" max="1000000" step="0.01" placeholder="e.g. 250" value={draft.price_amount} onChange={e=>setDraft({...draft,price_amount:e.target.value})} className="mt-1.5 block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-emerald-600"/></label><label className="block text-xs font-bold text-slate-700">Currency<select value={draft.price_currency} onChange={e=>setDraft({...draft,price_currency:e.target.value as "SLE"|"USD"})} className="mt-1.5 block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"><option value="SLE">SLE · Sierra Leone leone</option><option value="USD">USD · US dollar</option></select></label><p className="text-[11px] font-normal text-slate-600 sm:col-span-2">Customers will see the price and currency on the homepage post. Leave the amount blank for posts without a price.</p></div>
     <div className="sm:col-span-2"><p className="mb-2 text-xs font-bold text-slate-700">Post image (JPG, PNG or WebP · max 5 MB)</p><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-700 hover:border-emerald-400"><ImagePlus size={20} className="text-emerald-700"/><span>{file?.name|| (draft.image_path?'Replace current image':'Upload an image')}</span><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/><Upload size={16} className="ml-auto"/></label>{draft.image_path&&!file&&<img src={publicImage(draft.image_path)||''} alt="Current post" className="mt-3 h-28 w-48 rounded-xl object-cover"/>}</div>
     <div className="block text-xs font-bold text-slate-700"><label>Start showing · Freetown time<input type="datetime-local" value={draft.starts_at} onChange={e=>setDraft({...draft,starts_at:e.target.value})} className="mt-1.5 block min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal"/></label><p className="mt-1 font-normal text-slate-500">Leave blank to show immediately after publishing. A future time schedules the post. Freetown uses GMT (UTC+0).</p></div>
     <label className="block text-xs font-bold text-slate-700">Expiry date (optional)<input type="datetime-local" value={draft.expires_at} onChange={e=>setDraft({...draft,expires_at:e.target.value})} className="mt-1.5 block min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal"/></label>
     <label className="block text-xs font-bold text-slate-700">Display order<input type="number" min={0} max={10000} value={draft.display_order} onChange={e=>setDraft({...draft,display_order:Number(e.target.value)})} className="mt-1.5 block min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal"/></label>
    </div>
    <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white disabled:opacity-50">{busy?'Publishing…':'Save & publish'}</button><button type="button" disabled={busy} onClick={()=>{setDraft(null);setFile(null);}} className="min-h-11 rounded-xl border px-5 text-sm font-semibold">Cancel</button></div>
   </form>}
   <section className="space-y-3"><div className="flex items-center gap-2"><Megaphone size={18} className="text-emerald-700"/><h2 className="font-black text-slate-900">Posts</h2></div>
    {loading?<p role="status" className="rounded-xl border bg-white p-5 text-sm text-slate-500">Loading posts…</p>:posts.length===0?<p className="rounded-xl border bg-white p-5 text-sm text-slate-500">No homepage posts yet. Create your first announcement or promotion.</p>:<div className="grid gap-3 lg:grid-cols-2">{posts.map(post=><article key={post.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
     {post.image_path&&<img src={publicImage(post.image_path)||''} alt={post.title} className="max-h-60 w-full bg-slate-50 object-contain"/>}
     <div className="space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${post.status==='published'?post.expires_at&&new Date(post.expires_at).getTime()<=Date.now()?'bg-slate-100 text-slate-600':post.starts_at&&new Date(post.starts_at).getTime()>Date.now()?'bg-amber-100 text-amber-800':'bg-emerald-100 text-emerald-800':post.status==='draft'?'bg-amber-100 text-amber-800':'bg-slate-100 text-slate-600'}`}>{post.status==='published'?(post.expires_at&&new Date(post.expires_at).getTime()<=Date.now()?'Expired':post.starts_at&&new Date(post.starts_at).getTime()>Date.now()?'Scheduled':'Live'):post.status}</span><span className="text-[10px] text-slate-400">v{post.version}</span></div><div><h3 className="font-black text-slate-950">{post.title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{post.summary}</p>{post.price_amount!=null&&post.price_currency&&<p className="mt-2 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-900">{post.price_currency} {Number(post.price_amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</p>}</div><p className="line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{post.body}</p><div className="flex flex-wrap gap-2 text-[10px] text-slate-400"><span>Start: {post.starts_at?new Date(post.starts_at).toLocaleString():'Immediately'}</span>{post.expires_at&&<span>· Expires: {new Date(post.expires_at).toLocaleString()}</span>}</div>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3"><button type="button" disabled={busy||post.status==='archived'} onClick={()=>{setDraft({id:post.id,title:post.title,summary:post.summary,body:post.body,image_path:post.image_path,starts_at:localDate(post.starts_at),expires_at:localDate(post.expires_at),display_order:post.display_order,price_amount:post.price_amount==null?'':String(post.price_amount),price_currency:post.price_currency||'SLE',version:post.version});setFile(null);setError('');}} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold disabled:opacity-40"><PenLine size={13}/> Edit</button>
       {post.status==='published'?<><button type="button" disabled={busy} onClick={()=>void mutate('unpublish',post.id,post.version)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold"><EyeOff size={13}/> Unpublish</button>{post.starts_at&&new Date(post.starts_at).getTime()>Date.now()&&<button type="button" disabled={busy} onClick={()=>void mutate('publish_now',post.id,post.version)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white"><Send size={13}/> Publish now</button>}</>:post.status==='draft'?<><button type="button" disabled={busy||published>=3} onClick={()=>void mutate('publish',post.id,post.version)} title={published>=3?'Unpublish or expire an existing post first':''} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white disabled:opacity-40"><Eye size={13}/> {post.starts_at&&new Date(post.starts_at).getTime()>Date.now()?'Schedule':'Publish'}</button><button type="button" disabled={busy||published>=3} onClick={()=>void mutate('publish_now',post.id,post.version)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-200 px-3 text-xs font-bold text-emerald-800 disabled:opacity-40"><Send size={13}/> Publish now</button></>:null}
       {post.status!=='archived'&&<button type="button" disabled={busy} onClick={()=>setArchiveId(archiveId===post.id?null:post.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-700"><Trash2 size={13}/> Remove</button>}
      </div>{archiveId===post.id&&<div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800">Remove this post from the customer homepage? It will be archived, and the record will remain in Admin history.<div className="mt-2 flex gap-2"><button type="button" disabled={busy} onClick={()=>void mutate('archive',post.id,post.version)} className="rounded-lg bg-rose-700 px-3 py-2 font-bold text-white">Remove post</button><button type="button" onClick={()=>setArchiveId(null)} className="rounded-lg border border-rose-200 px-3 py-2 font-bold">Keep post</button></div></div>}</div>
    </article>)}</div>}
   </section>
   <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-black text-slate-950">Customer enquiries</h2><p className="mt-1 text-xs text-slate-500">Questions submitted from a homepage post appear here.</p></div><CalendarClock size={19} className="text-slate-400"/></div>
    {loading?<p className="mt-4 text-sm text-slate-500">Loading enquiries…</p>:enquiries.length===0?<p className="mt-4 text-sm text-slate-500">No enquiries on this page.</p>:<div className="mt-3 divide-y">{enquiries.map(item=><article key={item.id} className="space-y-2 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900">{item.post_title_snapshot}</h3><p className="mt-1 text-xs text-slate-500">{item.customer_name||'Customer'} · {item.customer_email||'No email'} · {item.customer_phone||'No phone'}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase">{item.status.replace(/_/g,' ')}</span></div><p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{item.message}</p><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-slate-400">{new Date(item.created_at).toLocaleString()}</span><label className="flex items-center gap-2 text-xs font-semibold">Status<select value={item.status} disabled={busy} onChange={e=>void mutate('status',item.id,item.version,{status:e.target.value})} className="min-h-9 rounded-lg border px-2">{['new','contacted','in_progress','completed','cancelled'].map(v=><option key={v} value={v}>{v.replace(/_/g,' ')}</option>)}</select></label></div></article>)}</div>}
    <div className="mt-4 flex items-center gap-3 text-xs"><button type="button" disabled={busy||page===0} onClick={()=>setPage(p=>p-1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>Page {page+1}</span><button type="button" disabled={busy||!more} onClick={()=>setPage(p=>p+1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>
   </section>
  </div>
 </AdminLayout>;
}
