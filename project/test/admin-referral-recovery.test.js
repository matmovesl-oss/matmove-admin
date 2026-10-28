
import test from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';
import {createSmallTestDatabase} from './low-memory-db.js';import {createReferralAdminHandler} from '../server/admin-referrals.js';import {createHandler} from '../api/admin-staff.js';
const owner='11111111-1111-4111-8111-111111111111',staff='22222222-2222-4222-8222-222222222222',customer='33333333-3333-4333-8333-333333333333',uuid=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`;
const env={SUPABASE_SERVICE_ROLE_KEY:'cursor-test-key',MONIME_API_KEY:'mon_test_fixture',MONIME_SPACE_ID:'space-fixture',MONIME_ENVIRONMENT:'test'};
const transfer=(reward=uuid(1),provider='trn-original')=>({id:provider,status:'completed',amount:{currency:'SLE',value:100},sourceFinancialAccount:{id:'fac-referral'},destinationFinancialAccount:{id:'fac-customer'},metadata:{matmoveReferralRewardId:reward,matmoveReferralNewUserId:customer,matmoveReferralKind:'new_user',matmoveReferralRequestKey:reward}});
const preview=()=>({actor:owner,rewardId:uuid(1),providerId:'trn-original',amountMinor:'100',currency:'SLE',sourceAccount:'fac-referral',destinationAccount:'fac-customer',kind:'new_user',rewardState:'review_required',providerState:'completed',updatedAt:'2026-10-27T10:00:00.123456+00:00'});
const body=()=>({requestId:uuid(90),rewardId:uuid(1),providerId:'trn-original',expectedUpdatedAt:preview().updatedAt,reason:'Reviewed original provider receipt',confirmed:true});
const receiptSaved=()=>({actor:owner,requestId:uuid(90),rewardId:uuid(1),providerId:'trn-original',recorded:true,state:'completed'});
const response=()=>({setHeader(){},status(n){this.code=n;return this;},json(b){this.body=b;return this;}});
test('Recovery SQL attaches only an exact existing claim and records one owner audit without sending money',async t=>{
 const pg=await createSmallTestDatabase();try{
  await pg.exec(`create schema auth;create role anon;create role authenticated;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${staff}');create table matmove_staff_access(id uuid,is_owner boolean,is_active boolean,removed_at timestamptz);insert into matmove_staff_access values('${owner}',true,true,null),('${staff}',false,true,null);create table matmove_referral_rewards(id uuid primary key,new_user_id uuid,kind text,amount_minor bigint,currency text,source_account text,destination_account text,request_key uuid,provider_id text,state text,reserved_at timestamptz,claimed_at timestamptz,updated_at timestamptz default clock_timestamp());create table matmove_referral_admin_events(id uuid primary key,actor_id uuid,payload jsonb,receipt jsonb,created_at timestamptz default now());
   create function matmove_referral_record(p_reward uuid,p_receipt jsonb) returns jsonb language plpgsql security definer as $$declare r matmove_referral_rewards%rowtype;begin update matmove_referral_rewards set provider_id=p_receipt->>'id',state=case when p_receipt->>'status' in ('completed','failed') then p_receipt->>'status' else 'processing' end,updated_at=clock_timestamp() where id=p_reward returning * into r;if p_receipt->>'id'='trn-rollback' then raise exception 'fixture write failure';end if;return to_jsonb(r);end$$;revoke all on function matmove_referral_record(uuid,jsonb) from public;grant usage on schema public to authenticated,anon,service_role;`);
  const sql=await readFile('docs/REFERRAL_RECOVERY_SETUP.sql','utf8');await pg.exec(sql);await pg.exec(sql);
  const call=async(name,args)=>(await pg.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) v`,args)).rows[0].v;
  const seed=async(n,claimed=true)=>{await pg.query("insert into matmove_referral_rewards(id,new_user_id,kind,amount_minor,currency,source_account,destination_account,request_key,state,reserved_at,claimed_at) values($1,$2,'new_user',100,'SLE','fac-referral','fac-customer',$1,'review_required',now(),case when $3 then now() else null end)",[uuid(n),customer,claimed]);};
  const look=(n,r=transfer(uuid(n)))=>call('matmove_referral_admin_recovery_preview',[owner,uuid(n),r]);
  const attach=(n,p,r,request=uuid(100+n),actor=owner,reason='Verified original receipt')=>call('matmove_referral_admin_recover',[actor,request,uuid(n),r?.id||'trn-original',p.updatedAt,reason,r]);
  await t.test('preview validates the claim but changes no status or audit record',async()=>{await seed(1);const p=await look(1);assert.equal(p.amountMinor,'100');assert.equal(p.rewardState,'review_required');assert.equal((await pg.query('select count(*)::text n from matmove_referral_admin_events')).rows[0].n,'0');});
  await t.test('wrong amount, currency, account, metadata or unclaimed reward is rejected before any write',async()=>{
   for(const mutate of [r=>r.amount.value=200,r=>r.amount.currency='USD',r=>r.destinationFinancialAccount.id='fac-other',r=>r.sourceFinancialAccount.id='fac-other',r=>r.metadata.matmoveReferralRequestKey=uuid(99),r=>r.metadata.matmoveReferralNewUserId=staff,r=>r.metadata.matmoveReferralKind='inviter']){const r=transfer();mutate(r);await assert.rejects(()=>look(1,r),/does not match/);}
   await seed(2,false);await assert.rejects(()=>look(2),/existing authorized/);
  });
  await t.test('financial staff and browser sessions cannot preview, forge owner actor or attach a receipt',async()=>{
   await assert.rejects(()=>call('matmove_referral_admin_recovery_preview',[staff,uuid(1),transfer()]),/Only the active owner/);await pg.exec('set role authenticated');await assert.rejects(()=>look(1),/permission denied/);await assert.rejects(()=>call('matmove_referral_admin_recover',[owner,uuid(50),uuid(1),'trn-original',new Date().toISOString(),'Reviewed',null]),/permission denied/);await pg.exec('reset role');
  });
  await t.test('lookup mode performs no write; exact attachment completes and a lost-response retry returns its original receipt',async()=>{
   const p=await look(1),lookup=await attach(1,p,null);assert.equal(lookup.found,false);const first=await attach(1,p,transfer());assert.equal(first.state,'completed');const replay=await attach(1,p,null);assert.deepEqual(replay,first);assert.equal((await pg.query('select count(*)::text n from matmove_referral_admin_events')).rows[0].n,'1');
   await assert.rejects(()=>attach(1,p,transfer(),uuid(101),owner,'Changed request reason'),/request changed/);
  });
  await t.test('a changed reward requires a new review and leaves the original receipt intact',async()=>{
   await seed(3);const p=await look(3,transfer(uuid(3),'trn-third'));await pg.query('update matmove_referral_rewards set updated_at=clock_timestamp() where id=$1',[uuid(3)]);await assert.rejects(()=>attach(3,p,transfer(uuid(3),'trn-third')),/reward changed/);assert.equal((await pg.query('select state from matmove_referral_rewards where id=$1',[uuid(3)])).rows[0].state,'review_required');
  });
  await t.test('pending receipts stay processing, failed receipts stay failed, and terminal states cannot be overwritten',async()=>{
   for(const [n,status] of [[4,'pending'],[5,'failed']]){await seed(n);const r=transfer(uuid(n),`trn-${n}`);r.status=status;const p=await look(n,r);assert.equal((await attach(n,p,r)).state,status==='pending'?'processing':'failed');}
   const r=transfer(uuid(5),'trn-5');await assert.rejects(()=>look(5,r),/terminal reward/);const r1=transfer();r1.status='processing';await assert.rejects(()=>look(1,r1),/terminal reward/);
  });
  await t.test('a transfer already attached to another reward cannot be reused',async()=>{await seed(6);const r=transfer(uuid(6),'trn-original');await assert.rejects(()=>look(6,r),/another reward/);});
  await t.test('database errors roll back reward changes and never create a successful recovery audit',async()=>{
   await seed(7);const r=transfer(uuid(7),'trn-rollback'),p=await look(7,r),count=(await pg.query('select count(*)::text n from matmove_referral_admin_events')).rows[0].n;await assert.rejects(()=>attach(7,p,r),/fixture write failure/);assert.equal((await pg.query('select state from matmove_referral_rewards where id=$1',[uuid(7)])).rows[0].state,'review_required');assert.equal((await pg.query('select count(*)::text n from matmove_referral_admin_events')).rows[0].n,count);
  });
  await t.test('reruns preserve attached receipts and revoking the owner blocks even an old successful retry',async()=>{
   await pg.exec(sql);assert.equal((await pg.query('select state from matmove_referral_rewards where id=$1',[uuid(1)])).rows[0].state,'completed');const p=await look(1);await pg.query('update matmove_staff_access set is_active=false where id=$1',[owner]);await assert.rejects(()=>attach(1,p,null),/Only the active owner/);
  });
 }finally{await pg.close();}
});
function api({isOwner=true,original=false,fetchFailure=false,result,receipt=transfer()}={}){
 const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {error:null,data:result?result(name,args):name==='matmove_referral_admin_recovery_preview'?preview():args.p_receipt||original?receiptSaved():{actor:owner,requestId:uuid(90),found:false}};}};
 const authorize=async(req,keys)=>({client,user:{id:owner},access:{id:owner,is_owner:isOwner}});
 const handler=createReferralAdminHandler({authorize,env,fetcher:async(url,options)=>{calls.push({url,options});if(fetchFailure)throw Error('Private provider error');return {ok:true,json:async()=>({result:receipt})};}});
 const req=(view,patch={})=>({method:view==='referral-recovery-save'?'POST':'GET',url:'/api/admin-staff',headers:{},query:{view,actor:owner,...(view==='referral-recovery'?{reward:uuid(1),transfer:'trn-original'}:{})},body:body(),...patch});
 return {calls,authorize,client,req,run:async(view,patch)=>{const r=response();await handler(req(view,patch),r);return r;}};
}
test('preview reads the exact existing transfer with GET, verified server credentials and no provider POST',async()=>{
 const f=api(),r=await f.run('referral-recovery');assert.equal(r.code,200);assert.equal(r.body.amountMinor,'100');const get=f.calls.find(c=>c.url);assert.equal(get.url,'https://api.monime.io/v1/internal-transfers/trn-original');assert.equal(get.options.method,'GET');assert.equal(get.options.headers.Authorization,'Bearer mon_test_fixture');assert.equal(f.calls.some(c=>c.name==='matmove_referral_admin_recover'),false);
});
test('nonowners, forged receipts, mismatched actors and invalid HTTP methods cannot attach',async()=>{
 const f=api({isOwner:false});assert.equal((await f.run('referral-recovery-save')).code,403);assert.equal(f.calls.length,0);
 for(const patch of [{body:{...body(),receipt:transfer()}},{body:{...body(),confirmed:false}},{query:{view:'referral-recovery-save',actor:staff}},{method:'GET'}]){const f=api();assert.ok((await f.run('referral-recovery-save',patch)).code>=400);assert.equal(f.calls.length,0);}
});
test('a lost Admin response resolves from the original stored receipt even if the provider is unavailable',async()=>{
 const f=api({original:true,fetchFailure:true}),r=await f.run('referral-recovery-save');assert.equal(r.code,200);assert.equal(r.body.recorded,true);assert.equal(f.calls.filter(c=>c.url).length,0);assert.equal(f.calls.filter(c=>c.name==='matmove_referral_admin_recover').length,1);
});
test('new attachment looks up its request first, fetches the original receipt and stores only verified server data',async()=>{
 const f=api(),r=await f.run('referral-recovery-save');assert.equal(r.code,200);const calls=f.calls.filter(c=>c.name==='matmove_referral_admin_recover');assert.equal(calls.length,2);assert.equal(calls[0].args.p_receipt,null);assert.deepEqual(calls[1].args.p_receipt,transfer());assert.equal(calls[1].args.p_actor,owner);assert.equal(f.calls.filter(c=>c.url).length,1);assert.ok(f.calls.filter(c=>c.url).every(c=>c.options.method==='GET'));
});
test('unverified API receipts fail closed and existing staff routing keeps recovery separate from staff changes',async()=>{
 const bad=api({result:()=>({...preview(),destinationAccount:'invalid'})});assert.equal((await bad.run('referral-recovery')).code,503);
 const f=api({original:true}),handler=createHandler({authorize:f.authorize,env}),r=response();await handler(f.req('referral-recovery-save'),r);assert.equal(r.code,200);assert.equal(f.calls.some(c=>c.name?.startsWith('matmove_staff_')),false);
});

