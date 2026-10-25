
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSmallTestDatabase} from './low-memory-db.js';
import {createReportHandler,signCursor,readCursor} from '../server/admin-reports.js';
import {createHandler} from '../api/admin-staff.js';
const actor='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const env={SUPABASE_SERVICE_ROLE_KEY:'test-only-report-signing-key'};
const now=Date.parse('2026-10-24T10:00:00Z');
const res=()=>({setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
async function fixture(){
 const pg=await createSmallTestDatabase();
 try{
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table matmove_staff_access(id uuid primary key,is_active boolean,is_owner boolean,removed_at timestamptz,permissions jsonb);
 insert into matmove_staff_access values('${actor}',true,false,null,'["customers"]'),('${other}',true,false,null,'["games.entries"]');
 create table profiles(id uuid primary key,email text,role text,full_name text,pin text,private_document_url text,created_at timestamptz);
 insert into profiles select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'test'||n||'@example.com','rider','Customer','1234','SECRET','2026-10-01' from generate_series(1,503) n;
 insert into profiles values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin@example.com','admin','Owner','1234','SECRET','2026-10-01');
 create table matmove_spin_legs(id uuid primary key,kind text,amount_minor bigint,status text,created_at timestamptz);
 insert into matmove_spin_legs values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','entry',500,'completed','2026-10-01'),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','win',100,'pending','2026-10-01');`);
 const sql=await readFile(new URL('../docs/ADMIN_REPORTS_SETUP.sql',import.meta.url),'utf8');await pg.exec(sql);await pg.exec(sql);
 const rpc=async(name,args)=>{try{const r=await pg.query(`select public.${name}(${Object.keys(args).map((_,i)=>'$'+(i+1)).join(',')}) as value`,Object.values(args));return {data:r.rows[0].value};}catch(error){return {error};}};
 return {pg,rpc};
 }catch(error){await pg.close();throw error;}
}
test('SQL reruns; full history spans three pages without gaps or private fields',async()=>{
 const {pg,rpc}=await fixture();try{
 let after=null;const ids=[];let pages=0;
 do{const r=await rpc('matmove_admin_report_page',{actor,report:'customers',after,cutoff:'2026-10-24T10:00:00Z',limit:250});assert.ifError(r.error);const page=r.data;pages++;assert.ok(page.rows.length<=250);assert.ok(!JSON.stringify(page).includes('SECRET'));assert.ok(!page.columns.includes('pin'));ids.push(...page.rows.map(r=>r.id));after=page.nextAfter;assert.equal(page.complete,after===null);}while(after);
 assert.equal(pages,3);assert.equal(ids.length,503);assert.equal(new Set(ids).size,503);
 }finally{await pg.close();}
});
test('SQL rechecks assignments and browser roles cannot execute reporting RPCs',async()=>{
 const {pg,rpc}=await fixture();try{
 const catalog=await rpc('matmove_admin_report_catalog',{actor});assert.deepEqual(catalog.data.map(r=>r.id),['customers']);
 await pg.exec(`update matmove_staff_access set is_active=false where id='${actor}'`);
 assert.match((await rpc('matmove_admin_report_page',{actor,report:'customers',after:null,cutoff:null,limit:250})).error.message,/FORBIDDEN/);
 await pg.exec('set role authenticated');await assert.rejects(pg.query('select matmove_admin_report_catalog($1)',[other]),/permission denied/);
 }finally{await pg.close();}
});
test('entry-only grants exclude winnings; optional fields are blank; missing sources fail',async()=>{
 const {pg,rpc}=await fixture();try{
 const c=await rpc('matmove_admin_report_catalog',{actor:other});assert.equal(c.data.length,2);assert.equal(c.data.find(r=>r.id==='arcade_entries').available,false);
 const p=await rpc('matmove_admin_report_page',{actor:other,report:'spin_entries',after:null,cutoff:null,limit:250});assert.ifError(p.error);assert.equal(p.data.rows.length,1);assert.equal(p.data.rows[0].amount_minor,'500');assert.equal(p.data.rows[0].provider_id,null);
 assert.match((await rpc('matmove_admin_report_page',{actor:other,report:'spin_winnings',after:null,cutoff:null,limit:250})).error.message,/FORBIDDEN/);
 assert.match((await rpc('matmove_admin_report_page',{actor:other,report:'arcade_entries',after:null,cutoff:null,limit:250})).error.message,/UNAVAILABLE/);
 }finally{await pg.close();}
});
test('cutoff excludes later creations and arbitrary source names cannot run SQL',async()=>{
 const {pg,rpc}=await fixture();try{
 await pg.exec(`insert into profiles values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','later@example.com','rider','Later','SECRET','SECRET','2026-10-25')`);
 const p=await rpc('matmove_admin_report_page',{actor,report:'customers',after:null,cutoff:'2026-10-24T10:00:00Z',limit:250});assert.ifError(p.error);assert.ok(!JSON.stringify(p.data).includes('later@example.com'));
 assert.match((await rpc('matmove_admin_report_page',{actor,report:'profiles;drop table profiles',after:null,cutoff:null,limit:250})).error.message,/INVALID/);
 }finally{await pg.close();}
});
const definition={id:'customers',title:'Customers',permission:'customers',available:true,columns:['id','email'],note:'Read-time status'};
function api({page,access={id:actor,is_active:true,permissions:['customers']},catalog=[definition]}={}){
 const calls=[];const authorize=async()=>({user:{id:actor},access,client:{rpc:async(name,args)=>{calls.push({name,args});return {data:name.endsWith('catalog')?catalog:page};}}});
 return {handler:createReportHandler({authorize,env,now:()=>now}),authorize,calls};
}
const request=(query={})=>({method:'GET',url:'/api/admin-staff',query:{view:'report-page',report:'customers',...query}});
test('signed cursors bind account, report and expiry and reject tampering',()=>{
 const payload={actor,report:'customers',after:'key',cutoff:new Date(now).toISOString(),expires:now+10000};const token=signCursor(payload,env);
 assert.equal(readCursor(token,{actor,report:'customers',env,now}).after,'key');
 for(const options of [{actor:other},{report:'wallets'},{now:now+10001}])assert.throws(()=>readCursor(token,{actor,report:'customers',env,now,...options}),/expired or changed/);
 assert.throws(()=>readCursor(token.slice(0,-3)+'xxx',{actor,report:'customers',env,now}),/expired or changed/);
});
test('API signs continuation and rechecks permission before subsequent pages',async()=>{
 const page={report:'customers',columns:definition.columns,rows:[{id:'1',email:'a@example.com'}],cutoff:new Date(now).toISOString(),nextAfter:'1',complete:false};
 const a=api({page});const r=res();await a.handler(request(),r);assert.equal(r.code,200);assert.ok(r.body.cursor);assert.equal(a.calls[1].args.p_actor,actor);
 const b=api({page,access:{id:actor,is_active:true,permissions:['payouts']}});const denied=res();await b.handler(request({cursor:r.body.cursor}),denied);assert.equal(denied.code,403);assert.equal(b.calls.length,1);
});
test('API rejects POST, duplicate queries, unknown fields, changed identity and malformed pages',async()=>{
 const a=api({page:{}});
 for(const req of [{...request(),method:'POST'},{...request(),url:'/api/admin-staff?view=report-page&view=report-page'},request({table:'profiles'}),request({actor:other}),request()]){
 const r=res();await a.handler(req,r);assert.ok([400,405,409,503].includes(r.code));assert.ok(r.body.error);
 }
});
test('existing API dispatches reports without running staff mutations',async()=>{
 const a=api();const handler=createHandler({authorize:a.authorize,env});const r=res();await handler({method:'GET',url:'/api/admin-staff?view=report-catalog'},r);
 assert.equal(r.code,200);assert.deepEqual(r.body.reports,[definition]);assert.equal(a.calls[0].name,'matmove_admin_report_catalog');
});

