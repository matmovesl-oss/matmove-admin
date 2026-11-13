import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createMoneyHandler,moneyMinor} from '../server/admin-money.js';
const actor='11111111-1111-4111-8111-111111111111',employee='22222222-2222-4222-8222-222222222222',customer='33333333-3333-4333-8333-333333333333',wallet='44444444-4444-4444-8444-444444444444',other='55555555-5555-4555-8555-555555555555';
const res=()=>({setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
const tables=new Set(['profiles','wallets','matmove_staff_access','matmove_admin_payroll','matmove_admin_refunds']);
const ident=s=>{assert.match(s,/^[a-z_]+$/);return '"'+s+'"';};
async function fixture(){
 const pg=new PGlite({postgresqlconf:['shared_buffers=16MB','max_connections=10','work_mem=1MB']});
 await pg.exec(`create schema auth;create role anon;create role authenticated;create role service_role bypassrls;
 create table auth.users(id uuid primary key);insert into auth.users values('${actor}'),('${employee}'),('${customer}'),('${other}');
 create table profiles(id uuid primary key,role text,full_name text,email text,phone text,is_payroll_staff boolean default false,is_wallet_frozen boolean default false,is_active boolean default true);
 insert into profiles(id,role,full_name) values('${actor}','admin','Owner'),('${employee}','staff','Employee'),('${customer}','rider','Customer'),('${other}','merchant','Other');
 create table wallets(id uuid primary key,user_id uuid,currency text,monime_account_id text,metadata jsonb,is_frozen boolean default false);
 insert into wallets(id,user_id,currency,monime_account_id) values('${wallet}','${employee}','SLE','fac-employee'),(gen_random_uuid(),'${customer}','SLE','fac-customer');
 create table matmove_staff_access(id uuid primary key,is_active boolean,is_owner boolean,removed_at timestamptz,permissions jsonb);
 insert into matmove_staff_access values('${actor}',true,true,null,'[]');
 grant usage on schema public,auth to service_role,authenticated,anon;
 `);
 await pg.exec(await readFile('supabase/migrations/20261104000100_admin_money_ledgers.sql','utf8'));
 const migration=await readFile('supabase/migrations/20261104000200_admin_money_claims.sql','utf8');await pg.exec(migration);
 const db={rpc:async(name,args)=>{
  try{
   assert.match(name,/^matmove_admin_money_(prepare|claim|record|review)$/);
   const placeholders=Object.keys(args).map((_,i)=>"$"+(i+1)).join(",");
   const sql="select public."+name+"("+placeholders+") value";
   const result=await pg.query(sql,Object.values(args));
   return {data:result.rows[0].value,error:null};
  }catch(e){return {data:null,error:{message:e.message}};}
 },from(table){
  assert.ok(tables.has(table));
  const filters=[];let limit=50;
  const q={
   select(){return q;},
   eq(k,v){filters.push({k,op:"=",v});return q;},
   is(k,v){filters.push({k,op:v===null?"IS NULL":"=",v});return q;},
   not(k,op,v){if(op!=="in")throw Error("Unsupported test filter");filters.push({k,op:"NOT IN",raw:v});return q;},
   order(){return q;},
   limit(n){limit=n;return q;},
   async run(single=false){
    try{
     const values=[];
     const clauses=filters.map(f=>{
      if(f.op==="IS NULL")return ident(f.k)+" IS NULL";
      if(f.op==="NOT IN")return ident(f.k)+" NOT IN "+f.raw;
      values.push(f.v);return ident(f.k)+"=$"+values.length;
     });
     const sql="select * from public."+ident(table)+" "+(clauses.length?"where "+clauses.join(" and "):"")+" limit "+limit;
     const result=await pg.query(sql,values);
     return {data:single?result.rows[0]||null:result.rows,error:null};
    }catch(e){return {data:null,error:{message:e.message}};}
   },
   maybeSingle(){return q.run(true);},
   then(a,b){return q.run().then(a,b);}
  };
  return q;
 }};
 const env={MONIME_STAFF_PAYROLL_ACCOUNT_ID:'fac-payroll',MONIME_REFUND_ACCOUNT_ID:'fac-refund',MONIME_API_KEY:'mon_test_fixture',MONIME_ENVIRONMENT:'test',MONIME_SPACE_ID:'spc-fixture',MATMOVE_ADMIN_MONEY_ENABLED:'true'};
 let mode='completed';const calls=[];const receipts=new Map();let claimedCount=0;
 const fetcher=async(url,options)=>{calls.push({url,options});if(url.includes('/financial-accounts/')){const id=url.split('/financial-accounts/')[1].split('?')[0];return {ok:true,json:async()=>({result:{id,currency:'SLE',balance:{available:{currency:'SLE',value:500000}}}})};}
  if(options.method==='POST'){
   claimedCount++;const b=JSON.parse(options.body);const receipt={...b,id:'trn-'+crypto.randomUUID(),status:mode==='processing'?'processing':mode==='failed'?'failed':'completed'};receipts.set(receipt.id,receipt);
   if(mode==='lost')throw Error('Network lost after provider received transfer');
   if(mode==='wrong')receipt.amount={currency:'SLE',value:b.amount.value+1};
   return {ok:true,json:async()=>({result:receipt})};
  }
  const receipt=receipts.get(url.split('/').at(-1));return {ok:!!receipt,json:async()=>({result:receipt})};
 };
 const authorize=async()=>({client:db,user:{id:actor},access:{id:actor,is_active:true,is_owner:true}});
 const handler=kind=>createMoneyHandler(kind,{authorize,env,fetcher});
 const body=(kind,key=crypto.randomUUID())=>kind==='payroll'?{staffUserId:employee,requestKey:key,amount:'125.50',reason:'November payroll'}:{recipientUserId:customer,recipientAccountId:'fac-customer',requestKey:key,amount:'125.50',reason:'Original refund case'};
 const request=async(kind,b)=>{const r=res();await handler(kind)({method:'POST',url:'/',headers:{},body:b},r);return r;};
 const rpc=async(name,args)=>{const r=await db.rpc(name,args);if(r.error)throw Error(r.error.message);return r.data;};
 const prepare=(kind,b)=>rpc('matmove_admin_money_prepare',{p_kind:kind,p_actor:actor,p_key:b.requestKey,p_user:b.staffUserId||b.recipientUserId,p_account:kind==='payroll'?'fac-employee':'fac-customer',p_source:kind==='payroll'?'fac-payroll':'fac-refund',p_amount:12550,p_reason:b.reason});
 return {pg,db,env,calls,receipts,handler,body,request,rpc,prepare,migration,setMode:v=>mode=v,get posts(){return claimedCount;}};
}
test('Admin payroll and refunds use real SQL claims and exact provider receipts',async t=>{
 const f=await fixture();try{
  for(const kind of ['payroll','refund']){
   await t.test(`${kind}: one exact payment completes, original retries make no second POST`,async()=>{
    const b=f.body(kind),r=await f.request(kind,b);assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(r.body.status,'completed');assert.equal(r.body.amount.value,12550);const n=f.posts;const retry=await f.request(kind,b);assert.equal(retry.body.success,true);assert.equal(f.posts,n);
    const changed=await f.request(kind,{...b,reason:'Changed original reason'});assert.equal(changed.code,409);assert.equal(f.posts,n);
   });
   await t.test(`${kind}: a lost POST response never causes another POST, including after a migration rerun`,async()=>{
    f.setMode('lost');const b=f.body(kind),n=f.posts;const r=await f.request(kind,b);assert.equal(r.body.status,'review_required');assert.equal(f.posts,n+1);
    await f.pg.exec(f.migration);const retry=await f.request(kind,b);assert.equal(retry.code,202);assert.equal(retry.body.status,'review_required');assert.equal(f.posts,n+1);f.setMode('completed');
   });
   await t.test(`${kind}: processing polls its known receipt after pause and wallet freeze without a new transfer`,async()=>{
    f.setMode('processing');const b=f.body(kind);const r=await f.request(kind,b);assert.equal(r.code,202);const n=f.posts;const receipt=f.receipts.get(r.body.providerTransferId);receipt.status='completed';
    f.env.MATMOVE_ADMIN_MONEY_ENABLED='false';await f.pg.exec('update wallets set is_frozen=true');const done=await f.request(kind,b);assert.equal(done.body.status,'completed');assert.equal(f.posts,n);
    await f.pg.exec('update wallets set is_frozen=false');f.env.MATMOVE_ADMIN_MONEY_ENABLED='true';f.setMode('completed');
   });
   await t.test(`${kind}: a wrong receipt cannot become completed or trigger another attempt`,async()=>{
    f.setMode('wrong');const b=f.body(kind),n=f.posts;const r=await f.request(kind,b);assert.equal(r.body.status,'review_required');assert.equal(f.posts,n+1);const second=await f.request(kind,b);assert.equal(second.body.success,false);assert.equal(f.posts,n+1);f.setMode('completed');
   });
   await t.test(`${kind}: concurrent HTTP confirmations authorize one provider POST`,async()=>{
    const b=f.body(kind),n=f.posts;const result=await Promise.all([f.request(kind,b),f.request(kind,b)]);assert.equal(f.posts,n+1);assert.ok(result.every(r=>[200,202].includes(r.code)),JSON.stringify(result.map(r=>r.body)));
   });
   await t.test(`${kind}: removed permissions, frozen recipients, invalid amounts and paused new payments stop before POST`,async()=>{
    const n=f.posts;
    await f.pg.exec('update wallets set is_frozen=true');assert.equal((await f.request(kind,f.body(kind))).code,409);await f.pg.exec('update wallets set is_frozen=false');
    await f.pg.exec(`update matmove_staff_access set is_active=false where id='${actor}'`);assert.equal((await f.request(kind,f.body(kind))).code,403);await f.pg.exec(`update matmove_staff_access set is_active=true where id='${actor}'`);
    for(const amount of ['0','-1','1.001','NaN','1e2',125.5])assert.equal((await f.request(kind,{...f.body(kind),amount})).code,400);
    f.env.MATMOVE_ADMIN_MONEY_ENABLED='false';assert.equal((await f.request(kind,f.body(kind))).code,503);f.env.MATMOVE_ADMIN_MONEY_ENABLED='true';assert.equal(f.posts,n);
   });
  }
  await t.test('an unattempted stage-2 row remains claimable through reruns while old rows can never be claimed',async()=>{
   const b=f.body('payroll');await f.prepare('payroll',b);await f.pg.exec(f.migration);
   const args={p_kind:'payroll',p_actor:actor,p_key:b.requestKey};assert.equal((await f.rpc('matmove_admin_money_claim',args)).can_create,true);assert.equal((await f.rpc('matmove_admin_money_claim',args)).can_create,false);
   const key=crypto.randomUUID();await f.pg.query('insert into matmove_admin_payroll(request_key,initiated_by,staff_user_id,wallet_id,source_account_id,recipient_account_id,amount_minor,reason) values($1,$2,$3,$4,$5,$6,100,$7)',[key,actor,employee,wallet,'fac-payroll','fac-employee','Legacy original']);await f.pg.exec(f.migration);
   assert.equal((await f.rpc('matmove_admin_money_claim',{...args,p_key:key})).can_create,false);
  });
  await t.test('changed links, removed staff, ambiguous wallets and customer-linked sources cannot receive a claim',async()=>{
   const b=f.body('payroll');await f.prepare('payroll',b);await f.pg.exec("update wallets set monime_account_id='fac-changed' where currency='SLE' and monime_account_id='fac-employee'");
   await assert.rejects(()=>f.rpc('matmove_admin_money_claim',{p_kind:'payroll',p_actor:actor,p_key:b.requestKey}),/wallet.*changed/);await f.pg.exec("update wallets set monime_account_id='fac-employee' where monime_account_id='fac-changed'");
   await f.pg.exec(`insert into matmove_staff_access values('${employee}',false,false,now(),'[]')`);await assert.rejects(()=>f.prepare('payroll',f.body('payroll')),/inactive staff/);await f.pg.exec(`delete from matmove_staff_access where id='${employee}'`);
   await f.pg.exec(`insert into wallets values(gen_random_uuid(),'${other}','SLE','fac-employee',null,false)`);await assert.rejects(()=>f.prepare('payroll',f.body('payroll')),/ambiguous/);await f.pg.exec(`delete from wallets where user_id='${other}'`);
  });
  await t.test('receipt metadata, provider ID, exact accounts and integer amounts are mandatory; terminal states never regress',async()=>{
   const b=f.body('payroll');const done=await f.request('payroll',b);const original=f.receipts.get(done.body.providerTransferId);
   for(const patch of [{id:'not-transfer'},{amount:{currency:'SLE',value:'12550'}},{metadata:{}},{destinationFinancialAccount:{id:'fac-other'}}]){
    await assert.rejects(()=>f.rpc('matmove_admin_money_record',{p_kind:'payroll',p_actor:actor,p_key:b.requestKey,p_receipt:{...original,...patch}}),/receipt/);
   }
   for(const status of ['processing','failed']){const r=await f.rpc('matmove_admin_money_record',{p_kind:'payroll',p_actor:actor,p_key:b.requestKey,p_receipt:{...original,status}});assert.equal(r.state,'completed');}
   assert.equal((await f.rpc('matmove_admin_money_review',{p_kind:'payroll',p_actor:actor,p_key:b.requestKey})).state,'completed');
  });
  await t.test('browser roles cannot execute money RPCs or inspect receipts and audit tables',async()=>{
   for(const role of ['anon','authenticated']){
    await f.pg.exec('set role '+role);
    for(const sql of ["select public.matmove_admin_money_claim('payroll',null,null)","select * from matmove_admin_payroll","select * from matmove_admin_money_receipts"]){await assert.rejects(()=>f.pg.exec(sql),/permission denied/);}
    await f.pg.exec('reset role');
   }
  });
  await t.test('balance is read-only, explicit Live/Test mismatches stop provider access, and history labels unverified old completion honestly',async()=>{
   let r=res();await f.handler('payroll')({method:'GET',url:'/?view=balance',headers:{}},r);assert.equal(r.code,200);assert.equal(r.body.balance.value,500000);assert.equal(r.body.actor,actor);
   const calls=f.calls.length;f.env.MONIME_ENVIRONMENT='live';r=res();await f.handler('payroll')({method:'GET',url:'/?view=balance',headers:{}},r);assert.equal(r.code,503);assert.equal(f.calls.length,calls);f.env.MONIME_ENVIRONMENT='test';
   const key=crypto.randomUUID();await f.pg.query("insert into matmove_admin_payroll(request_key,initiated_by,staff_user_id,wallet_id,source_account_id,recipient_account_id,amount_minor,reason,state,provider_transfer_id) values($1,$2,$3,$4,'fac-payroll','fac-employee',100,'Legacy completed','completed','trn-legacy')",[key,actor,employee,wallet]);
   r=res();await f.handler('payroll')({method:'GET',url:'/?view=history',headers:{}},r);assert.equal(r.code,200);assert.equal(r.body.rows.find(v=>v.request_key===key).state,'review_required');assert.ok(r.body.rows.every(v=>!('verified_receipt' in v)));
  });
  await t.test('unsupported methods and unauthenticated callers never initialize provider work',async()=>{
   const n=f.posts;const denied=createMoneyHandler('payroll',{authorize:async()=>{throw Object.assign(Error('Denied'),{status:401})},env:f.env,fetcher:async()=>{throw Error('Must not call provider')}});
   let r=res();await denied({method:'POST',headers:{},body:f.body('payroll')},r);assert.equal(r.code,401);r=res();await denied({method:'DELETE'},r);assert.equal(r.code,405);assert.equal(f.posts,n);
   assert.equal(moneyMinor('125.50'),12550);
  });
 }finally{await f.pg.close();}
});
