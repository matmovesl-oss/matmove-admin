
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const user='11111111-1111-4111-8111-111111111111';
const owner={id:user,is_owner:true,is_active:true,permissions:[]};
const customer={id:'customers',title:'Customer accounts',permission:'customers',available:true,columns:['id','email'],note:'Database history'};
const win={...customer,id:'spin_winnings',title:'Wheel winnings',permission:'games.winnings'};
const complete=(rows=[{id:'1',email:'test@example.com'}])=>({actor:user,report:'customers',columns:customer.columns,rows,complete:true,cutoff:'2026-10-24T12:00:00Z',note:'Database history'});
function text(n){if(n==null||typeof n==='boolean')return'';if(typeof n!=='object')return String(n);if(Array.isArray(n))return n.map(text).join('');return text(n.props?.children);}
function nodes(n){if(!n||typeof n!=='object')return[];if(Array.isArray(n))return n.flatMap(nodes);return[n,...nodes(n.props?.children)];}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
async function bundle(file){
 const dir=await mkdtemp(join(process.cwd(),'.report-ui-')),out=join(dir,'module.mjs');
 try{
  await build({entryPoints:[file],tsconfig:'tsconfig.app.json',outfile:out,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react/*','lucide-react'],plugins:[{name:'report-ui-mocks',setup(b){
   b.onResolve({filter:/^react$/},()=>({path:'hooks',namespace:'mock'}));
   b.onResolve({filter:/^react-router-dom$/},()=>({path:'router',namespace:'mock'}));
   b.onResolve({filter:/^@\/lib\/(adminAccess|adminReports|csvExport|supabase|adminFetch)$/},a=>({path:a.path.split('/').at(-1),namespace:'mock'}));
   b.onResolve({filter:/^@\/components\/AdminLayout$/},()=>({path:'layout',namespace:'mock'}));
   b.onLoad({filter:/.*/,namespace:'mock'},a=>({resolveDir:process.cwd(),contents:({
    hooks:'export const {useState,useEffect,useRef}=globalThis.__reportUI.hooks;',
    router:'export const Link="a";export const useNavigate=()=>()=>{};export const useLocation=()=>({pathname:"/reports",search:""});',
    layout:'export default function Layout(){return null;}',
    adminAccess:`export {canAdminAccess as canAccess} from ${JSON.stringify(join(process.cwd(),'shared/admin-permissions.js'))};import {SECTION_GROUPS} from ${JSON.stringify(join(process.cwd(),'shared/admin-permissions.js'))};export const sections=SECTION_GROUPS.flatMap(g=>g.items);export const useAdminAccess=()=>globalThis.__reportUI.access;`,
    adminReports:'export const loadReportCatalog=(...a)=>globalThis.__reportUI.catalog(...a);export const loadCompleteReport=(...a)=>globalThis.__reportUI.history(...a);',
    csvExport:'export const exportCompleteCsv=(...a)=>globalThis.__reportUI.download(...a);',
    supabase:'export const supabase=globalThis.__reportUI.db;',
    adminFetch:'export const adminFetch=(...a)=>globalThis.__reportUI.fetch(...a);'
   })[a.path]}));
  }}]});return {module:await import(pathToFileURL(out)),close:()=>rm(dir,{recursive:true,force:true})};
 }catch(e){await rm(dir,{recursive:true,force:true});throw e;}
}
async function page(fn,options={}){
 const slots=[],effects=[],calls={catalog:[],history:[],download:[]};let index=0,dirty=true,tree;
 const changed=(a,b)=>!a||a.length!==b?.length||a.some((v,i)=>!Object.is(v,b[i]));
 globalThis.__reportUI={access:options.access||owner,
  catalog:async(...args)=>{calls.catalog.push(args);return options.catalog?options.catalog(...args):[customer,win];},
  history:async(...args)=>{calls.history.push(args);return options.history?options.history(...args):complete();},
  download:async(...args)=>{calls.download.push(args);return args[0].report.rows.length;},
  hooks:{useState(initial){const i=index++;if(!(i in slots))slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;dirty=true;}];},useRef(initial){const i=index++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(fn,deps){const i=index++,old=slots[i];if(!old||changed(old.deps,deps)){const next={deps,cleanup:old?.cleanup};slots[i]=next;effects.push(()=>{next.cleanup?.();next.cleanup=fn();});}}}
 };
 const b=await bundle('src/pages/ReportsPage.tsx');
 function render(){index=0;dirty=false;tree=b.module.default();while(effects.length)effects.shift()();}
 async function settle(){for(let n=0;n<12;n++){if(dirty)render();await new Promise(r=>setImmediate(r));if(n>5&&!dirty)break;}if(dirty)render();}
 const findButton=label=>{const n=nodes(tree).find(n=>n.type==='button'&&text(n).trim()===label);assert.ok(n,`Missing ${label}: ${text(tree)}`);return n;};
 const h={calls,settle,get text(){return text(tree);},get tree(){return tree;},button:findButton,async click(label){const n=findButton(label);assert.ok(!n.props.disabled);n.props.onClick();await settle();},async access(value){globalThis.__reportUI.access=value;dirty=true;await settle();},unmount(){for(const slot of slots)slot?.cleanup?.();}};
 try{await settle();await fn(h);}finally{h.unmount();await b.close();delete globalThis.__reportUI;}
}
test('reports are restricted to current assignments; unassigned users never fetch a catalog',async()=>{
 await page(async h=>{assert.match(h.text,/Access denied/);assert.equal(h.calls.catalog.length,0);},{access:{...owner,is_owner:false,permissions:[]}});
 await page(async h=>{const select=nodes(h.tree).find(n=>n.type==='select');assert.match(text(select),/Customer accounts/);assert.doesNotMatch(text(select),/Wheel winnings/);},{access:{...owner,is_owner:false,permissions:['customers']}});
});
test('one export click loads all history before downloading; double clicks do not create duplicate downloads',async()=>{
 const wait=deferred();let progress;
 await page(async h=>{
  const button=h.button('Export complete CSV');button.props.onClick();button.props.onClick();await h.settle();
  assert.equal(h.calls.history.length,1);assert.equal(h.calls.download.length,0);
  progress(250);await h.settle();assert.match(h.text,/250 records loaded/);
  wait.resolve(complete());await h.settle();assert.equal(h.calls.download.length,1);assert.match(h.text,/Completed export preview/);assert.match(h.text,/All database pages loaded successfully/);
 },{history:args=>{progress=args.onProgress;return wait.promise;}});
});
test('a failed page never downloads a partial CSV and leaves a clear retry action',()=>page(async h=>{
 await h.click('Export complete CSV');assert.equal(h.calls.download.length,0);assert.match(h.text,/Page unavailable/);assert.match(h.text,/No complete CSV was downloaded/);assert.equal(h.button('Export complete CSV').props.disabled,false);
},{history:async()=>{throw new Error('Page unavailable');}}));
test('cancelling ignores late completion and permits a fresh export',async()=>{
 const first=deferred();let count=0;
 await page(async h=>{
  await h.click('Export complete CSV');await h.click('Cancel export');assert.match(h.text,/Export cancelled/);
  assert.equal(h.calls.history[0][0].signal.aborted,true);
  await h.click('Export complete CSV');assert.equal(h.calls.download.length,1);
  first.resolve(complete());await h.settle();assert.equal(h.calls.download.length,1);
 },{history:()=>++count===1?first.promise:Promise.resolve(complete())});
});
test('permission revocation or unmount cancels a retained export before downloading',async()=>{
 for(const action of ['revoke','unmount']){
  const wait=deferred();await page(async h=>{
   await h.click('Export complete CSV');
   if(action==='revoke')await h.access({...owner,is_owner:false,permissions:[]});else h.unmount();
   wait.resolve(complete());await h.settle();assert.equal(h.calls.download.length,0);
   if(action==='revoke')assert.match(h.text,/Access denied/);
  },{history:()=>wait.promise});
 }
});
test('catalog errors show Retry; a genuinely empty completed report can export headings',async()=>{
 let attempts=0;await page(async h=>{
  assert.match(h.text,/Catalog offline/);await h.click('Retry reports');await h.click('Export complete CSV');
  assert.equal(h.calls.download.length,1);assert.match(h.text,/No records found/);assert.match(h.text,/column headings only/);
 },{catalog:async()=>{if(++attempts===1)throw new Error('Catalog offline');return[customer];},history:async()=>complete([])});
});
async function downloadHarness(fn,{access=owner,sessionUser=user}={}){
 const original={document:globalThis.document,window:globalThis.window,create:URL.createObjectURL,revoke:URL.revokeObjectURL};const blobs=[],anchors=[],revoked=[];
 globalThis.__reportUI={db:{auth:{getSession:async()=>({data:{session:{user:{id:sessionUser}}}})}},fetch:async()=>({ok:true,json:async()=>({access})})};
 globalThis.document={createElement:()=>{const a={click(){a.clicked=true;},remove(){a.removed=true;}};anchors.push(a);return a;},body:{appendChild(){}}};
 globalThis.window={setTimeout:fn=>fn()};URL.createObjectURL=blob=>{blobs.push(blob);return'blob:report';};URL.revokeObjectURL=url=>revoked.push(url);
 const b=await bundle('src/lib/csvExport.ts');
 try{await fn({module:b.module,blobs,anchors,revoked});}finally{await b.close();URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;for(const k of ['document','window'])if(original[k]===undefined)delete globalThis[k];else globalThis[k]=original[k];delete globalThis.__reportUI;}
}
const downloadArgs=(report=complete())=>({userId:user,section:'customers',filename:'../../history',report,signal:new AbortController().signal,isCurrent:()=>true});
test('full CSV uses history naming and precise text amounts, omits nested data, and releases browser resources',()=>downloadHarness(async h=>{
 const report=complete([{id:'1',email:'=unsafe',amount_minor:'9007199254740993',nested:{pin:'SECRET'}}]);report.columns.push('amount_minor','nested');
 assert.equal(await h.module.exportCompleteCsv(downloadArgs(report)),1);const csv=await h.blobs[0].text();
 assert.match(csv,/amount_minor \(SLE cents\)/);assert.match(csv,/9007199254740993/);assert.match(csv,/'=unsafe/);assert.doesNotMatch(csv,/SECRET/);
 assert.match(h.anchors[0].download,/_history_.*\.csv$/);assert.doesNotMatch(h.anchors[0].download,/[\/\\]/);assert.equal(h.anchors[0].clicked,true);assert.equal(h.anchors[0].removed,true);assert.deepEqual(h.revoked,['blob:report']);
}));
test('incomplete, cancelled, revoked or changed-identity reports never create a CSV',async()=>{
 await downloadHarness(async h=>{
  await assert.rejects(h.module.exportCompleteCsv(downloadArgs({...complete(),complete:false})),/complete report/);
  const controller=new AbortController();controller.abort();await assert.rejects(h.module.exportCompleteCsv({...downloadArgs(),signal:controller.signal}),/cancelled/);
  await assert.rejects(h.module.exportCompleteCsv({...downloadArgs(),isCurrent:()=>false}),/cancelled/);assert.equal(h.blobs.length,0);
 });
 await downloadHarness(async h=>{await assert.rejects(h.module.exportCompleteCsv(downloadArgs()),/Access denied/);assert.equal(h.blobs.length,0);},{access:{...owner,is_active:false}});
 await downloadHarness(async h=>{await assert.rejects(h.module.exportCompleteCsv(downloadArgs()),/account changed/);assert.equal(h.blobs.length,0);},{sessionUser:'another-account'});
});
test('Reports navigation and route retain existing section gates and hide Reports for unassigned staff',async()=>{
 const app=await readFile('src/App.tsx','utf8');assert.match(app,/path="\/reports" element=\{sections.some/);for(const route of ['dashboard','dispatch','pricing','games','kyc','financials','transactions','payouts','customers','staff','logs','audit'])assert.ok(app.includes(`path="/${route}"`));
 const slots=[];let i=0;globalThis.__reportUI={access:owner,hooks:{useState:v=>{const n=i++;if(!(n in slots))slots[n]=v;return[slots[n],()=>{}];}},db:{auth:{signOut:async()=>({})}}};
 const b=await bundle('src/components/AdminLayout.tsx');
 try{assert.match(text(b.module.default({children:null,title:'Test'})),/Reports & CSV/);i=0;globalThis.__reportUI.access={...owner,is_owner:false,permissions:[]};assert.doesNotMatch(text(b.module.default({children:null,title:'Test'})),/Reports & CSV/);}finally{await b.close();delete globalThis.__reportUI;}
});

// Admin header Help and message controls, tested alongside Reports navigation.
{
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',mid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const owner={id:uid,is_active:true,is_owner:true,permissions:[]};
const retained={key:mid,actor:uid,audience:'driver',target:null,title:'Driver update',body:'Please check your trip details.',destination:'trips'};
function nodes(n){if(!n||typeof n!=='object')return[];if(Array.isArray(n))return n.flatMap(nodes);return[n,...nodes(n.props?.children)];}
function text(n){if(n==null||typeof n==='boolean')return'';if(typeof n!=='object')return String(n);if(Array.isArray(n))return n.map(text).join('');return text(n.props?.children);}
async function page(fn,{access=owner,saved=null,blocked=false}={}){
 const dir=await mkdtemp(join(process.cwd(),'.admin-assistance-')),out=join(dir,'ui.mjs'),old={window:globalThis.window,sessionStorage:globalThis.sessionStorage,fetch:globalThis.fetch};const slots=[],effects=[],calls=[],navigation=[],storage=new Map();let cursor=0,dirty=true,tree,unmounted=false,identity=uid,latest=access,authoritative=access,handler=null,timer=0;
 const key=`matmove-notification-send:v1:${uid}`;if(saved!==null)storage.set(key,typeof saved==='string'?saved:JSON.stringify(saved));
 const changed=(a,b)=>!a||a.length!==b?.length||a.some((v,i)=>!Object.is(v,b[i]));
 globalThis.__adminAssistHooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;dirty=true;}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||changed(old.deps,deps)){const s={deps,cleanup:old?.cleanup};slots[i]=s;effects.push(()=>{s.cleanup?.();s.cleanup=fn();});}}};
 globalThis.__adminAssistAccess=()=>latest;globalThis.__adminAssistNavigate=d=>navigation.push(d);globalThis.window={setTimeout:()=>++timer,clearTimeout(){}};
 globalThis.sessionStorage={getItem:k=>{if(blocked)throw Error('Storage blocked');return storage.get(k)||null;},setItem:(k,v)=>{if(blocked)throw Error('Storage blocked');storage.set(k,v);},removeItem:k=>storage.delete(k)};
 globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/admin-staff?view=me');assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,`Bearer token-${uid}`);calls.push({name:'staff-self-session'});if(handler){const value=await handler('staff-self-session',{});if(value!==undefined)return value;}return{ok:true,json:async()=>({access:authoritative})};};
 globalThis.__adminAssistDb={auth:{getSession:async()=>({data:{session:{user:{id:identity},access_token:`token-${identity}`}},error:null})},rpc:async(name,args)=>{calls.push({name,args});if(handler){const value=await handler(name,args);if(value!==undefined)return value;}
  if(name==='matmove_admin_access')throw Error('Private staff RPC must never be called by the browser');
  if(name==='matmove_admin_me')return{data:null,error:{code:'42501',message:'Browser RPC denied'}};
  if(name==='matmove_admin_notification_history')return{data:{actor_id:uid,items:[]},error:null};
  if(name==='matmove_admin_send_notification'){assert.ok(storage.has(key),'Original key must be saved BEFORE POST');return{data:{id:mid,sender_id:uid,request_key:args.p_request_key,recipient_count:args.p_audience==='user'?1:3,created_at:'2026-10-27T14:00:00Z'},error:null};}
  throw Error('Unexpected RPC '+name);
 }};
 try{
  await build({entryPoints:['src/components/AdminAssistance.tsx'],tsconfig:'tsconfig.app.json',outfile:out,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react/*','lucide-react'],plugins:[{name:'admin-assistance-mocks',setup(b){b.onResolve({filter:/^react$/},()=>({path:'hooks',namespace:'mock'}));b.onResolve({filter:/^react-router-dom$/},()=>({path:'router',namespace:'mock'}));b.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'db',namespace:'mock'}));b.onResolve({filter:/^@\/lib\/adminAccess$/},()=>({path:'access',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:{hooks:'export const {useState,useEffect,useRef}=globalThis.__adminAssistHooks;',router:'export const useNavigate=()=>globalThis.__adminAssistNavigate;',db:'export const supabase=globalThis.__adminAssistDb;',access:'export const useAdminAccess=globalThis.__adminAssistAccess;'}[a.path]}));}}]});
  const module=await import(pathToFileURL(out));function render(){cursor=0;dirty=false;tree=module.default();for(const n of nodes(tree))if(n.type==='dialog'&&n.ref&&!n.ref.current)n.ref.current={open:false,showModal(){this.open=true;},close(){this.open=false;}};while(effects.length)effects.shift()();}
  async function settle(){for(let n=0;n<20;n++){if(dirty&&!unmounted)render();await new Promise(r=>setImmediate(r));if(n>9&&!dirty)break;}}
  const button=label=>{const n=nodes(tree).find(n=>n.type==='button'&&(text(n).trim()===label||n.props['aria-label']===label));assert.ok(n,`Missing ${label}: ${text(tree)}`);return n;};
  const h={module,calls,navigation,storage,key,button,settle,get text(){return text(tree);},get nodes(){return nodes(tree);},setIdentity:id=>identity=id,setAuthority:a=>authoritative=a,setHandler:fn=>handler=fn,async access(a){latest=a;dirty=true;await settle();},async field(label,value){const n=nodes(tree).find(n=>n.props?.['aria-label']===label);assert.ok(n,`Missing ${label}`);n.props.onChange({target:{value,checked:value}});await settle();},async click(label){const b=button(label);assert.ok(!b.props.disabled,`${label} disabled`);b.props.onClick();await settle();},async review(){await h.field('Message title','Announcement');await h.field('Message body','Please review the latest app guide.');await h.click('Review message');await h.field('Confirm message audience and contents',true);},unmount(){unmounted=true;for(const s of slots)s?.cleanup?.();}};
  await settle();await fn(h);
 }finally{if(!unmounted)for(const s of slots)s?.cleanup?.();for(const[k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}for(const k of ['__adminAssistHooks','__adminAssistAccess','__adminAssistNavigate','__adminAssistDb'])delete globalThis[k];await rm(dir,{recursive:true,force:true});}
}
test('inactive and unassigned staff cannot load or send messages and customer governance is not a sending grant',()=>page(async h=>{
 assert.ok(!h.nodes.some(n=>n.type==='button'&&text(n)==='Messages'));assert.equal(h.calls.length,0);assert.equal(h.module.canSendMessages({...owner,is_owner:false,permissions:['customers']}),false);await h.access({...owner,is_active:false});assert.equal(h.text,'');assert.equal(h.calls.length,0);
},{access:{...owner,is_owner:false,permissions:['kyc']}}));
test('Admin Help uses local assigned knowledge and makes no API request or staff mutation',()=>page(async h=>{
 await h.click('Help');await h.field('Ask Admin Help','kyc');h.nodes.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await h.settle();await h.click('Open KYC');assert.deepEqual(h.navigation,['/kyc']);assert.equal(h.calls.length,0);
},{access:{...owner,is_owner:false,permissions:['kyc']}}));
test('denied browser staff RPC recovers through verified server permissions without exposing the private RPC',()=>page(async h=>{await h.click('Messages');assert.ok(h.calls.some(c=>c.name==='staff-self-session'));assert.ok(!h.calls.some(c=>c.name==='matmove_admin_access'));assert.ok(!h.text.includes('Access denied'));}));
test('unavailable server permission checks cannot send or invent empty message history',()=>page(async h=>{h.setHandler(name=>name==='staff-self-session'?{ok:false,json:async()=>({error:'Permission service unavailable'})}:undefined);await h.click('Messages');assert.match(h.text,/Permission service unavailable/);await h.review();await h.click('Send message');assert.ok(!h.calls.some(c=>c.name==='matmove_admin_send_notification'));}));
test('mismatched server staff identity never reaches message history or sending',()=>page(async h=>{h.setAuthority({...owner,id:other});await h.click('Messages');assert.ok(!h.calls.some(c=>c.name==='matmove_admin_notification_history'));await h.review();await h.click('Send message');assert.ok(!h.calls.some(c=>c.name==='matmove_admin_send_notification'));}));
test('broadcast requires review and explicit confirmation; duplicate clicks create one original saved send',()=>page(async h=>{
 await h.click('Messages');await h.field('Message title','Announcement');await h.field('Message body','Please review the latest app guide.');await h.click('Review message');assert.equal(h.button('Send message').props.disabled,true);assert.equal(h.calls.some(c=>c.name==='matmove_admin_send_notification'),false);await h.field('Confirm message audience and contents',true);
 const b=h.button('Send message');b.props.onClick();b.props.onClick();await h.settle();const sent=h.calls.filter(c=>c.name==='matmove_admin_send_notification');assert.equal(sent.length,1);assert.equal(sent[0].args.p_audience,'all');assert.equal(sent[0].args.p_title,'Announcement');assert.match(h.text,/Sent to 3 customers/);assert.equal(h.storage.has(h.key),false);
}));
test('role messages send exact role and optional local destination only',()=>page(async h=>{
 await h.click('Messages');await h.field('Message audience','merchant');await h.field('Message destination','wallet');await h.review();await h.click('Send message');const a=h.calls.find(c=>c.name==='matmove_admin_send_notification').args;assert.equal(a.p_audience,'merchant');assert.equal(a.p_destination,'wallet');assert.equal(a.p_target_id,null);
}));
test('single-customer send retains exact reviewed customer ID',()=>page(async h=>{
 await h.click('Messages');await h.field('Message audience','user');await h.field('Message customer ID',other);await h.review();await h.click('Send message');assert.equal(h.calls.find(c=>c.name==='matmove_admin_send_notification').args.p_target_id,other);assert.match(h.text,/Sent to 1 customer/);
}));
test('changed authenticated identity or revoked authoritative grant prevents the send RPC',()=>page(async h=>{
 await h.click('Messages');await h.review();h.setIdentity(other);await h.click('Send message');assert.equal(h.calls.some(c=>c.name==='matmove_admin_send_notification'),false);assert.match(h.text,/sign-in changed/);
 h.setIdentity(uid);h.setAuthority({...owner,is_owner:false,permissions:[]});await h.click('Send message');assert.equal(h.calls.some(c=>c.name==='matmove_admin_send_notification'),false);assert.match(h.text,/Access denied/);
}));
test('lost response retains the original payload and key; explicit retry cannot create a new message',()=>page(async h=>{
 let count=0;h.setHandler((name,args)=>{if(name==='matmove_admin_send_notification'&&++count===1)return{data:null,error:{message:'Lost response'}};});await h.click('Messages');await h.review();await h.click('Send message');assert.match(h.text,/Original request retained/);const first=h.calls.find(c=>c.name==='matmove_admin_send_notification').args;assert.ok(h.storage.has(h.key));await h.click('Check / retry original message');const sends=h.calls.filter(c=>c.name==='matmove_admin_send_notification');assert.equal(sends.length,2);assert.deepEqual(sends[1].args,first);assert.match(h.text,/Sent to 3 customers/);
}));
test('restored request never automatically sends and can only retry its stored exact payload',()=>page(async h=>{
 assert.equal(h.calls.length,0);await h.click('Messages');assert.ok(!h.calls.some(c=>c.name==='matmove_admin_send_notification'));assert.match(h.text,/Original request retained/);await h.click('Check / retry original message');const p=h.calls.find(c=>c.name==='matmove_admin_send_notification').args;assert.equal(p.p_request_key,retained.key);assert.equal(p.p_title,retained.title);assert.equal(p.p_audience,'driver');
},{saved:retained}));
test('blocked or corrupt storage cannot replace an uncertain retained request with a new send',()=>page(async h=>{
 await h.click('Messages');await h.field('Message title','Hello');await h.field('Message body','Review your app.');assert.equal(h.button('Review message').props.disabled,true);assert.match(h.text,/saved request could not be read/);assert.equal(h.calls.some(c=>c.name==='matmove_admin_send_notification'),false);
},{saved:'not-valid-json'}));
test('an invalid send receipt stays unconfirmed and history failures show Retry guidance rather than empty history',()=>page(async h=>{
 h.setHandler((name,args)=>{if(name==='matmove_admin_send_notification')return{data:{id:mid,sender_id:other,request_key:args.p_request_key,recipient_count:3,created_at:'2026-10-27T14:00:00Z'},error:null};if(name==='matmove_admin_notification_history')return{data:null,error:{message:'History failed'}};});await h.click('Messages');assert.match(h.text,/History failed/);assert.ok(!h.text.includes('No messages sent yet'));await h.review();await h.click('Send message');assert.match(h.text,/receipt could not be verified/);assert.ok(!h.text.includes('Sent to 3 customers'));assert.ok(h.storage.has(h.key));
}));
test('permission revocation hides retained content and prevents a delayed send receipt from reporting success',()=>page(async h=>{
 let resolve;h.setHandler(name=>name==='matmove_admin_send_notification'?new Promise(r=>resolve=r):undefined);await h.click('Messages');await h.review();h.button('Send message').props.onClick();await h.settle();assert.ok(resolve);await h.access({...owner,is_owner:false,permissions:['kyc']});resolve({data:{id:mid,sender_id:uid,request_key:JSON.parse(h.storage.get(h.key)).key,recipient_count:3,created_at:'2026-10-27T14:00:00Z'},error:null});await h.settle();assert.ok(!h.text.includes('Sent to 3 customers'));assert.ok(!h.text.includes('Announcement'));assert.ok(h.storage.has(h.key));
}));
test('payload validation rejects external links, malformed IDs and untrimmed/oversized message text',()=>page(async h=>{
 for(const patch of [{target:other},{destination:'https://bad.example'},{key:'bad'},{title:'  Title  '},{body:'x'.repeat(2001)}])assert.throws(()=>h.module.validateMessageDraft({...retained,...patch},uid));
 const layout=await readFile('src/components/AdminLayout.tsx','utf8');assert.match(layout,/<AdminAssistance key=\{access\?\.id/);assert.match(layout,/canAccess\(access,item.key\)/);assert.ok(layout.includes('Reports & CSV'));assert.ok(layout.includes('Games — Spin & Win'));
}));
test('blocked browser storage fails before any send, while notification Help can open the assigned message controls',()=>page(async h=>{
 await h.click('Help');await h.field('Ask Admin Help','broadcast notification');h.nodes.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await h.settle();await h.click('Open Messages');assert.match(h.text,/Customer messages/);assert.equal(h.button('Review message').props.disabled,true);assert.equal(h.calls.some(c=>c.name==='matmove_admin_send_notification'),false);
},{blocked:true}));

}
