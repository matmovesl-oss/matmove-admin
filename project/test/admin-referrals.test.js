
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createSmallTestDatabase} from './low-memory-db.js';
import {createReferralAdminHandler} from '../server/admin-referrals.js';
import {createHandler} from '../api/admin-staff.js';
const owner='11111111-1111-4111-8111-111111111111',staff='22222222-2222-4222-8222-222222222222',customer='33333333-3333-4333-8333-333333333333',inviter='44444444-4444-4444-8444-444444444444',key='55555555-5555-4555-8555-555555555555';
const uid=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`;
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(b){this.body=b;return this;}});
const env={SUPABASE_SERVICE_ROLE_KEY:'cursor-signing-test-key',MONIME_REFERRAL_ACCOUNT_ID:'fac-referral',MONIME_SPIN_ACCOUNT_ID:'fac-spin',MONIME_API_KEY:'mon_test_fixture',MONIME_SPACE_ID:'space-fixture',MONIME_ENVIRONMENT:'test'};
const body=()=>({requestId:key,expectedRevision:'0',accepting:false,payments:false,budgetMinor:'2000',reason:'Test budget reviewed',confirmed:true});
const overview=()=>({actor:owner,campaign:{revision:'0',accepting:false,payments:false,budgetMinor:'0',source:null},totals:{referrals:'1',pendingMinor:'200',creditedMinor:'0',reviewMinor:'0',budgetUsedMinor:'0',reservedMinor:'0'}});
const row=(i=1)=>({id:uid(i),new_user_email:'new@example.com',inviter_email:'inviter@example.com',beneficiary_email:'new@example.com',code:'MM000000000001',kind:'new_user',amount_minor:'100',currency:'SLE',state:'pending',provider_id:null,created_at:'2026-10-27T10:00:00Z',updated_at:'2026-10-27T10:00:00Z'});
test('Referral Admin SQL enforces owner changes, exact receipts, permissions and bounded history',async t=>{
 const pg=await createSmallTestDatabase();try{
  await pg.exec(`create schema auth;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${staff}'),('${customer}'),('${inviter}');create table matmove_staff_access(id uuid primary key,is_owner boolean,is_active boolean,removed_at timestamptz,permissions jsonb);insert into matmove_staff_access values('${owner}',true,true,null,'[]'),('${staff}',false,true,null,'["financials"]');create function matmove_report_allowed(uuid,text) returns boolean language sql stable as $$select exists(select 1 from matmove_staff_access where id=$1 and is_active and removed_at is null and (is_owner or permissions ? $2))$$;create function matmove_referral_claim(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
   create table profiles(id uuid primary key,email text);insert into profiles values('${customer}','new@example.com'),('${inviter}','inviter@example.com');create table wallets(monime_account_id text,metadata jsonb);create table matmove_referral_campaign(singleton boolean primary key,version bigint default 1,accepting_referrals boolean,payments_enabled boolean,reward_minor bigint default 100,currency text default 'SLE',registration_opens_at timestamptz default now(),updated_at timestamptz default now(),treasury_account text,budget_minor bigint);insert into matmove_referral_campaign(singleton,accepting_referrals,payments_enabled,budget_minor) values(true,false,false,0);
   create table matmove_referrals(new_user_id uuid primary key,referrer_id uuid,code text);insert into matmove_referrals values('${customer}','${inviter}','MM000000000001');create table matmove_referral_rewards(id uuid primary key,new_user_id uuid,beneficiary_id uuid,kind text,amount_minor bigint,currency text,state text,provider_id text,created_at timestamptz default now(),updated_at timestamptz default now(),reserved_at timestamptz);
   grant usage on schema public to authenticated,anon,service_role;`);
  const sql=await readFile('docs/REFERRAL_ADMIN_SETUP.sql','utf8');await pg.exec(sql);await pg.exec(sql);
  const call=async(name,args)=>(await pg.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) v`,args)).rows[0].v;
  const save=(patch={})=>{const p={actor:owner,request:key,expected:0,accepting:false,payments:false,budget:2000,source:null,ready:false,reason:'Reviewed test settings',...patch};return call('matmove_referral_admin_save',Object.values(p));};
  await t.test('installation leaves the campaign paused and service-only reports deny unassigned callers',async()=>{
   const v=await call('matmove_referral_admin_overview',[owner]);assert.equal(v.campaign.payments,false);assert.equal(v.campaign.accepting,false);assert.equal(v.totals.creditedMinor,'0');await assert.rejects(()=>call('matmove_referral_admin_overview',[customer]),/FORBIDDEN/);await pg.exec('set role authenticated');await assert.rejects(()=>call('matmove_referral_admin_overview',[owner]),/permission denied/);await assert.rejects(()=>save(),/permission denied/);await pg.exec('reset role');
  });
  await t.test('financial staff can read but only the active owner can save settings',async()=>{
   assert.equal((await call('matmove_referral_admin_overview',[staff])).actor,staff);await assert.rejects(()=>save({actor:staff}),/Only the active owner/);assert.equal((await save()).revision,'1');assert.equal((await pg.query('select count(*)::text n from matmove_referral_admin_events')).rows[0].n,'1');
  });
  await t.test('matching retries return the original receipt; changed payloads and stale new requests fail atomically',async()=>{
   assert.equal((await save()).revision,'1');await assert.rejects(()=>save({budget:3000}),/changed/);await assert.rejects(()=>save({request:uid(90)}),/settings changed/);assert.equal((await pg.query('select config_revision::text n from matmove_referral_campaign')).rows[0].n,'1');
  });
  await t.test('activation requires server readiness, a separate account and enough budget',async()=>{
   const base={request:uid(91),expected:1,accepting:true,payments:true,source:'fac-referral'};await assert.rejects(()=>save(base),/activation/);await assert.rejects(()=>save({...base,ready:true,budget:100}),/Budget/);await pg.exec("insert into wallets values('fac-referral','{}')");await assert.rejects(()=>save({...base,ready:true}),/separate business/);await pg.exec('delete from wallets');assert.equal((await save({...base,ready:true})).revision,'2');
  });
  await t.test('owner can pause without a live provider call; reruns never reactivate the campaign',async()=>{
   await save({request:uid(92),expected:2,budget:2000});await pg.exec(sql);const r=await call('matmove_referral_admin_overview',[owner]);assert.equal(r.campaign.payments,false);assert.equal(r.campaign.accepting,false);assert.equal(r.campaign.revision,'3');
  });
  await t.test('full history spans pages with safe fields; filters and cutoff exclude other rows',async()=>{
   for(let i=1;i<=103;i++)await pg.query("insert into matmove_referral_rewards(id,new_user_id,beneficiary_id,kind,amount_minor,currency,state) values($1,$2,$2,'new_user',100,'SLE',$3)",[uid(i),customer,i===103?'failed':'pending']);
   const cutoff=new Date(Date.now()+1000).toISOString();let after=null,all=[];do{const p=await call('matmove_referral_admin_page',[staff,'all',after,cutoff]);all.push(...p.rows);after=p.nextAfter;}while(after);assert.equal(all.length,103);assert.equal(new Set(all.map(r=>r.id)).size,103);assert.ok(all.every(r=>r.new_user_email==='new@example.com'&&!('metadata'in r)));
   const p=await call('matmove_referral_admin_page',[staff,'failed',null,cutoff]);assert.equal(p.rows.length,1);await assert.rejects(()=>call('matmove_referral_admin_page',[staff,'bad',null,cutoff]),/INVALID/);
   await pg.query("insert into matmove_referral_rewards(id,new_user_id,beneficiary_id,kind,amount_minor,currency,state,created_at) values($1,$2,$2,'new_user',100,'SLE','pending',now()+interval '1 day')",[uid(104),customer]);const next=await call('matmove_referral_admin_page',[staff,'all',uid(100),cutoff]);assert.equal(next.rows.length,3);
  });
  await t.test('removed owners cannot replay a formerly successful request or inspect reports',async()=>{
   await pg.query('update matmove_staff_access set removed_at=now() where id=$1',[owner]);await assert.rejects(()=>save(),/Only the active owner/);await assert.rejects(()=>call('matmove_referral_admin_overview',[owner]),/FORBIDDEN/);
  });
 }finally{await pg.close();}
});
const schedulerHealth=()=>({enabled:true,jobActive:true,schedule:'* * * * *',secretPresent:true,schemaReady:true,probeVerified:true,probeSource:'fac-referral',probeQueuedAt:new Date().toISOString(),probeStatus:200,probeTimedOut:false});
function api({access={id:owner,is_owner:true},data,providerError=false,ready=false,scheduler=schedulerHealth(),live=false}={}){
 const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});if(name==='matmove_referral_scheduler_status')return{data:scheduler,error:null};if(name==='matmove_referral_admin_save'&&(args.p_accepting||args.p_payments)&&!args.p_ready)return{data:null,error:{message:'INVALID: Campaign activation is not enabled on the server yet.'}};return {data:data?data(name,args):name==='matmove_referral_admin_overview'?overview():name==='matmove_referral_admin_save'?{actor:owner,requestId:args.p_request,saved:true,revision:(BigInt(args.p_expected)+1n).toString()}:{actor:owner,rows:[row()],nextAfter:null},error:null};}};
 const handler=createReferralAdminHandler({env:{...env,MONIME_ENVIRONMENT:live?'live':env.MONIME_ENVIRONMENT,MONIME_API_KEY:live?'mon_fixture':env.MONIME_API_KEY,MATMOVE_REFERRALS_ENABLED:String(ready)},authorize:async(req,keys)=>{calls.push({keys});if(access===null)throw Object.assign(Error('Access denied'),{status:403});return {client,user:{id:owner},access};},fetcher:async(url,options)=>{calls.push({url,options});if(providerError)throw Error('private');return {ok:true,json:async()=>({result:{id:'fac-referral',currency:'SLE',balance:{available:{currency:'SLE',value:3960}}}})};}});
 return {calls,client,handler,request:async(view,patch={})=>{const r=response();await handler({method:view==='referral-settings'?'POST':'GET',url:'/api/admin-staff',headers:{},query:{view,actor:owner},body:body(),...patch},r);return r;}};
}
test('overview returns verified live SLE balance and a balance failure stays unavailable rather than zero',async()=>{
 const a=api(),r=await a.request('referral-overview');assert.equal(r.code,200);assert.equal(r.body.treasury.availableMinor,'3960');assert.equal(r.body.activationReady,false);assert.deepEqual(a.calls[0].keys,['financials']);
 const b=api({providerError:true}),failed=await b.request('referral-overview');assert.equal(failed.code,200);assert.equal(failed.body.treasury,null);assert.match(failed.body.treasuryError,/unavailable/);
});
test('owner settings use the verified actor and server readiness; nonowners and forged bodies never save',async()=>{
 const a=api(),r=await a.request('referral-settings');assert.equal(r.code,200);assert.equal(a.calls.find(c=>c.name==='matmove_referral_admin_save').args.p_actor,owner);assert.equal(a.calls.some(c=>c.url),false);
 for(const patch of [{body:{...body(),actor:staff}},{body:{...body(),confirmed:false}},{query:{view:'referral-settings',actor:staff}}]){const f=api();assert.ok((await f.request('referral-settings',patch)).code>=400);assert.equal(f.calls.some(c=>c.name==='matmove_referral_admin_save'),false);}
 const b=api({access:{id:owner,is_owner:false}});assert.equal((await b.request('referral-settings')).code,403);assert.equal(b.calls.some(c=>c.name==='matmove_referral_admin_save'),false);
});
test('report continuations bind actor and filter, and recheck access for every page',async()=>{
 const a=api({data:()=>({actor:owner,rows:Array.from({length:50},(_,i)=>row(i+1)),nextAfter:uid(50)})}),first=await a.request('referral-page');assert.equal(first.code,200);assert.ok(first.body.nextCursor);const cursor=first.body.nextCursor;
 assert.equal((await a.request('referral-page',{query:{view:'referral-page',actor:owner,state:'failed',cursor}})).code,400);
 assert.equal((await a.request('referral-page',{query:{view:'referral-page',actor:owner,cursor:cursor+'bad'}})).code,400);
 const denied=api({access:null});assert.equal((await denied.request('referral-page',{query:{view:'referral-page',actor:owner,cursor}})).code,403);
});
test('malformed report rows, duplicate queries and HTTP method mismatches fail closed',async()=>{
 const a=api({data:()=>({actor:owner,rows:[{...row(),pin:'private'}],nextAfter:null})});assert.equal((await a.request('referral-page')).code,503);
 const b=api();assert.equal((await b.request('referral-page',{url:'/api/admin-staff?view=referral-page&view=referral-page'})).code,400);assert.equal((await b.request('referral-overview',{method:'POST'})).code,405);
});
test('existing staff API dispatches referrals without listing staff or sending invitations',async()=>{
 const f=api(),h=createHandler({authorize:async()=>({client:f.client,user:{id:owner},access:{is_owner:true}}),env}),r=response();await h({method:'GET',headers:{},url:'/api/admin-staff?view=referral-page&actor='+owner},r);assert.equal(r.code,200);assert.equal(f.calls.filter(c=>c.name==='matmove_referral_admin_page').length,1);assert.equal(f.calls.some(c=>c.name?.includes('staff_')),false);
});

