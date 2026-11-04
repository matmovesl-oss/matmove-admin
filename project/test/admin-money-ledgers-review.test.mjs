import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const actor='11111111-1111-4111-8111-111111111111';
const recipient='22222222-2222-4222-8222-222222222222';
const key='33333333-3333-4333-8333-333333333333';
const wallet='44444444-4444-4444-8444-444444444444';
test('uploaded Admin money migration preserves data and restricts both ledgers',async t=>{
 const pg=new PGlite({postgresqlconf:['shared_buffers=16MB','max_connections=10','work_mem=1MB']});
 try{
  await pg.exec(`create schema auth;create role anon;create role authenticated;create role service_role bypassrls;
  create table auth.users(id uuid primary key);insert into auth.users values('${actor}'),('${recipient}');
  create table admin_refunds(id uuid primary key,reason text);
  insert into admin_refunds values('${key}','Preserve legacy history');
  alter table admin_refunds enable row level security;
  create policy "Allow admins full access to refunds" on admin_refunds for all to public using(true) with check(true);
  grant all on admin_refunds to public,anon,authenticated;
  grant usage on schema public,auth to anon,authenticated,service_role;`);
  const sql=await readFile('supabase/migrations/20261104000100_admin_money_ledgers.sql','utf8');
  await t.test('creates both ledgers with RLS and removes the known unrestricted legacy policy',async()=>{
   await pg.exec(sql);
   const tables=(await pg.query("select relname,relrowsecurity from pg_class where oid in ('public.matmove_admin_refunds'::regclass,'public.matmove_admin_payroll'::regclass)")).rows;
   assert.equal(tables.length,2);assert.ok(tables.every(r=>r.relrowsecurity));
   assert.equal((await pg.query("select count(*)::int n from pg_policies where tablename in ('matmove_admin_refunds','matmove_admin_payroll') or tablename='admin_refunds' and policyname='Allow admins full access to refunds'")).rows[0].n,0);
  });
  const asRole=async(role,fn)=>{await pg.exec('set role '+role);try{return await fn();}finally{await pg.exec('reset role');}};
  await t.test('anonymous and authenticated browser roles cannot read or mutate any of the three financial tables',async()=>{
   for(const role of ['anon','authenticated'])for(const table of ['admin_refunds','matmove_admin_refunds','matmove_admin_payroll'])for(const query of [`select * from ${table}`,`delete from ${table}`,`update ${table} set reason='forged'`,`insert into ${table}(reason) values('forged')`]){
    await assert.rejects(()=>asRole(role,()=>pg.exec(query)),/permission denied/);
   }
  });
  const refund={request_key:key,initiated_by:actor,recipient_user_id:recipient,recipient_account_id:'fac-recipient',source_account_id:'fac-refund',amount_minor:100,currency:'SLE',reason:'Reviewed customer refund'};
  const payroll={request_key:key,initiated_by:actor,staff_user_id:recipient,wallet_id:wallet,recipient_account_id:'fac-recipient',source_account_id:'fac-payroll',amount_minor:100,currency:'SLE',reason:'Reviewed payroll'};
  const insert=async(table,row)=>pg.query(`insert into ${table} (${Object.keys(row).join(',')}) values(${Object.keys(row).map((_,i)=>'$'+(i+1)).join(',')}) returning *`,Object.values(row));
  await t.test('service role can persist separate payroll and refund records using exact minor units',async()=>{
   await asRole('service_role',()=>insert('matmove_admin_refunds',refund));await asRole('service_role',()=>insert('matmove_admin_payroll',payroll));
   assert.equal((await pg.query('select amount_minor::text amount,state from matmove_admin_refunds')).rows[0].amount,'100');
   assert.equal((await pg.query('select state from matmove_admin_payroll')).rows[0].state,'initiating');
  });
  await t.test('duplicate keys, invalid amounts, currencies, states and identical account pairs are rejected',async()=>{
   for(const [table,original]of [['matmove_admin_refunds',refund],['matmove_admin_payroll',payroll]]){
    await assert.rejects(()=>insert(table,original),/unique constraint/);
    for(const patch of [{amount_minor:0},{amount_minor:-1},{amount_minor:'1000000000001'},{currency:'USD'},{state:'success'},{reason:' '},{recipient_account_id:original.source_account_id}]){
     await assert.rejects(()=>insert(table,{...original,request_key:crypto.randomUUID(),...patch}),/check constraint/);
    }
   }
  });
  await t.test('migration reruns preserve all original records and confirmed transfer IDs',async()=>{
   await pg.exec("update matmove_admin_refunds set state='completed',provider_status='completed',provider_transfer_id='trn-refund-original';update matmove_admin_payroll set state='completed',provider_status='completed',provider_transfer_id='trn-payroll-original'");
   const before=await Promise.all(['admin_refunds','matmove_admin_refunds','matmove_admin_payroll'].map(async table=>(await pg.query('select * from '+table)).rows));
   await pg.exec(sql);await pg.exec(sql);
   const after=await Promise.all(['admin_refunds','matmove_admin_refunds','matmove_admin_payroll'].map(async table=>(await pg.query('select * from '+table)).rows));assert.deepEqual(after,before);
  });
  await t.test('financial actor identity cannot be deleted while the ledger refers to it',async()=>{
   await assert.rejects(()=>pg.query('delete from auth.users where id=$1',[actor]),/foreign key constraint/);
  });
 }finally{await pg.close();}
});