const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>n==null||typeof n==='boolean'?'':typeof n!=='object'?String(n):Array.isArray(n)?n.map(text).join(''):text(n.props?.children);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function ui(fn,options={}){
 const old={fetch:globalThis.fetch,localStorage:globalThis.localStorage},saved=new Map(options.saved||[]),calls=[],downloads=[],sources=[],slots=[],effects=[];let i=0,dirty=true,tree,unmounted=false,identity=owner,failWrites=false;
 const same=(a,b)=>a&&a.length===b?.length&&a.every((v,j)=>Object.is(v,b[j]));
 const state={access:options.access||{id:owner,is_active:true,is_owner:true,permissions:[]},db:{auth:{getSession:async()=>({data:{session:{user:{id:identity},access_token:'fixture'}},error:null})}},download:async args=>{downloads.push(args);return args.report.rows.length;},hooks:{useState(initial){const n=i++;if(!(n in slots))slots[n]={value:typeof initial==='function'?initial():initial};return[slots[n].value,v=>{slots[n].value=typeof v==='function'?v(slots[n].value):v;dirty=true;}];},useRef(initial){const n=i++;if(!(n in slots))slots[n]={current:initial};return slots[n];},useCallback(fn,deps){const n=i++;if(!(n in slots)||!same(slots[n].deps,deps))slots[n]={fn,deps};return slots[n].fn;},useEffect(fn,deps){const n=i++,prior=slots[n];if(!prior||!same(prior.deps,deps)){slots[n]={deps,cleanup:prior?.cleanup};effects.push(()=>{slots[n].cleanup?.();slots[n].cleanup=fn();});}}}};
 globalThis.__refAdminUI=state;globalThis.localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>{if(failWrites)throw Error('Storage blocked');saved.set(k,v);},removeItem:k=>saved.delete(k)};
 globalThis.fetch=async(url,init)=>{const q=new URL(url,'https://admin.example').searchParams,view=q.get('view');calls.push({view,query:q,body:init.body?JSON.parse(init.body):null});let b=options.handler?await options.handler(view,calls.at(-1),calls):undefined;if(b===undefined)b=view==='referral-recovery'?preview():{...receiptSaved(),requestId:JSON.parse(init.body).requestId,rewardId:JSON.parse(init.body).rewardId,providerId:JSON.parse(init.body).providerId};return {ok:true,json:async()=>b};};
 const dir=await mkdtemp(join(process.cwd(),'.referral-admin-')),out=join(dir,'ui.mjs');
 try{
  await build({entryPoints:['src/pages/FinancialsPage.tsx'],tsconfig:'tsconfig.app.json',outfile:out,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react/*','lucide-react'],plugins:[{name:'referral-ui',setup(b){b.onResolve({filter:/^react$/},()=>({path:'hooks',namespace:'mock'}));b.onResolve({filter:/^(?:@|\.\.)\/lib\/supabase$/},()=>({path:'supabase',namespace:'mock'}));b.onResolve({filter:/^@\/lib\/(adminAccess|csvExport)$/},a=>({path:a.path.split('/').at(-1),namespace:'mock'}));b.onResolve({filter:/^@\/components\/AdminLayout$/},()=>({path:'layout',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({resolveDir:process.cwd(),contents:({hooks:'export const {useState,useRef,useEffect,useCallback}=globalThis.__refAdminUI.hooks;',supabase:'export const supabase=globalThis.__refAdminUI.db;',adminAccess:`export {canAdminAccess as canAccess} from ${JSON.stringify(join(process.cwd(),'shared/admin-permissions.js'))};export const useAdminAccess=()=>globalThis.__refAdminUI.access;`,csvExport:'export const exportCompleteCsv=(...args)=>globalThis.__refAdminUI.download(...args);',layout:'export default function Layout(){return null;}'})[a.path]}));}}]});
  const module=await import(pathToFileURL(out));const render=()=>{i=0;dirty=false;tree=module.ReferralReceiptRecovery({onRecorded:()=>sources.push('recorded')});while(effects.length)effects.shift()();};
  const settle=async()=>{for(let n=0;n<20;n++){if(dirty&&!unmounted)render();await new Promise(r=>setImmediate(r));}if(dirty&&!unmounted)render();};
  const button=label=>{const n=nodes(tree).find(n=>n.type==='button'&&text(n)===label);assert.ok(n,`Missing ${label}: ${text(tree)}`);return n;};
  const h={calls,downloads,saved,sources,module,settle,get text(){return text(tree);},get tree(){return tree;},button,async click(label){const n=button(label);assert.ok(!n.props.disabled);n.props.onClick();await settle();},async input(label,value){const n=nodes(tree).find(n=>n.props?.['aria-label']===label);assert.ok(n);n.props.onChange({target:{value}});await settle();},async confirm(){const label=nodes(tree).find(n=>n.type==='label'&&text(n).includes('I reviewed'));nodes(label).find(n=>n.type==='input').props.onChange({target:{checked:true}});await settle();},blockWrites(){failWrites=true;},setIdentity(v){identity=v;},async access(v){state.access=v;dirty=true;await settle();},unmount(){unmounted=true;slots.forEach(s=>s?.cleanup?.());}};
  try{await settle();await fn(h);}finally{h.unmount();}
 }finally{await rm(dir,{recursive:true,force:true});delete globalThis.__refAdminUI;for(const[k,v]of Object.entries(old))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
}
async function inspect(h){await h.input('Recovery reward UUID',uuid(1));await h.input('Original reward transfer ID','trn-original');await h.click('Inspect original receipt');}
async function review(h){await inspect(h);await h.input('Receipt recovery reason','Reviewed original receipt');await h.confirm();}
test('recovery screen is owner-only and opening it never looks up or attaches a transfer automatically',async()=>{
 await ui(async h=>{assert.equal(h.calls.length,0);assert.match(h.text,/does not send another payment/);});
 await ui(async h=>{assert.equal(h.text,'');assert.equal(h.calls.length,0);},{access:{id:owner,is_active:true,is_owner:false,permissions:['financials']}});
});
test('owner must inspect valid IDs, review exact SLE1 account details and explicitly confirm before attaching',()=>ui(async h=>{
 await h.click('Inspect original receipt');assert.equal(h.calls.length,0);assert.match(h.text,/valid reward UUID/);await inspect(h);assert.match(h.text,/Reviewed amount: SLE 1/);assert.match(h.text,/fac-customer/);assert.equal(h.button('Attach reviewed receipt').props.disabled,true);assert.equal(h.calls.filter(c=>c.view==='referral-recovery-save').length,0);
}));
test('duplicate attachment clicks store one original request and report the exact confirmed reward state',()=>ui(async h=>{
 await review(h);const b=h.button('Attach reviewed receipt');b.props.onClick();b.props.onClick();await h.settle();const posts=h.calls.filter(c=>c.view==='referral-recovery-save');assert.equal(posts.length,1);assert.equal(posts[0].body.expectedUpdatedAt,preview().updatedAt);assert.equal(posts[0].body.confirmed,true);assert.equal(h.saved.size,0);assert.match(h.text,/Reward state: completed/);assert.deepEqual(h.sources,['recorded']);
}));
test('lost attachment response retains exact payload and Retry never creates another logical attachment',async()=>{
 let attempts=0;await ui(async h=>{await review(h);await h.click('Attach reviewed receipt');assert.equal(h.saved.size,1);assert.match(h.text,/Response lost/);await h.click('Retry original attachment');const posts=h.calls.filter(c=>c.view==='referral-recovery-save');assert.deepEqual(posts[0].body,posts[1].body);assert.equal(h.saved.size,0);},{handler:async view=>{if(view==='referral-recovery-save'&&++attempts===1)throw Error('Response lost');}});
});
test('restored attachment shows its reviewed details and never submits before an explicit retry',()=>ui(async h=>{
 assert.equal(h.calls.length,0);assert.match(h.text,/will not be submitted automatically/);assert.match(h.text,/fac-customer/);assert.match(h.text,/Reviewed original provider receipt/);await h.click('Retry original attachment');assert.equal(h.calls.filter(c=>c.view==='referral-recovery-save').length,1);assert.deepEqual(h.calls[0].body,body());
},{saved:[["matmove-referral-recovery:"+owner,JSON.stringify({actor:owner,body:body(),preview:preview()})]]}));
test('blocked storage or changed identity prevents the attachment API call',async()=>{
 for(const mode of ['storage','identity'])await ui(async h=>{await review(h);if(mode==='storage')h.blockWrites();else h.setIdentity(staff);await h.click('Attach reviewed receipt');assert.equal(h.calls.filter(c=>c.view==='referral-recovery-save').length,0);assert.match(h.text,/storage|sign-in changed/);});
});
test('pending and failed transfer receipts never display a successful customer credit',async()=>{
 for(const [providerState,state] of [['pending','processing'],['failed','failed']])await ui(async h=>{await review(h);await h.click('Attach reviewed receipt');assert.match(h.text,new RegExp('Reward state: '+state));assert.doesNotMatch(h.text,/Reward state: completed/);},{handler:async(view,c)=>view==='referral-recovery'?{...preview(),providerState}:view==='referral-recovery-save'?{...receiptSaved(),requestId:c.body.requestId,state}:undefined});
});
test('malformed or late preview responses cannot expose an actionable attachment after leaving or losing owner access',async()=>{
 await ui(async h=>{await inspect(h);assert.match(h.text,/could not be verified/);assert.equal(nodes(h.tree).some(n=>n.type==='button'&&text(n)==='Attach reviewed receipt'),false);},{handler:async()=>({...preview(),rewardId:staff})});
 const wait=deferred();await ui(async h=>{await h.input('Recovery reward UUID',uuid(1));await h.input('Original reward transfer ID','trn-original');h.button('Inspect original receipt').props.onClick();await h.settle();await h.access({id:owner,is_active:false,is_owner:false,permissions:[]});wait.resolve(preview());await h.settle();assert.equal(h.text,'');assert.equal(h.calls.filter(c=>c.view==='referral-recovery-save').length,0);},{handler:async()=>wait.promise});
});