import {build} from 'esbuild';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
const fields=['id','new_user_email','inviter_email','beneficiary_email','code','kind','amount_minor','currency','state','provider_id','created_at','updated_at'];
const uiOverview=()=>({...overview(),owner:true,activationReady:false,treasury:{accountId:'fac-referral',availableMinor:'3960',currency:'SLE',observedAt:'2026-10-27T10:00:00Z'},treasuryError:null});
const page=(rows=[row()],nextCursor=null)=>({actor:owner,rows,columns:fields,cutoff:'2026-10-27T11:00:00Z',nextCursor,complete:nextCursor===null});
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>n==null||typeof n==='boolean'?'':typeof n!=='object'?String(n):Array.isArray(n)?n.map(text).join(''):text(n.props?.children);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function ui(fn,options={}){
 const old={fetch:globalThis.fetch,localStorage:globalThis.localStorage},saved=new Map(options.saved||[]),calls=[],downloads=[],sources=[],slots=[],effects=[];let i=0,dirty=true,tree,unmounted=false,identity=owner,failWrites=false;
 const same=(a,b)=>a&&a.length===b?.length&&a.every((v,j)=>Object.is(v,b[j]));
 const state={access:options.access||{id:owner,is_active:true,is_owner:true,permissions:[]},db:{auth:{getSession:async()=>({data:{session:{user:{id:identity},access_token:'fixture'}},error:null})}},download:async args=>{downloads.push(args);return args.report.rows.length;},hooks:{useState(initial){const n=i++;if(!(n in slots))slots[n]={value:typeof initial==='function'?initial():initial};return[slots[n].value,v=>{slots[n].value=typeof v==='function'?v(slots[n].value):v;dirty=true;}];},useRef(initial){const n=i++;if(!(n in slots))slots[n]={current:initial};return slots[n];},useCallback(fn,deps){const n=i++;if(!(n in slots)||!same(slots[n].deps,deps))slots[n]={fn,deps};return slots[n].fn;},useEffect(fn,deps){const n=i++,prior=slots[n];if(!prior||!same(prior.deps,deps)){slots[n]={deps,cleanup:prior?.cleanup};effects.push(()=>{slots[n].cleanup?.();slots[n].cleanup=fn();});}}}};
 globalThis.__refAdminUI=state;globalThis.localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>{if(failWrites)throw Error('Storage blocked');saved.set(k,v);},removeItem:k=>saved.delete(k)};
 globalThis.fetch=async(url,init)=>{const q=new URL(url,'https://admin.example').searchParams,view=q.get('view');calls.push({view,query:q,body:init.body?JSON.parse(init.body):null});let b=options.handler?await options.handler(view,calls.at(-1),calls):undefined;if(b===undefined)b=view==='referral-overview'?uiOverview():view==='referral-page'?page():{actor:owner,requestId:JSON.parse(init.body).requestId,saved:true,revision:(BigInt(JSON.parse(init.body).expectedRevision)+1n).toString()};return {ok:true,json:async()=>b};};
 const dir=await mkdtemp(join(process.cwd(),'.referral-admin-')),out=join(dir,'ui.mjs');
 try{
  await build({entryPoints:['src/pages/FinancialsPage.tsx'],tsconfig:'tsconfig.app.json',outfile:out,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react/*','lucide-react'],plugins:[{name:'referral-ui',setup(b){b.onResolve({filter:/^react$/},()=>({path:'hooks',namespace:'mock'}));b.onResolve({filter:/^(?:@|\.\.)\/lib\/supabase$/},()=>({path:'supabase',namespace:'mock'}));b.onResolve({filter:/^@\/lib\/(adminAccess|csvExport)$/},a=>({path:a.path.split('/').at(-1),namespace:'mock'}));b.onResolve({filter:/^@\/components\/AdminLayout$/},()=>({path:'layout',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({resolveDir:process.cwd(),contents:({hooks:'export const {useState,useRef,useEffect,useCallback}=globalThis.__refAdminUI.hooks;',supabase:'export const supabase=globalThis.__refAdminUI.db;',adminAccess:`export {canAdminAccess as canAccess} from ${JSON.stringify(join(process.cwd(),'shared/admin-permissions.js'))};export const useAdminAccess=()=>globalThis.__refAdminUI.access;`,csvExport:'export const exportCompleteCsv=(...args)=>globalThis.__refAdminUI.download(...args);',layout:'export default function Layout(){return null;}'})[a.path]}));}}]});
  const module=await import(pathToFileURL(out));const render=()=>{i=0;dirty=false;tree=module.ReferralAdminPanel({onSource:v=>sources.push(v)});while(effects.length)effects.shift()();};
  const settle=async()=>{for(let n=0;n<20;n++){if(dirty&&!unmounted)render();await new Promise(r=>setImmediate(r));}if(dirty&&!unmounted)render();};
  const button=label=>{const n=nodes(tree).find(n=>n.type==='button'&&text(n)===label);assert.ok(n,`Missing ${label}: ${text(tree)}`);return n;};
  const h={calls,downloads,saved,sources,module,settle,get text(){return text(tree);},get tree(){return tree;},button,async click(label){const n=button(label);assert.ok(!n.props.disabled);n.props.onClick();await settle();},async input(label,value){const n=nodes(tree).find(n=>n.props?.['aria-label']===label);assert.ok(n);n.props.onChange({target:{value}});await settle();},async confirm(){const label=nodes(tree).find(n=>n.type==='label'&&text(n).includes('I reviewed'));nodes(label).find(n=>n.type==='input').props.onChange({target:{checked:true}});await settle();},blockWrites(){failWrites=true;},setIdentity(v){identity=v;},async access(v){state.access=v;dirty=true;await settle();},unmount(){unmounted=true;slots.forEach(s=>s?.cleanup?.());}};
  try{await settle();await fn(h);}finally{h.unmount();}
 }finally{await rm(dir,{recursive:true,force:true});delete globalThis.__refAdminUI;for(const[k,v]of Object.entries(old))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
}
test('Admin referral UI keeps unassigned users out and financial readers have no owner controls',async()=>{
 await ui(async h=>{assert.equal(h.calls.length,0);assert.equal(h.text,'');},{access:{id:owner,is_active:true,is_owner:false,permissions:[]}});
 await ui(async h=>{assert.match(h.text,/Confirmed credited rewards/);assert.doesNotMatch(h.text,/Owner campaign controls/);},{access:{id:owner,is_active:true,is_owner:false,permissions:['financials']},handler:async view=>view==='referral-overview'?{...uiOverview(),owner:false}:undefined});
});
test('Admin referral UI displays confirmed balance, locks activation and preserves precise comma formatting',()=>ui(async h=>{
 assert.match(h.text,/SLE 39.60/);assert.match(h.text,/Activation is locked/);assert.equal(h.module.referralDisplayMoney('100000'),'SLE 1,000');assert.equal(h.module.referralBudget('39.60'),'3960');assert.throws(()=>h.module.referralBudget('1.001'));assert.ok(h.sources.includes('fac-referral'));
}));
test('owner saves only after review, duplicate clicks send once, and a verified receipt clears the retained request',()=>ui(async h=>{
 assert.equal(h.button('Save reviewed settings').props.disabled,true);await h.input('Referral budget','20');await h.input('Campaign change reason','Reviewed campaign budget');await h.confirm();const button=h.button('Save reviewed settings');button.props.onClick();button.props.onClick();await h.settle();const posts=h.calls.filter(c=>c.view==='referral-settings');assert.equal(posts.length,1);assert.equal(posts[0].body.budgetMinor,'2000');assert.equal(posts[0].body.expectedRevision,'0');assert.equal(posts[0].body.accepting,false);assert.equal(h.saved.size,0);assert.match(h.text,/settings saved/);
}));
test('lost settings responses retain the exact request; retry cannot invent a new key or changed payload',async()=>{
 let attempts=0,original;await ui(async h=>{await h.input('Campaign change reason','Reviewed budget');await h.confirm();await h.click('Save reviewed settings');assert.match(h.text,/Response lost/);assert.equal(h.saved.size,1);await h.click('Retry original settings request');const posts=h.calls.filter(c=>c.view==='referral-settings');assert.equal(posts.length,2);assert.deepEqual(posts[0].body,posts[1].body);assert.equal(h.saved.size,0);},{handler:async(view,c)=>{if(view==='referral-settings'&&++attempts===1){original=c.body;throw Error('Response lost');}return undefined;}});
});
test('blocked storage and changed session stop before settings POST',async()=>{
 for(const mode of ['storage','identity'])await ui(async h=>{await h.input('Campaign change reason','Reviewed budget');await h.confirm();if(mode==='storage')h.blockWrites();else h.setIdentity(staff);await h.click('Save reviewed settings');assert.equal(h.calls.filter(c=>c.view==='referral-settings').length,0);assert.match(h.text,/storage|sign-in changed/);});
});
test('full referral CSV waits for all pages, prevents duplicate downloads and preserves its filter',()=>ui(async h=>{
 const button=h.button('Export full referral CSV');button.props.onClick();button.props.onClick();await h.settle();assert.equal(h.downloads.length,1);assert.equal(h.downloads[0].report.rows.length,2);assert.equal(h.downloads[0].report.complete,true);assert.ok(h.calls.filter(c=>c.view==='referral-page').every(c=>c.query.get('state')==='all'));
},{handler:async(view,c)=>view==='referral-page'?(c.query.get('cursor')?page([row(2)]):page([row()],'next-cursor')):undefined}));
test('failed CSV pages and revocation never download partial or retained customer rows',async()=>{
 await ui(async h=>{await h.click('Export full referral CSV');assert.equal(h.downloads.length,0);assert.match(h.text,/Page unavailable/);},{handler:async(view,c)=>{if(view==='referral-page'){if(c.query.get('cursor'))throw Error('Page unavailable');return page([row()],'cursor');}}});
 const wait=deferred();let reads=0;await ui(async h=>{h.button('Export full referral CSV').props.onClick();await h.settle();await h.access({id:owner,is_active:false,is_owner:false,permissions:[]});wait.resolve(page());await h.settle();assert.equal(h.downloads.length,0);assert.equal(h.text,'');},{handler:async view=>view==='referral-page'&&++reads>1?wait.promise:undefined});
});

test('release switch alone cannot activate without a running scheduler and an exact recent deployment probe',async()=>{
 const wants={...body(),accepting:true,payments:true};
 for(const patch of [{enabled:false},{jobActive:false},{schemaReady:false},{secretPresent:false},{probeVerified:false},{probeSource:'fac-other'},{probeStatus:401},{probeTimedOut:true},{probeQueuedAt:'2000-01-01T00:00:00Z'},{probeQueuedAt:'2099-01-01T00:00:00Z'},{schedule:'0 0 * * *'}]){
  const f=api({ready:true,live:true,scheduler:{...schedulerHealth(),...patch}}),r=await f.request('referral-settings',{body:wants});assert.equal(r.code,400);assert.equal(f.calls.find(c=>c.name==='matmove_referral_admin_save').args.p_ready,false);assert.equal(f.calls.some(c=>c.url),false);
 }
});
test('fresh verified scheduler health permits only reviewed owner activation after live balance confirmation',async()=>{
 const f=api({ready:true,live:true}),r=await f.request('referral-settings',{body:{...body(),accepting:true,payments:true}});assert.equal(r.code,200);assert.equal(f.calls.find(c=>c.name==='matmove_referral_admin_save').args.p_ready,true);assert.ok(f.calls.findIndex(c=>c.url)<f.calls.findIndex(c=>c.name==='matmove_referral_admin_save'));assert.ok(f.calls.filter(c=>c.url).every(c=>c.options.method==='GET'));
 const overview=await f.request('referral-overview');assert.equal(overview.body.activationReady,true);
});
test('missing scheduler health, test-mode settings or a failed provider balance keep activation locked',async()=>{
 for(const options of [{scheduler:null},{live:false},{providerError:true}]){
  const f=api({ready:true,live:true,...options}),r=await f.request('referral-settings',{body:{...body(),accepting:true,payments:true}});assert.ok(r.code>=400);assert.ok(!f.calls.some(c=>c.name==='matmove_referral_admin_save'&&c.args.p_ready===true));
 }
 const f=api({ready:true,live:true,scheduler:null}),r=await f.request('referral-overview');assert.equal(r.code,200);assert.equal(r.body.activationReady,false);assert.equal(r.body.treasury.availableMinor,'3960');
});
test('pausing and saving a paused budget never depend on worker readiness or a provider call',async()=>{
 const f=api({ready:true,live:true,scheduler:null}),r=await f.request('referral-settings');assert.equal(r.code,200);assert.equal(f.calls.some(c=>c.name==='matmove_referral_scheduler_status'||c.url),false);assert.equal(f.calls.find(c=>c.name==='matmove_referral_admin_save').args.p_ready,false);
});
