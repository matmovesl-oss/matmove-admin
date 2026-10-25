
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {build,transform} from 'esbuild';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fetchGatewayPage,GATEWAY_REPORTS} from '../server/monime-reports.js';
import {createReportHandler} from '../server/admin-reports.js';
const actor='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const env={SUPABASE_SERVICE_ROLE_KEY:'test-only-signing-key',MONIME_API_KEY:'test-only-server-token',MONIME_SPACE_ID:'spc-test-only'};
const now=Date.parse('2026-10-25T10:00:00Z');
const record=(n,extra={})=>({id:'txn-'+n,type:'credit',amount:{currency:'SLE',value:200},timestamp:'2026-10-24T10:00:00Z',reference:'ref-'+n,financialAccount:{id:'fac-customer',balance:{after:{currency:'SLE',value:200}}},...extra});
const reply=(result=[],next=null)=>({success:true,result,pagination:{count:result.length,next}});
const res=()=>({setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
function api(fetcher,{permissions=['transactions'],settings=env}={}){
 let access={id:actor,is_active:true,is_owner:false,permissions};let dbPermissions=permissions;const authorizations=[];
 const handler=createReportHandler({env:settings,fetcher,now:()=>now,authorize:async(req)=>{
  authorizations.push(req);return {user:{id:actor},access,client:{rpc:async(name,args)=>{assert.equal(name,'matmove_admin_report_catalog');assert.equal(args.p_actor,actor);return {data:dbPermissions.map(permission=>({id:'db_'+permission,title:'Database report',permission,columns:['id'],available:true}))};}}};
 }});
 return {handler,authorizations,revokeDatabase:()=>{dbPermissions=[];},revoke:()=>{access={...access,permissions:[]};dbPermissions=[];}};
}
const request=(report='monime_transactions',cursor)=>({method:'GET',url:'/api/admin-staff',query:{view:'report-page',report,...(cursor?{cursor}:{})}});
test('gateway export follows real opaque cursors across 103 records; every page rechecks the current assignment',async()=>{
 const fetches=[];
 const h=api(async(url,options)=>{
  fetches.push({url:String(url),options});const after=url.searchParams.get('after');
  const start=after===null?0:after==='opaque-one'?50:after==='opaque-two'?100:-1;assert.ok(start>=0);
  const rows=Array.from({length:Math.min(50,103-start)},(_,i)=>record(start+i));return {ok:true,json:async()=>reply(rows,start===0?'opaque-one':start===50?'opaque-two':null)};
 });
 const ids=[];let cursor;let complete=false;
 do{const r=res();await h.handler(request('monime_transactions',cursor),r);assert.equal(r.code,200);assert.equal(r.body.source,'gateway');ids.push(...r.body.rows.map(row=>row.id));complete=r.body.complete;cursor=r.body.cursor;}while(cursor);
 assert.equal(complete,true);assert.equal(ids.length,103);assert.equal(new Set(ids).size,103);assert.equal(fetches.length,3);assert.equal(h.authorizations.length,3);
 for(const {url,options} of fetches){assert.equal(new URL(url).origin,'https://api.monime.io');assert.equal(new URL(url).pathname,'/v1/financial-transactions');assert.equal(new URL(url).searchParams.get('limit'),'50');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers['Monime-Version'],'caph.2025-08-23');assert.equal(options.headers.Authorization,'Bearer '+env.MONIME_API_KEY);assert.ok(options.signal);}
});
test('a short page still follows next; absent next inside a valid pagination object is terminal',async()=>{
 let calls=0;const h=api(async()=>({ok:true,json:async()=>++calls===1?reply([record(1)],'continue'):{success:true,result:null,pagination:{count:0}}}));
 const a=res();await h.handler(request(),a);assert.equal(a.body.complete,false);const b=res();await h.handler(request('monime_transactions',a.body.cursor),b);assert.equal(b.code,200);assert.equal(b.body.complete,true);assert.deepEqual(b.body.rows,[]);
});
test('payout projection keeps currencies, receipt references and exact fees while excluding account numbers and metadata',async()=>{
 const payload={id:'pyt-one',status:'completed',amount:{currency:'USD',value:12345},source:{financialAccountId:'fac-source',transactionReference:'source-ref'},destination:{type:'bank',providerId:'bank-one',accountNumber:'PRIVATE_ACCOUNT',transactionReference:'destination-ref'},fees:[{code:'provider_fee',amount:{currency:'USD',value:123},metadata:{secret:'PRIVATE_FEE'}}],metadata:{pin:'SECRET_PIN'},ownershipGraph:{private:'PRIVATE_GRAPH'},failureDetail:null};
 const page=await fetchGatewayPage({report:'monime_payouts',env,fetcher:async(url)=>{assert.equal(url.pathname,'/v1/payouts');return {ok:true,json:async()=>reply([payload])};}});
 const row=page.rows[0];assert.equal(row.currency,'USD');assert.equal(row.amount_value,'12345');assert.equal(row.status,'completed');assert.equal(row.destination_reference,'destination-ref');assert.deepEqual(JSON.parse(row.fee_details),[{code:'provider_fee',currency:'USD',amount_value:'123'}]);assert.doesNotMatch(JSON.stringify(row),/PRIVATE|SECRET/);assert.equal(page.complete,true);
});
test('malformed pagination, duplicate records and unsafe amounts never become a complete gateway page',async()=>{
 const examples=[{success:true,result:[]},reply([record(1)],''),reply([record(1)],'same'),reply([],'more'),reply([record(1),record(1)]),reply([record(1,{amount:{currency:'SLE',value:9007199254740992}})]),{success:false,result:[],pagination:{}}];
 for(const body of examples)await assert.rejects(fetchGatewayPage({report:'monime_transactions',after:'same',env,fetcher:async()=>({ok:true,json:async()=>body})}),/unexpected report page/);
});
test('provider failures and missing server settings never return partial data or expose credentials',async()=>{
 for(const status of [429,500]){const h=api(async()=>({ok:false,status,json:async()=>({message:env.MONIME_API_KEY})}));const r=res();await h.handler(request(),r);assert.ok([502,503].includes(r.code));assert.ok(!JSON.stringify(r.body).includes(env.MONIME_API_KEY));assert.equal(r.body.rows,undefined);}
 await assert.rejects(fetchGatewayPage({report:'monime_transactions',env:{VITE_MONIME_API_KEY:'browser-key'},fetcher:async()=>assert.fail('must not fetch')}),/settings are missing/);
});
test('cross-user, cross-report, changed-space and revoked-access continuations cannot fetch another provider page',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return {ok:true,json:async()=>reply([record(1)],'next')};};const h=api(fetcher);const first=res();await h.handler(request(),first);assert.equal(first.code,200);
 const changed=res();await h.handler({...request('monime_transactions',first.body.cursor),query:{...request('monime_transactions',first.body.cursor).query,actor:other}},changed);assert.equal(changed.code,409);
 const payout=api(fetcher,{permissions:['payouts']});const wrong=res();await payout.handler(request('monime_payouts',first.body.cursor),wrong);assert.equal(wrong.code,400);
 const rotated=api(fetcher,{settings:{...env,MONIME_SPACE_ID:'spc-other'}});const mismatch=res();await rotated.handler(request('monime_transactions',first.body.cursor),mismatch);assert.equal(mismatch.code,400);
 const withdrawn=api(fetcher);withdrawn.revokeDatabase();const dbDenied=res();await withdrawn.handler(request(),dbDenied);assert.equal(dbDenied.code,403);
 h.revoke();const denied=res();await h.handler(request('monime_transactions',first.body.cursor),denied);assert.equal(denied.code,403);assert.equal(calls,1);
});
test('gateway cursors accept the documented 2000-character provider cursor and remain bound to the same request',async()=>{
 for(const opaque of ['a'.repeat(2000),'☃'.repeat(2000)]){
  let calls=0;const h=api(async(url)=>{calls++;if(calls===2)assert.equal(url.searchParams.get('after'),opaque);return {ok:true,json:async()=>reply(calls===1?[record(1)]:[],calls===1?opaque:null)};});
  const a=res();await h.handler(request(),a);assert.equal(a.code,200);const b=res();await h.handler(request('monime_transactions',a.body.cursor),b);assert.equal(b.code,200);assert.equal(b.body.complete,true);
 }
});
test('catalog shows only assigned gateway reports and GET is required before any provider request',async()=>{
 const h=api(async()=>assert.fail('catalog must not fetch provider'));const r=res();await h.handler({method:'GET',url:'/api/admin-staff?view=report-catalog'},r);assert.deepEqual(r.body.reports.filter(r=>r.source==='gateway').map(r=>r.id),['monime_transactions']);
 const post=res();await h.handler({...request(),method:'POST'},post);assert.equal(post.code,405);
});
async function collector(pages){
 let source=await readFile(new URL('../src/lib/adminReports.ts',import.meta.url),'utf8');source=source.replace("import {adminFetch} from './adminFetch';",'const adminFetch=globalThis.__gatewayClient.fetch;').replace("import {supabase} from './supabase';",'const supabase=globalThis.__gatewayClient.db;');let calls=0;
 globalThis.__gatewayClient={fetch:async()=>({ok:true,json:async()=>pages[calls++]}),db:{auth:{getSession:async()=>({data:{session:{user:{id:actor}}}})}}};
 const out=await transform(source,{loader:'ts',format:'esm',target:'es2022'});const module=await import('data:text/javascript;base64,'+Buffer.from(out.code+'\n//'+Math.random()).toString('base64'));return {module,calls:()=>calls};
}
const clientPage=(rows,cursor=null)=>({actor,report:'monime_transactions',source:'gateway',columns:GATEWAY_REPORTS[0].columns,rows,cursor,complete:cursor===null,cutoff:new Date(now).toISOString(),note:'Provider minor units'});
test('client collects all gateway pages, preserves the gateway source and rejects duplicate IDs across pages',async()=>{
 const a=await collector([clientPage([{id:'one'}],'next'),clientPage([{id:'two'}])]);const result=await a.module.loadCompleteReport({userId:actor,report:GATEWAY_REPORTS[0]});assert.equal(result.rows.length,2);assert.equal(result.source,'gateway');assert.equal(a.calls(),2);
 const b=await collector([clientPage([{id:'one'}],'next'),clientPage([{id:'one'}])]);await assert.rejects(b.module.loadCompleteReport({userId:actor,report:GATEWAY_REPORTS[0]}),/duplicate/);
 delete globalThis.__gatewayClient;
});
test('cancellation during the gateway pacing delay prevents the next page request',async()=>{
 const h=await collector([clientPage([{id:'one'}],'next')]);const controller=new AbortController();
 const promise=h.module.loadCompleteReport({userId:actor,report:GATEWAY_REPORTS[0],signal:controller.signal,onProgress:()=>setTimeout(()=>controller.abort(),10)});
 await assert.rejects(promise,/cancelled/);assert.equal(h.calls(),1);delete globalThis.__gatewayClient;
});
// Render the actual Reports page with controlled hooks to ensure gateway data is
// labelled as read-time history rather than a database creation snapshot.
test('Reports UI labels gateway history and preserves its currency/unit fields in the complete result',async()=>{
 const dir=await mkdtemp(join(process.cwd(),'.gateway-ui-')),out=join(dir,'ui.mjs');const slots=[],effects=[];let i=0,dirty=true,tree;const access={id:actor,is_owner:true,is_active:true,permissions:[]};
 const changed=(a,b)=>!a||a.length!==b?.length||a.some((v,j)=>!Object.is(v,b[j]));
 globalThis.__gatewayUI={hooks:{useState(initial){const n=i++;if(!(n in slots))slots[n]={value:typeof initial==='function'?initial():initial};return[slots[n].value,v=>{slots[n].value=typeof v==='function'?v(slots[n].value):v;dirty=true;}];},useRef(initial){const n=i++;if(!(n in slots))slots[n]={current:initial};return slots[n];},useEffect(fn,deps){const n=i++,old=slots[n];if(!old||changed(old.deps,deps)){const next={deps,cleanup:old?.cleanup};slots[n]=next;effects.push(()=>{next.cleanup?.();next.cleanup=fn();});}}},access,report:{...GATEWAY_REPORTS[0],available:true},result:{...clientPage([{id:'txn-one',currency:'USD',amount_value:'1234',amount_unit:'provider_minor_units'}]),complete:true},downloads:[]};
 try{
 await build({entryPoints:['src/pages/ReportsPage.tsx'],outfile:out,tsconfig:'tsconfig.app.json',bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react/*','lucide-react'],plugins:[{name:'gateway-ui',setup(b){
 b.onResolve({filter:/^react$/},()=>({path:'hooks',namespace:'mock'}));b.onResolve({filter:/^@\/components\/AdminLayout$/},()=>({path:'layout',namespace:'mock'}));b.onResolve({filter:/^@\/lib\/(adminAccess|adminReports|csvExport)$/},a=>({path:a.path.split('/').at(-1),namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({resolveDir:process.cwd(),contents:({hooks:'export const {useState,useEffect,useRef}=globalThis.__gatewayUI.hooks;',layout:'export default function Layout(){return null;}',adminAccess:`export {canAdminAccess as canAccess} from ${JSON.stringify(join(process.cwd(),'shared/admin-permissions.js'))};export const sections=[['transactions','Transactions','/transactions']];export const useAdminAccess=()=>globalThis.__gatewayUI.access;`,adminReports:'export const loadReportCatalog=async()=>[globalThis.__gatewayUI.report];export const loadCompleteReport=async()=>globalThis.__gatewayUI.result;',csvExport:'export const exportCompleteCsv=async arg=>{globalThis.__gatewayUI.downloads.push(arg);return arg.report.rows.length;};'})[a.path]}));
 }}]});const component=(await import(pathToFileURL(out))).default;
 const text=n=>n==null||typeof n==='boolean'?'':typeof n!=='object'?String(n):Array.isArray(n)?n.map(text).join(''):text(n.props?.children);
 const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
 async function settle(){for(let n=0;n<12;n++){if(dirty){i=0;dirty=false;tree=component();while(effects.length)effects.shift()();}await new Promise(r=>setImmediate(r));}}
 await settle();const button=nodes(tree).find(n=>n.type==='button'&&text(n)==='Export complete CSV');assert.ok(button);button.props.onClick();await settle();
 assert.match(text(tree),/All Monime pages loaded successfully/);assert.match(text(tree),/Export started:/);assert.doesNotMatch(text(tree),/Creation cutoff:/);assert.match(text(tree),/USD/);assert.equal(globalThis.__gatewayUI.downloads[0].report.rows[0].amount_value,'1234');
 }finally{for(const s of slots)s?.cleanup?.();delete globalThis.__gatewayUI;await rm(dir,{recursive:true,force:true});}
});
