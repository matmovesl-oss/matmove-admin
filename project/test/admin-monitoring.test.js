
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createSmallTestDatabase} from './low-memory-db.js';
import {createReportHandler} from '../server/admin-reports.js';
import {createHandler} from '../api/admin-staff.js';
const user='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const owner={id:user,is_owner:true,is_active:true,permissions:[]};
async function fixture(){
 const pg=await createSmallTestDatabase();
 try{
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table matmove_staff_access(id uuid primary key,is_owner boolean,is_active boolean,removed_at timestamptz,permissions jsonb);
 insert into matmove_staff_access values('${user}',true,true,null,'[]'),('${other}',false,true,null,'["games.entries"]');
 create table profiles(id uuid primary key,role text,email text,kyc_status text,pin text,created_at timestamptz);
 insert into profiles select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n<501 then 'rider' when n=501 then 'driver' when n=502 then 'merchant' else 'admin' end,'test@example.com','pending','SECRET_PIN','2026-10-01' from generate_series(1,503) n;
 create table bookings(id uuid primary key,service_type text,fare_amount numeric,status text,created_at timestamptz,pickup_location text,destination_location text);
 insert into bookings select gen_random_uuid(),'ride',5,'completed','2026-10-01','Freetown','Lumley' from generate_series(1,12);
 create table matmove_withdrawals(id uuid primary key,state text,amount_minor bigint);
 insert into matmove_withdrawals values(gen_random_uuid(),'payout_pending',10000);
 create table ride_payments(booking_id uuid primary key,state text,fare_minor bigint);
 insert into ride_payments values(gen_random_uuid(),'released',10000);
 create table wallets(id uuid primary key,currency text,balance numeric);
 insert into wallets values(gen_random_uuid(),'SLE',9999999),(gen_random_uuid(),'USD',8888888);
 create table matmove_spin_legs(id uuid primary key,kind text,amount_minor text,provider_id text,status text,created_at timestamptz);
 insert into matmove_spin_legs values
  (gen_random_uuid(),'entry','500','trn-received','completed',now()),
  (gen_random_uuid(),'entry','1000','trn-pending','pending',now()),
  (gen_random_uuid(),'entry','400','trn-failed','failed',now()),
  (gen_random_uuid(),'entry','900',null,'completed',now()),
  (gen_random_uuid(),'entry','bad','trn-invalid','completed',now()),
  (gen_random_uuid(),'win','9007199254740993','trn-prize','completed',now());`);
 for(const path of ['ADMIN_REPORTS_SETUP.sql','ADMIN_MONITORING_SETUP.sql']){let sql=await readFile(new URL('../docs/'+path,import.meta.url),'utf8');if(path==='ADMIN_REPORTS_SETUP.sql')sql=sql.split('\n').filter(line=>!line.startsWith("('ride_payments'")&&!line.startsWith("('payouts'")).join('\n').replace("'payments','ride_payments','payouts','merchant_payments'","'payments','merchant_payments'");await pg.exec(sql);}
 const overview=async(id=user)=>{const r=await pg.query('select matmove_admin_report_overview($1) as data',[id]);return r.rows[0].data;};return {pg,overview};
 }catch(error){await pg.close();throw error;}
}
test('monitoring counts all rows and excludes pending, failed and unverified transfers from exact totals',async()=>{
 const {pg,overview}=await fixture();try{
 const data=await overview(),get=id=>data.modules.find(m=>m.id===id);
 assert.equal(data.actor,user);assert.equal(get('customers').count,'502');assert.deepEqual(get('customers').groups,[{value:'driver',count:'1'},{value:'merchant',count:'1'},{value:'rider',count:'500'}]);
 assert.equal(get('payouts').count,'1');assert.deepEqual(get('payouts').groups,[{value:'payout_pending',count:'1'}]);assert.equal(get('ride_payments').count,'1');assert.equal(get('ride_payments').completedMoney,null);
 assert.equal(get('dispatch').count,'12');assert.equal(data.recentBookings.length,5);
 assert.deepEqual(get('spin_entries').completedMoney,{currency:'SLE',minor:'500'});assert.equal(get('spin_entries').unverifiedCompleted,'2');
 assert.equal(get('spin_winnings').completedMoney.minor,'9007199254740993');assert.equal(get('wallets').completedMoney,null);
 assert.ok(!JSON.stringify(data).includes('SECRET_PIN'));assert.ok(!JSON.stringify(data).includes('9999999'));
 const remaining=await pg.query('select count(*)::text n from profiles');assert.equal(remaining.rows[0].n,'503');
 }finally{await pg.close();}
});
test('granular grants expose only assigned modules; dashboard-only access grants no finance or customer counts',async()=>{
 const {pg,overview}=await fixture();try{
 let data=await overview(other);assert.deepEqual(data.modules.map(m=>m.id).sort(),['arcade_entries','spin_entries']);assert.deepEqual(data.recentBookings,[]);
 await pg.exec(`update matmove_staff_access set permissions='["dashboard"]' where id='${other}'`);data=await overview(other);assert.deepEqual(data.modules,[]);
 await pg.exec(`update matmove_staff_access set is_active=false where id='${other}'`);await assert.rejects(overview(other),/FORBIDDEN/);
 await pg.exec('set role authenticated');await assert.rejects(overview(user),/permission denied/);
 }finally{await pg.close();}
});
test('missing and failing sources remain unavailable instead of becoming successful zero counts; migration reruns preserve data',async()=>{
 const {pg,overview}=await fixture();try{
 await pg.exec(await readFile(new URL('../docs/ADMIN_MONITORING_SETUP.sql',import.meta.url),'utf8'));
 await pg.exec(`create function broken_audit() returns uuid language plpgsql volatile as $$begin raise exception 'fixture failure';end;$$;create view audit_logs as select broken_audit() id;`);
 const data=await overview();const logs=data.modules.find(m=>m.id==='logs'),missing=data.modules.find(m=>m.id==='kyc');
 assert.equal(logs.status,'error');assert.equal(logs.count,null);assert.equal(missing.status,'unavailable');assert.equal(missing.count,null);assert.equal(data.modules.find(m=>m.id==='dispatch').count,'12');
 }finally{await pg.close();}
});
const definition={id:'customers',title:'Customers',permission:'customers',columns:['id'],available:true};
const moduleRow={id:'customers',title:'Customers',permission:'customers',status:'ok',count:'502',groups:[{value:'rider',count:'500'}],completedMoney:null,unverifiedCompleted:null,message:null};
const overviewBody=(extra={})=>({actor:user,generatedAt:'2026-10-24T12:00:00Z',modules:[moduleRow],recentBookings:[],...extra});
const response=()=>({setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
function api(body=overviewBody(),access=owner){const calls=[];const authorize=async()=>({user:{id:user},access,client:{rpc:async(name,args)=>{calls.push({name,args});return {data:name.endsWith('catalog')?[definition]:body};}}});return {authorize,calls,handler:createReportHandler({authorize})};}
const request={method:'GET',url:'/api/admin-staff?view=report-overview'};
test('overview API uses the verified actor and the existing staff API route without invoking a mutation',async()=>{
 const h=api();const r=response();await createHandler({authorize:h.authorize})(request,r);assert.equal(r.code,200);assert.equal(h.calls[1].name,'matmove_admin_report_overview');assert.equal(h.calls[1].args.p_actor,user);
 const wrong=response();await h.handler({...request,url:request.url+'&actor='+other},wrong);assert.equal(wrong.code,409);
});
test('API rejects unassigned, incomplete and malformed monitoring instead of publishing plausible totals',async()=>{
 for(const body of [overviewBody({modules:[]}),overviewBody({modules:[{...moduleRow,permission:'financials'}]}),overviewBody({modules:[{...moduleRow,count:502}]}),overviewBody({modules:[{...moduleRow,status:'error',count:'0'}]})]){
 const h=api(body),r=response();await h.handler(request,r);assert.equal(r.code,503);
 }
 const h=api(),r=response();await h.handler({...request,method:'POST'},r);assert.equal(r.code,405);
});
function nodes(n){if(!n||typeof n!=='object')return[];if(Array.isArray(n))return n.flatMap(nodes);return[n,...nodes(n.props?.children)];}
function text(n){if(n==null||typeof n==='boolean')return'';if(typeof n!=='object')return String(n);if(Array.isArray(n))return n.map(text).join('');return text(n.props?.children);}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function page(fn,{access=owner,fetcher}={}){
 const dir=await mkdtemp(join(process.cwd(),'.monitor-ui-')),out=join(dir,'ui.mjs');const slots=[],effects=[],calls=[],timers=[];
 let i=0,dirty=true,tree,unmounted=false;const oldWindow=globalThis.window;
 const changed=(a,b)=>!a||a.length!==b?.length||a.some((v,j)=>!Object.is(v,b[j]));
 globalThis.__monitor={access,fetch:async(url,options)=>{calls.push({url,options});const result=await (fetcher?fetcher(url,options):{ok:true,body:url.includes('view=report-overview')?overviewBody():{accounts:[],platform:{}}});return {ok:result.ok,json:async()=>result.body};},db:{auth:{getSession:async()=>({data:{session:{user:{id:user}}}})}},hooks:{useState(initial){const n=i++;if(!(n in slots))slots[n]={value:typeof initial==='function'?initial():initial};return[slots[n].value,v=>{slots[n].value=typeof v==='function'?v(slots[n].value):v;dirty=true;}];},useRef(initial){const n=i++;if(!(n in slots))slots[n]={current:initial};return slots[n];},useEffect(fn,deps){const n=i++,old=slots[n];if(!old||changed(old.deps,deps)){const next={deps,cleanup:old?.cleanup};slots[n]=next;effects.push(()=>{next.cleanup?.();next.cleanup=fn();});}}}};
 globalThis.window={setInterval:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearInterval:id=>{if(timers[id-1])timers[id-1].cleared=true;}};
 try{
 await build({entryPoints:['src/pages/DashboardPage.tsx'],tsconfig:'tsconfig.app.json',outfile:out,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react/*','lucide-react'],plugins:[{name:'monitor-mocks',setup(b){
  b.onResolve({filter:/^react$/},()=>({path:'hooks',namespace:'mock'}));b.onResolve({filter:/^react-router-dom$/},()=>({path:'router',namespace:'mock'}));
  b.onResolve({filter:/^@\/lib\/(adminAccess|adminFetch|supabase)$/},a=>({path:a.path.split('/').at(-1),namespace:'mock'}));b.onResolve({filter:/^@\/components\/AdminLayout$/},()=>({path:'layout',namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},a=>({resolveDir:process.cwd(),contents:({hooks:'export const {useState,useEffect,useRef}=globalThis.__monitor.hooks;',router:'export const Link="a";',layout:'export default function Layout(){return null;}',adminAccess:`export {canAdminAccess as canAccess} from ${JSON.stringify(join(process.cwd(),'shared/admin-permissions.js'))};import {SECTION_GROUPS} from ${JSON.stringify(join(process.cwd(),'shared/admin-permissions.js'))};export const sections=SECTION_GROUPS.flatMap(g=>g.items);export const useAdminAccess=()=>globalThis.__monitor.access;`,adminFetch:'export const adminFetch=(...a)=>globalThis.__monitor.fetch(...a);',supabase:'export const supabase=globalThis.__monitor.db;'})[a.path]}));
 }}]});
 const component=(await import(pathToFileURL(out))).default;
 function render(){i=0;dirty=false;tree=component();while(effects.length)effects.shift()();}
 async function settle(){for(let n=0;n<12;n++){if(dirty&&!unmounted)render();await new Promise(r=>setImmediate(r));if(n>5&&!dirty)break;}if(dirty&&!unmounted)render();}
 const h={calls,timers,settle,get text(){return text(tree);},async click(label){const b=nodes(tree).find(n=>n.type==='button'&&text(n).trim()===label);assert.ok(b,`Missing ${label}: ${text(tree)}`);b.props.onClick();await settle();},async access(value){globalThis.__monitor.access=value;dirty=true;await settle();},unmount(){unmounted=true;for(const s of slots)s?.cleanup?.();}};
 await settle();await fn(h);h.unmount();
 }finally{if(!unmounted)for(const s of slots)s?.cleanup?.();if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;delete globalThis.__monitor;await rm(dir,{recursive:true,force:true});}
}
test('dashboard-only users cannot read financial endpoints and see no fabricated unassigned counts',()=>page(async h=>{
 assert.equal(h.calls.length,1);assert.ok(h.calls[0].url.includes('view=report-overview'));assert.match(h.text,/No operational modules are assigned/);assert.doesNotMatch(h.text,/Live platform accounts/);
},{access:{...owner,is_owner:false,permissions:['dashboard']},fetcher:async()=>({ok:true,body:overviewBody({modules:[]})})}));
test('loading and failed monitoring do not render empty bookings or successful zero statistics',async()=>{
 const wait=deferred();let failing=true;await page(async h=>{
 assert.match(h.text,/Loading system monitoring/);assert.doesNotMatch(h.text,/No bookings have/);
 wait.resolve({ok:false,body:{error:'Monitoring offline'}});await h.settle();assert.match(h.text,/Monitoring offline/);assert.doesNotMatch(h.text,/Database records/);
 failing=false;await h.click('Retry dashboard');assert.match(h.text,/502/);assert.match(h.text,/Database last synced/);
 },{fetcher:()=>failing?wait.promise:Promise.resolve({ok:true,body:overviewBody()})});
});
test('partial module failures stay visible and shared treasury IDs are shown once without currency mixing',()=>page(async h=>{
 assert.match(h.text,/Source unavailable/);assert.match(h.text,/No successful count/);assert.match(h.text,/SLE 12.34/);assert.match(h.text,/USD 5.00/);
 assert.equal(h.text.match(/SLE 12\.34/g)?.length,1);assert.match(h.text,/Escrow & Platform fees/);assert.match(h.text,/not a profit figure/);
},{fetcher:async url=>({ok:true,body:url.includes('view=report-overview')?overviewBody({modules:[moduleRow,{id:'kyc',title:'KYC submissions',permission:'kyc',status:'unavailable',count:null,groups:[],completedMoney:null,unverifiedCompleted:null,message:'Source unavailable'}]}):{platform:{escrowAccountId:'fac-main',feeAccountId:'fac-main',spinAccountId:'fac-spin'},accounts:[{id:'fac-main',currency:'SLE',balance:{available:{currency:'SLE',value:1234}}},{id:'fac-spin',currency:'USD',balance:{available:{currency:'USD',value:500}}}]}})}));
test('automatic refresh does not overlap pending requests and unmount aborts all retained reads',async()=>{
 const wait=deferred();await page(async h=>{
 assert.equal(h.timers[0].ms,60000);assert.equal(h.calls.length,2);h.timers[0].fn();await h.settle();assert.equal(h.calls.length,2);
 h.unmount();assert.ok(h.calls.every(c=>c.options.signal.aborted));assert.equal(h.timers[0].cleared,true);
 wait.resolve({ok:true,body:overviewBody()});await h.settle();assert.doesNotMatch(h.text,/502/);
 },{fetcher:()=>wait.promise});
});
test('permission revocation hides old results and prevents delayed responses from restoring them',async()=>{
 const wait=deferred();await page(async h=>{
 await h.access({...owner,is_owner:false,permissions:[]});assert.match(h.text,/Access denied/);wait.resolve({ok:true,body:overviewBody()});await h.settle();assert.doesNotMatch(h.text,/502/);assert.equal(h.calls.length,2);
 },{fetcher:()=>wait.promise});
});
