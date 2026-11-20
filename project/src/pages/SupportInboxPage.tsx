import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {MessageCircle,RefreshCw,Search,Send,UserRound,Inbox} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import {canAccess,useAdminAccess} from '@/lib/adminAccess';
import {supabase} from '@/lib/supabase';

type Status='open'|'in_review'|'waiting_customer'|'resolved';
type Ticket={id:string;ticket_number:string;customer_id:string;customer_name:string;customer_email:string|null;customer_phone:string|null;subject:string;category:string;status:Status;created_at:string;updated_at:string;last_message_at:string;last_message:string;unread_count:number};
type Message={id:string;sender_type:'customer'|'admin';body:string;created_at:string;read_at:string|null};
const statuses:Status[]=['open','in_review','waiting_customer','resolved'];
const label=(value:string)=>value.replace(/_/g,' ');
const ticketRef=(value:string)=>'MM-'+String(value).padStart(6,'0');
const validTicket=(x:any):x is Ticket=>!!x&&typeof x.id==='string'&&typeof x.ticket_number==='string'&&typeof x.customer_id==='string'&&typeof x.customer_name==='string'&&typeof x.subject==='string'&&typeof x.category==='string'&&statuses.includes(x.status)&&typeof x.last_message==='string';
const validMessage=(x:any):x is Message=>!!x&&typeof x.id==='string'&&['customer','admin'].includes(x.sender_type)&&typeof x.body==='string'&&typeof x.created_at==='string';
function requestKey(){if(typeof crypto!=='undefined'&&crypto.randomUUID)return crypto.randomUUID();throw new Error('Secure message IDs are unavailable in this browser.');}

