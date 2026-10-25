
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
    router:'export const Link="a";export const useLocation=()=>({pathname:"/reports",search:""});',
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