async function browserClient(pages,{changeIdentity=false}={}){
 const {transform}=await import('esbuild');
 let source=await readFile(new URL('../src/lib/adminReports.ts',import.meta.url),'utf8');
 source=source.replace("import {adminFetch} from './adminFetch';",'const adminFetch=globalThis.__reportHarness.fetch;').replace("import {supabase} from './supabase';",'const supabase=globalThis.__reportHarness.supabase;');
 let requests=0,sessions=0;
 globalThis.__reportHarness={fetch:async()=>{const page=pages[requests++];return {ok:!page.error,json:async()=>page};},supabase:{auth:{getSession:async()=>({data:{session:{user:{id:changeIdentity&&++sessions>2?other:actor}}}})}}};
 const result=await transform(source,{loader:'ts',format:'esm',target:'es2022'});
 const module=await import('data:text/javascript;base64,'+Buffer.from(result.code+'\n//'+Math.random()).toString('base64'));
 return {module,requests:()=>requests};
}
const browserPage=(complete,extra={})=>({actor,report:'customers',columns:definition.columns,rows:[{id:complete?'2':'1',email:'test@example.com'}],cutoff:new Date(now).toISOString(),complete,cursor:complete?null:'next-page',...extra});
test('browser collector returns only confirmed full history and reports progress across pages',async()=>{
 const h=await browserClient([browserPage(false),browserPage(true)]);const progress=[];
 const result=await h.module.loadCompleteReport({userId:actor,report:definition,onProgress:n=>progress.push(n)});
 assert.equal(result.complete,true);assert.equal(result.rows.length,2);assert.deepEqual(progress,[1,2]);assert.equal(h.requests(),2);
});
test('failed or repeated continuation never returns partial rows as a completed export',async()=>{
 for(const pages of [[browserPage(false),{error:'Access denied.'}],[browserPage(false),browserPage(false)]]){
 const h=await browserClient(pages);await assert.rejects(h.module.loadCompleteReport({userId:actor,report:definition}),/Access denied|continuation/);
 }
});
test('cancelling or switching identity stops full-history collection before further requests',async()=>{
 const controller=new AbortController();const h=await browserClient([browserPage(false)]);
 await assert.rejects(h.module.loadCompleteReport({userId:actor,report:definition,signal:controller.signal,onProgress:()=>controller.abort()}),/cancelled/);assert.equal(h.requests(),1);
 const switched=await browserClient([browserPage(false)],{changeIdentity:true});
 await assert.rejects(switched.module.loadCompleteReport({userId:actor,report:definition}),/account changed/);assert.equal(switched.requests(),1);
});