export default function SupportInboxPage(){
 const access=useAdminAccess(),allowed=canAccess(access,'support');
 const [filter,setFilter]=useState<'all'|Status>('all'),[tickets,setTickets]=useState<Ticket[]>([]);
 const [selected,setSelected]=useState<Ticket|null>(null),[messages,setMessages]=useState<Message[]>([]);
 const [search,setSearch]=useState(''),[draft,setDraft]=useState(''),[replyStatus,setReplyStatus]=useState<'waiting_customer'|'resolved'>('waiting_customer');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const selectedRef=useRef<Ticket|null>(null),mounted=useRef(false),lock=useRef(false),currentActor=useRef(access?.id);
 selectedRef.current=selected;currentActor.current=access?.id;

 const load=useCallback(async()=>{
  if(!allowed)return;
  const actor=access?.id;
  const {data,error}=await supabase.rpc('matmove_support_admin_list',{p_status:filter});
  if(error)throw new Error(error.message||'Support inbox could not be loaded.');
  if(!Array.isArray(data?.items)||!data.items.every(validTicket)||data.actor_id!==actor)throw new Error('Support inbox access could not be verified.');
  if(!mounted.current||currentActor.current!==actor)return;
  setTickets(data.items);
  const current=selectedRef.current;
  if(current){const fresh=data.items.find((t:Ticket)=>t.id===current.id);if(fresh)setSelected(fresh);}
 },[allowed,access?.id,filter]);

 const loadMessages=useCallback(async(id:string)=>{
  const actor=access?.id;
  const {data,error}=await supabase.rpc('matmove_support_admin_messages',{p_conversation_id:id});
  if(error)throw new Error(error.message||'Support conversation could not be loaded.');
  if(!Array.isArray(data?.messages)||!data.messages.every(validMessage)||data.actor_id!==actor||data.conversation?.id!==id)throw new Error('Support conversation could not be verified.');
  if(!mounted.current||currentActor.current!==actor)return;
  setMessages(data.messages);
 },[access?.id]);

 const refresh=useCallback(async()=>{
  if(lock.current)return;lock.current=true;setLoading(true);setError('');
  try{await load();const current=selectedRef.current;if(current)await loadMessages(current.id);}
  catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Support inbox unavailable.');}
  finally{lock.current=false;if(mounted.current)setLoading(false);}
 },[load,loadMessages]);

 useEffect(()=>{
  mounted.current=true;setTickets([]);setSelected(null);setMessages([]);setLoading(true);
  if(allowed)void refresh();else setLoading(false);
  if(!allowed)return()=>{mounted.current=false;};
  const channel=supabase.channel('matmove-admin-support-inbox')
   .on('postgres_changes',{event:'*',schema:'public',table:'matmove_support_conversations'},()=>{void load().catch(e=>{if(mounted.current)setError(e.message);});})
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'matmove_support_messages'},()=>{
    void load().catch(()=>{});const current=selectedRef.current;if(current)void loadMessages(current.id).catch(()=>{});
   }).subscribe();
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},20000);
  return()=>{mounted.current=false;window.clearInterval(timer);void supabase.removeChannel(channel);};
 },[allowed,access?.id,load,loadMessages,refresh]);

 const filtered=useMemo(()=>{
  const q=search.trim().toLowerCase();
  if(!q)return tickets;
  return tickets.filter(t=>[t.ticket_number,t.subject,t.category,t.customer_name,t.customer_email||'',t.customer_phone||'',t.last_message].join(' ').toLowerCase().includes(q));
 },[tickets,search]);

 async function openTicket(ticket:Ticket){
  setSelected(ticket);selectedRef.current=ticket;setMessages([]);setError('');setNotice('');
  try{await loadMessages(ticket.id);await load();}
  catch(e){setError(e instanceof Error?e.message:'Conversation could not be opened.');}
 }

 async function updateStatus(value:Status){
  const current=selectedRef.current;if(!current||busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const {data,error}=await supabase.rpc('matmove_support_admin_status',{p_conversation_id:current.id,p_status:value});
   if(error)throw new Error(error.message||'Ticket status could not be changed.');
   if(data?.id!==current.id||data?.status!==value)throw new Error('Ticket status change could not be confirmed.');
   setNotice('Ticket status updated.');await load();setSelected(old=>old?{...old,status:value}:old);
  }catch(e){setError(e instanceof Error?e.message:'Ticket status update failed.');}
  finally{setBusy(false);}
 }

 async function sendReply(e:FormEvent){
  e.preventDefault();const current=selectedRef.current,clean=draft.trim();
  if(!current||!clean||busy)return;
  setBusy(true);setError('');setNotice('');
  const key=requestKey();
  try{
   const {data,error}=await supabase.rpc('matmove_support_admin_reply',{p_conversation_id:current.id,p_request_key:key,p_body:clean,p_status:replyStatus});
   if(error)throw new Error(error.message||'Reply could not be sent.');
   if(data?.conversation_id!==current.id||typeof data.id!=='string'||data.status!==replyStatus)throw new Error('Reply was not confirmed. Reload the ticket before retrying.');
   setDraft('');setNotice('Reply sent to the customer.');await Promise.all([loadMessages(current.id),load()]);
   setSelected(old=>old?{...old,status:replyStatus}:old);
  }catch(e){setError(e instanceof Error?e.message:'Reply could not be sent.');}
  finally{setBusy(false);}
 }

 const counts={open:tickets.filter(t=>t.status==='open').length,in_review:tickets.filter(t=>t.status==='in_review').length,waiting_customer:tickets.filter(t=>t.status==='waiting_customer').length,resolved:tickets.filter(t=>t.status==='resolved').length};
 if(!allowed)return <AdminLayout title="Customer Support"><p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">The Customer Support assignment is required to open this inbox.</p></AdminLayout>;

 return <AdminLayout title="Customer Support" subtitle="Private two-way conversations between customers and the MatMove team.">
  <div className="space-y-4">
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    <div className="rounded-xl border bg-white p-3"><p className="text-xs text-slate-500">Open</p><p className="mt-1 text-2xl font-black tabular-nums">{counts.open}</p></div>
    <div className="rounded-xl border bg-white p-3"><p className="text-xs text-slate-500">In review</p><p className="mt-1 text-2xl font-black tabular-nums">{counts.in_review}</p></div>
    <div className="rounded-xl border bg-white p-3"><p className="text-xs text-slate-500">Waiting for customer</p><p className="mt-1 text-2xl font-black tabular-nums">{counts.waiting_customer}</p></div>
    <div className="rounded-xl border bg-white p-3"><p className="text-xs text-slate-500">Resolved</p><p className="mt-1 text-2xl font-black tabular-nums">{counts.resolved}</p></div>
   </div>
   {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
   {notice&&<p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
   <div className="grid min-h-[620px] gap-4 xl:grid-cols-[minmax(300px,.85fr)_minmax(0,1.4fr)]">
    <section className="min-w-0 overflow-hidden rounded-2xl border bg-white">
     <div className="space-y-3 border-b p-3">
      <div className="flex items-center justify-between gap-2"><h2 className="font-black">Support inbox</h2><button type="button" disabled={loading} onClick={()=>void refresh()} aria-label="Refresh support inbox" className="rounded-lg border p-2 text-slate-600"><RefreshCw size={16}/></button></div>
      <label className="relative block"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ticket, customer or message" className="min-h-11 w-full rounded-xl border pl-9 pr-3 text-sm"/></label>
      <select value={filter} onChange={e=>setFilter(e.target.value as any)} className="min-h-11 w-full rounded-xl border bg-white px-3 text-sm font-semibold"><option value="all">All statuses</option>{statuses.map(s=><option key={s} value={s}>{label(s)}</option>)}</select>
     </div>
     <div className="max-h-[660px] overflow-y-auto">
      {loading&&tickets.length===0?<p role="status" className="p-5 text-sm text-slate-500">Loading support requests…</p>:filtered.length===0?<div className="px-5 py-10 text-center"><Inbox className="mx-auto text-slate-300" size={32}/><p className="mt-3 text-sm font-bold text-slate-700">{search?'No matching support requests':'No support requests yet'}</p><p className="mt-1 text-xs text-slate-500">New customer questions will appear here.</p></div>:filtered.map(t=><button type="button" key={t.id} onClick={()=>void openTicket(t)} className={selected?.id===t.id?'block w-full border-b border-l-4 border-l-emerald-600 bg-emerald-50 p-3 text-left':'block w-full border-b border-l-4 border-l-transparent p-3 text-left transition hover:bg-slate-50'}>
       <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black text-emerald-800">{ticketRef(t.ticket_number)}</span><span className="text-[10px] capitalize text-slate-500">{label(t.status)}</span></div>
       <p className="mt-1 truncate text-sm font-bold text-slate-900">{t.subject}</p>
       <p className="mt-1 truncate text-xs text-slate-500">{t.customer_name} · {t.category}</p>
       <p className="mt-1 truncate text-xs text-slate-500">{t.last_message}</p>
       <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] text-slate-400">{new Date(t.last_message_at).toLocaleString()}</span>{t.unread_count>0&&<span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">{t.unread_count} new</span>}</div>
      </button>)}
     </div>
    </section>
    <section className="flex min-w-0 flex-col rounded-2xl border bg-white">
     {!selected?<div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><MessageCircle size={38} className="text-slate-300"/><h2 className="mt-3 font-black text-slate-800">Choose a support request</h2><p className="mt-1 max-w-sm text-sm text-slate-500">Select a customer message on the left to view the full conversation and reply.</p></div>:<>
      <div className="space-y-3 border-b p-4">
       <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-black text-emerald-800">{ticketRef(selected.ticket_number)} · {selected.category}</p><h2 className="mt-1 break-words text-lg font-black text-slate-950">{selected.subject}</h2></div><select aria-label="Update support status" value={selected.status} disabled={busy} onChange={e=>void updateStatus(e.target.value as Status)} className="min-h-10 rounded-xl border bg-white px-3 text-xs font-bold capitalize">{statuses.map(s=><option key={s} value={s}>{label(s)}</option>)}</select></div>
       <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600"><span className="inline-flex items-center gap-1"><UserRound size={14}/>{selected.customer_name}</span>{selected.customer_email&&<a className="break-all underline" href={'mailto:'+selected.customer_email}>{selected.customer_email}</a>}{selected.customer_phone&&<span>{selected.customer_phone}</span>}</div>
       <p className="text-[10px] text-slate-400">Created {new Date(selected.created_at).toLocaleString()}</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
       {messages.length===0&&<p className="py-10 text-center text-sm text-slate-500">No messages could be displayed.</p>}
       {messages.map(m=><div key={m.id} className={m.sender_type==='admin'?'flex justify-end':'flex justify-start'}><article className={m.sender_type==='admin'?'max-w-[88%] rounded-2xl bg-indigo-700 px-4 py-3 text-white':'max-w-[88%] rounded-2xl bg-slate-100 px-4 py-3 text-slate-900'}><p className={m.sender_type==='admin'?'mb-1 text-[10px] font-bold text-indigo-100':'mb-1 text-[10px] font-bold text-slate-500'}>{m.sender_type==='admin'?'MatMove Support (you)':'Customer'}</p><p className="whitespace-pre-wrap break-words text-sm leading-6">{m.body}</p><p className={m.sender_type==='admin'?'mt-2 text-right text-[9px] text-indigo-100':'mt-2 text-right text-[9px] text-slate-400'}>{new Date(m.created_at).toLocaleString()}</p></article></div>)}
      </div>
      <form onSubmit={sendReply} className="space-y-3 border-t p-4">
       <div className="flex flex-wrap items-center justify-between gap-2"><label className="text-xs font-bold text-slate-600">After sending reply<select value={replyStatus} onChange={e=>setReplyStatus(e.target.value as any)} disabled={busy} className="ml-2 min-h-9 rounded-lg border px-2 font-semibold text-slate-800"><option value="waiting_customer">Wait for customer</option><option value="resolved">Resolve ticket</option></select></label><span className="text-[10px] text-slate-400">Up to 2,000 characters</span></div>
       <textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={3} maxLength={2000} disabled={busy} placeholder="Write your reply to the customer…" className="block w-full resize-y rounded-xl border p-3 text-sm"/>
       <div className="flex justify-end"><button type="submit" disabled={busy||!draft.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white disabled:opacity-50">{busy?'Sending…':<><Send size={16}/> Send reply</>}</button></div>
      </form>
     </>}
    </section>
   </div>
   <p className="text-[11px] text-slate-500">Customer Support is private. Do not ask customers to send passwords, passcodes, one-time codes or full payment-card details.</p>
  </div>
 </AdminLayout>;
}
