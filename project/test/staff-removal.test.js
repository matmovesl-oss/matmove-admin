
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../api/admin-staff.js';
import {requireAdmin} from '../server/admin-auth.js';

const owner='2b08533c-30d5-4714-9f8d-a62f2de22a3e';
const target='33333333-3333-4333-8333-333333333333';
const other='44444444-4444-4444-8444-444444444444';
const version='2026-10-24T10:00:00.123456+00:00';
const env={ADMIN_APP_URL:'https://matmove-admin.vercel.app'};
const response=()=>({setHeader(){},status(n){this.code=n;return this;},json(value){this.body=value;return this;}});
const record=(extra={})=>({id:target,email:'staff@example.com',full_name:'Test Staff',department:'Finance',permissions:['financials'],is_owner:false,is_active:true,removed_at:null,updated_at:version,...extra});

async function database(){
 const pg=new PGlite();
 try{
  await pg.exec(`
   create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;grant usage on schema auth,public to anon,authenticated,service_role;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz default now());
   create table public.admins(id uuid primary key references auth.users(id),email text,full_name text,permissions jsonb default '[]',is_active boolean default true,is_owner boolean default false);
   create table public.profiles(id uuid primary key references auth.users(id),email text,role text);
   create table public.user_roles(profile_id uuid references profiles(id),role text);
   create table public.wallets(id uuid primary key default gen_random_uuid(),user_id uuid references profiles(id),balance numeric,currency text);
   create table public.payment_transactions(id uuid primary key default gen_random_uuid(),user_id uuid references profiles(id),amount numeric,status text);
   create table public.legacy_secrets(id int primary key,value text);
   insert into auth.users(id,email) values('${owner}','matmove.sl@gmail.com'),('${target}','staff@example.com'),('${other}','other@example.com');
   insert into profiles select id,email,case when id='${target}' then 'rider' else 'admin' end from auth.users;
   insert into admins(id,email,permissions) values('${owner}','matmove.sl@gmail.com','[]'),('${target}','staff@example.com','["financials"]'),('${other}','other@example.com','["staff"]');
   insert into user_roles values('${target}','rider'),('${target}','admin');
   insert into wallets(user_id,balance,currency) values('${target}',123.45,'SLE');
   insert into payment_transactions(user_id,amount,status) values('${target}',10,'completed');
   insert into legacy_secrets values(1,'private');
   create function public.is_admin() returns boolean language sql stable security definer as $$select exists(select 1 from public.admins where id=auth.uid())$$;
   create function public.is_admin(p_profile uuid default auth.uid()) returns boolean language sql stable security definer as $$select exists(select 1 from public.admins where id=p_profile)$$;
   create function public.is_super_admin() returns boolean language sql stable security definer as $$select exists(select 1 from public.admins where id=auth.uid())$$;
   create function public.legacy_add_admin(p_id uuid) returns void language sql security definer as $$insert into public.admins(id,email) select id,email from auth.users where id=p_id$$;
  `);
  const base=await readFile(new URL('../docs/STAFF_ACCESS_REPAIR.sql',import.meta.url),'utf8');
  await pg.exec(base.slice(0,base.indexOf('do $policies$'))+'\ncommit;');
  await pg.exec(`
   revoke all on function matmove_staff_save(uuid,uuid,text,text,jsonb,text,boolean,boolean),matmove_admin_access(uuid),matmove_staff_find_user(text) from public,anon,authenticated;
   grant execute on function matmove_staff_save(uuid,uuid,text,text,jsonb,text,boolean,boolean),matmove_admin_access(uuid),matmove_staff_find_user(text) to service_role;
   alter table profiles enable row level security;alter table legacy_secrets enable row level security;
   grant select on profiles,legacy_secrets to authenticated;
   create policy own_or_legacy_admin on profiles for select to authenticated using(id=auth.uid() or public.is_admin(auth.uid()));
   create policy staff_backstop on profiles as restrictive for select to authenticated using(not public.matmove_is_staff() or id=auth.uid() or public.matmove_admin_can('customers'));
   create policy legacy_admin_only on legacy_secrets for select to authenticated using(public.is_admin(auth.uid()));
  `);
  const sql=await readFile(new URL('../docs/STAFF_REMOVAL_SETUP.sql',import.meta.url),'utf8');
  await pg.exec(sql);
  const session=async(id,role='service_role')=>{await pg.exec('reset role');await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await pg.exec('set role '+role);};
  const rpc=async(name,args)=>{const r=await pg.query(`select public.${name}(${args.map((_,n)=>'$'+(n+1)).join(',')}) as data`,args);return r.rows[0].data;};
  const expected=async()=>{await pg.exec('reset role');return(await pg.query('select updated_at::text as version from matmove_staff_access where id=$1',[target])).rows[0].version;};
  const remove=async(actor=owner,v)=>{v=v||await expected();await session(actor);return rpc('matmove_staff_remove',[actor,target,v,'Test assignment ended']);};
  return{pg,session,rpc,expected,remove,sql};
 }catch(e){await pg.close();throw e;}
}

test('SQL removal revokes legacy and current access while retaining Auth, Customer role, wallet and financial history',async()=>{
 const f=await database();try{
  const v=await f.expected();await f.session(target,'authenticated');
  assert.equal((await f.pg.query('select public.is_admin(auth.uid()) as allowed')).rows[0].allowed,true);
  assert.equal((await f.pg.query('select count(*)::int n from legacy_secrets')).rows[0].n,1);
  const result=await f.remove(owner,v);assert.equal(result.removed,true);
  await f.session(target,'authenticated');
  assert.equal((await f.pg.query('select public.is_admin(auth.uid()) as allowed')).rows[0].allowed,false);
  assert.equal((await f.pg.query("select public.matmove_admin_can('financials') as allowed")).rows[0].allowed,false);
  assert.equal((await f.pg.query('select public.matmove_is_staff() as kept')).rows[0].kept,true);
  assert.equal((await f.pg.query('select count(*)::int n from legacy_secrets')).rows[0].n,0);
  assert.deepEqual((await f.pg.query('select id from profiles')).rows.map(x=>x.id),[target]);
  await f.pg.exec('reset role');
  assert.equal((await f.pg.query('select count(*)::int n from auth.users')).rows[0].n,3);
  assert.equal((await f.pg.query('select role from profiles where id=$1',[target])).rows[0].role,'rider');
  assert.deepEqual((await f.pg.query('select role from user_roles where profile_id=$1',[target])).rows.map(x=>x.role),['rider']);
  assert.equal((await f.pg.query('select balance::text amount from wallets where user_id=$1',[target])).rows[0].amount,'123.45');
  assert.equal((await f.pg.query('select count(*)::int n from payment_transactions where user_id=$1',[target])).rows[0].n,1);
  const audit=(await f.pg.query("select details from matmove_staff_audit where action='REMOVE_STAFF'")).rows[0].details;
  assert.deepEqual(audit.previousAccess.permissions,['financials']);assert.ok(audit.legacyAdminMembership);assert.equal(audit.customerAndFinancialRecordsPreserved,true);
 }finally{await f.pg.close();}
});

test('Only the owner can remove, stale versions are rejected, and an old removal retry creates no duplicate audit',async()=>{
 const f=await database();try{
  const v=await f.expected();await assert.rejects(()=>f.remove(other,v),/Only the active owner/);
  await f.session(owner);await assert.rejects(()=>f.rpc('matmove_staff_remove',[owner,owner,v,'Do not remove owner']),/Owner access/);
  await assert.rejects(()=>f.rpc('matmove_staff_remove',[owner,target,'2000-01-01','Assignment ended']),/Staff assignments changed/);
  await assert.rejects(()=>f.rpc('matmove_staff_remove',[owner,target,v,'']),/removal reason/);
  await f.remove(owner,v);await f.remove(owner,v);
  await f.pg.exec('reset role');assert.equal((await f.pg.query("select count(*)::int n from matmove_staff_audit where action='REMOVE_STAFF'")).rows[0].n,1);
 }finally{await f.pg.close();}
});

test('Browser cannot call money-independent staff mutation RPCs, forge a restore flag, or recreate removed legacy grants',async()=>{
 const f=await database();try{
  await f.remove();await f.session(target,'authenticated');
  await assert.rejects(()=>f.rpc('matmove_staff_remove',[owner,other,version,'Forged actor']),/permission denied/);
  await assert.rejects(()=>f.rpc('matmove_staff_restore',[owner,target,version,'Forged Staff',['staff'],'Governance']),/permission denied/);
  await f.pg.query("select set_config('matmove.staff_restore_id',$1,true)",[target]);
  await assert.rejects(()=>f.pg.query("update matmove_staff_access set is_active=true,removed_at=null,permissions='[\"staff\"]' where id=$1",[target]),/permission denied/);
  await assert.rejects(()=>f.rpc('legacy_add_admin',[target]),/removed|Restore staff/i);
  await f.pg.exec('reset role');await assert.rejects(()=>f.pg.query("insert into user_roles values($1,'admin')",[target]),/removed|Restore staff/i);
  await assert.rejects(()=>f.pg.query('delete from matmove_staff_access where id=$1',[target]),/revocation records/);
 }finally{await f.pg.close();}
});

test('Legacy save cannot reactivate removed staff; explicit owner restoration reuses the same Customer identity and narrow assignments',async()=>{
 const f=await database();try{
  await f.remove();const v=await f.expected();await f.session(owner);
  await assert.rejects(()=>f.rpc('matmove_staff_save',[owner,target,'staff@example.com','Staff Again',['staff'],'Governance',true,true]),/explicit owner restore/);
  await assert.rejects(()=>f.rpc('matmove_staff_restore',[owner,target,'2000-01-01','Staff Again',['games.entries'],'Games']),/record changed/);
  await assert.rejects(()=>f.rpc('matmove_staff_restore',[owner,target,v,'Staff Again',['unknown'],'Games']),/Invalid assignments/);
  await f.rpc('matmove_staff_restore',[owner,target,v,'Staff Again',['games.entries'],'Games']);
  await f.session(target,'authenticated');assert.equal((await f.pg.query("select matmove_admin_can('games.entries') as yes,matmove_admin_can('games.settings') as no")).rows[0].yes,true);
  assert.equal((await f.pg.query("select matmove_admin_can('games.settings') as no")).rows[0].no,false);
  assert.equal((await f.pg.query('select is_admin(auth.uid()) as legacy')).rows[0].legacy,false);
  await f.pg.exec('reset role');assert.equal((await f.pg.query('select count(*)::int n from auth.users')).rows[0].n,3);
  assert.equal((await f.pg.query('select role from profiles where id=$1',[target])).rows[0].role,'rider');
  assert.equal((await f.pg.query('select removed_at,is_active,requires_password_setup from matmove_staff_access where id=$1',[target])).rows[0].is_active,true);
 }finally{await f.pg.close();}
});

test('Migration reruns keep removed staff removed and a database failure rolls back the entire removal',async()=>{
 const f=await database();try{
  await f.remove();await f.pg.exec('reset role');await f.pg.exec(f.sql);
  assert.equal((await f.pg.query('select is_active from matmove_staff_access where id=$1',[target])).rows[0].is_active,false);
  const v=await f.expected();await f.session(owner);await f.rpc('matmove_staff_restore',[owner,target,v,'Staff Again',['financials'],'Finance']);
  await f.pg.exec('reset role');await f.pg.query('insert into admins(id,email) values($1,$2)',[target,'staff@example.com']);
  await f.pg.exec('create table admin_history(id uuid references admins(id) on delete cascade);');await f.pg.query('insert into admin_history values($1)',[target]);
  await assert.rejects(()=>f.remove(),/Membership history/);
  await f.pg.exec('reset role');assert.equal((await f.pg.query('select is_active from matmove_staff_access where id=$1',[target])).rows[0].is_active,true);
  assert.equal((await f.pg.query('select count(*)::int n from admins where id=$1',[target])).rows[0].n,1);
  assert.equal((await f.pg.query('select count(*)::int n from admin_history')).rows[0].n,1);
 }finally{await f.pg.close();}
});

function apiFixture({staff=record(),access={is_owner:true},rpcError=null}={}){
 const calls=[],emails=[];
 const client={from(){return{select(){return this;},eq(){return this;},order:async()=>({data:[record({id:owner,is_owner:true}),staff],error:null}),maybeSingle:async()=>({data:staff,error:null})};},auth:{admin:{inviteUserByEmail:async()=>{throw Error('Must reuse Auth identity');}},resetPasswordForEmail:async(email)=>{emails.push(email);return{error:null};}},rpc:async(name,args)=>{calls.push({name,args});if(name==='matmove_staff_find_user')return{data:target,error:null};if(rpcError)return{error:rpcError};if(name==='matmove_staff_remove')return{data:{removed:true,id:args.p_id},error:null};return{error:null};}};
 const handler=createHandler({authorize:async()=>({client,user:{id:owner},access}),env});
 const invoke=async(body,method='POST')=>{const r=response();await handler({method,headers:{},body},r);return r;};
 return{client,calls,emails,invoke};
}

test('API removal uses verified actor/version and sends no email; non-owner and invalid confirmations never mutate',async()=>{
 const f=apiFixture();const result=await f.invoke({action:'remove',id:target,p_actor:other,reason:'Assignment ended',expectedUpdatedAt:version});assert.equal(result.code,200);assert.equal(f.calls[0].args.p_actor,owner);assert.equal(f.calls[0].args.p_expected,version);assert.equal(f.emails.length,0);
 const denied=apiFixture({access:{is_owner:false,is_active:true,permissions:['staff']}});assert.equal((await denied.invoke({action:'remove',id:target})).code,403);assert.equal(denied.calls.length,0);
 for(const body of [{action:'remove',id:target},{action:'remove',id:owner,expectedUpdatedAt:version,reason:'Do not remove'},{action:'remove',id:target,expectedUpdatedAt:version,reason:'x'}])assert.equal((await f.invoke(body)).code,400);
});

test('API hides removed directory rows, blocks removed edits/resends, and requires explicit restoration',async()=>{
 const f=apiFixture({staff:record({removed_at:version,is_active:false})});const directory=await f.invoke(null,'GET');assert.equal(directory.body.staff.length,1);assert.equal(directory.body.removalReady,true);
 assert.equal((await f.invoke({action:'resend',id:target})).code,404);
 const invite={action:'invite',email:'staff@example.com',fullName:'Staff Again',permissions:['games.entries']};
 const first=await f.invoke(invite);assert.equal(first.code,409);assert.equal(first.body.code,'STAFF_REMOVED');assert.equal(f.emails.length,0);assert.equal(f.calls.filter(c=>c.name==='matmove_staff_restore').length,0);
 const restored=await f.invoke({...invite,restoreRemoved:true,restoreId:target,expectedUpdatedAt:first.body.restore.updated_at});assert.equal(restored.code,200);assert.equal(f.emails.length,1);assert.deepEqual(f.calls.find(c=>c.name==='matmove_staff_restore').args.p_permissions,['games.entries']);
});

test('An existing login token is denied after the authoritative staff record is removed; stale removal returns conflict',async()=>{
 const client={auth:{getUser:async()=>({data:{user:{id:target}}})},rpc:async()=>({data:record({is_active:false,permissions:[],removed_at:version})})};
 await assert.rejects(()=>requireAdmin({headers:{authorization:'Bearer original-token'}},['staff'],{client}),e=>e.status===403);
 const f=apiFixture({rpcError:{message:'CONFLICT: Staff assignments changed. Refresh first.'}});const r=await f.invoke({action:'remove',id:target,reason:'Assignment ended',expectedUpdatedAt:version});assert.equal(r.code,409);assert.equal(f.emails.length,0);
});

// Controlled hooks execute the real page's event handlers without sending mail
// or making any Supabase/Monime/network requests.
function nodes(n){if(!n||typeof n!=='object')return[];if(Array.isArray(n))return n.flatMap(nodes);return[n,...nodes(n.props?.children)];}
function text(n){if(n==null||typeof n==='boolean')return'';if(typeof n!=='object')return String(n);if(Array.isArray(n))return n.map(text).join('');return text(n.props?.children);}
async function withPage(fn,{access={id:owner,is_owner:true,is_active:true,permissions:['staff']},handler}={}){
 const dir=await mkdtemp(join(process.cwd(),'.staff-removal-ui-')),out=join(dir,'ui.mjs');
 const slots=[],effects=[],calls=[];let i=0,dirty=true,tree;
 const changed=(a,b)=>!a||a.length!==b?.length||a.some((v,j)=>!Object.is(v,b[j]));
 globalThis.__staffRemovalHooks={useState(initial){const n=i++;if(!(n in slots))slots[n]={value:typeof initial==='function'?initial():initial};return[slots[n].value,v=>{slots[n].value=typeof v==='function'?v(slots[n].value):v;dirty=true;}];},useRef(initial){const n=i++;if(!(n in slots))slots[n]={current:initial};return slots[n];},useCallback(fn,deps){const n=i++;if(!(n in slots)||changed(slots[n].deps,deps))slots[n]={fn,deps};return slots[n].fn;},useEffect(fn,deps){const n=i++,old=slots[n];if(!old||changed(old.deps,deps)){const r={deps,cleanup:old?.cleanup};slots[n]=r;effects.push(()=>{r.cleanup?.();r.cleanup=fn();});}}};
 globalThis.__staffRemovalAccess=access;
 globalThis.__staffRemovalFetch=async(url,options)=>{const body=options?.body?JSON.parse(options.body):null;calls.push({url,body});const data=await handler?.(body)||{staff:[record(),record({id:owner,email:'matmove.sl@gmail.com',is_owner:true})],removalReady:true};return{ok:!data.error,json:async()=>data};};
 try{
  await build({entryPoints:['src/pages/StaffGovernancePage.tsx'],tsconfig:'tsconfig.app.json',outfile:out,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react/*'],plugins:[{name:'staff-removal-mocks',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'mock'}));b.onResolve({filter:/^@\/lib\/(adminAccess|adminFetch)$/},a=>({path:a.path.split('/').at(-1),namespace:'mock'}));b.onResolve({filter:/^@\/components\/(AdminLayout|Modal)$/},a=>({path:a.path,namespace:'leaf'}));b.onLoad({filter:/.*/,namespace:'leaf'},()=>({contents:'export default function Shell(){return null;}'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({resolveDir:process.cwd(),contents:a.path==='react'?'export const {useState,useEffect,useRef,useCallback}=globalThis.__staffRemovalHooks;':a.path==='adminFetch'?'export const adminFetch=(...args)=>globalThis.__staffRemovalFetch(...args);':`export {SECTION_GROUPS,canAdminAccess as canAccess} from ${JSON.stringify(join(process.cwd(),'shared/admin-permissions.js'))};export const useAdminAccess=()=>globalThis.__staffRemovalAccess;`}));}}]});
  const module=await import(pathToFileURL(out));
  function render(){i=0;dirty=false;tree=module.StaffGovernancePage();while(effects.length)effects.shift()();}
  async function settle(){for(let n=0;n<12;n++){if(dirty)render();await new Promise(r=>setImmediate(r));if(n>5&&!dirty)break;}if(dirty)render();}
  const button=label=>{const node=nodes(tree).find(n=>n.type==='button'&&(text(n)===label||n.props['aria-label']===label));assert.ok(node,`Missing ${label}: ${text(tree)}`);return node;};
  const h={calls,button,settle,get text(){return text(tree);},get tree(){return tree;},async field(label,value){const parent=nodes(tree).find(n=>n.type==='label'&&text(n).startsWith(label));const input=nodes(parent).find(n=>n.type==='input');assert.ok(input);input.props.onChange({target:{value}});await settle();},async assignment(label){const parent=nodes(tree).find(n=>n.type==='label'&&text(n)===label);const input=nodes(parent).find(n=>n.type==='input');assert.ok(input);input.props.onChange({target:{checked:true}});await settle();},async submit(){const form=nodes(tree).find(n=>n.type==='form');assert.ok(form);form.props.onSubmit({preventDefault(){}});await settle();},async click(label){const node=button(label);assert.ok(!node.props.disabled);node.props.onClick();await settle();},async reason(value){const field=nodes(tree).find(n=>n.type==='textarea'&&n.props['aria-label']==='Reason for removal');assert.ok(field);field.props.onChange({target:{value}});await settle();}};
  await settle();await fn(h);
 }finally{for(const s of slots)s?.cleanup?.();await rm(dir,{recursive:true,force:true});delete globalThis.__staffRemovalAccess;delete globalThis.__staffRemovalHooks;delete globalThis.__staffRemovalFetch;}
}

test('Owner removal requires inline confirmation, exact loaded version and a reason; repeated clicks submit once',()=>{
 let release;return withPage(async h=>{
  await h.click('Remove staff staff@example.com');assert.match(h.text,/financial history are preserved/);assert.equal(h.calls.filter(c=>c.body).length,0);assert.equal(h.button('Confirm removal').props.disabled,true);
  await h.reason('Assignment ended');const confirm=h.button('Confirm removal');confirm.props.onClick();confirm.props.onClick();await h.settle();assert.equal(h.calls.filter(c=>c.body).length,1);
  assert.deepEqual(h.calls.find(c=>c.body).body,{action:'remove',id:target,expectedUpdatedAt:version,reason:'Assignment ended'});
  release({success:true,message:'Staff removed from Admin.'});await h.settle();assert.match(h.text,/Staff removed from Admin/);
 },{handler:body=>body?new Promise(r=>release=r):undefined});
});

test('Unassigned users make no directory request, and operational administrators cannot remove or invite',async()=>{
 await withPage(async h=>{assert.match(h.text,/Access denied/);assert.equal(h.calls.length,0);},{access:{id:other,is_owner:false,is_active:true,permissions:['games.entries']}});
 await withPage(async h=>{assert.doesNotMatch(h.text,/Remove staff|Invite staff|Confirm removal/);},{access:{id:other,is_owner:false,is_active:true,permissions:['staff']}});
});

test('Directory fetch failure shows Retry instead of claiming no staff, and unconfirmed removal keeps the review visible',async()=>{
 await withPage(async h=>{assert.match(h.text,/directory offline/);assert.doesNotMatch(h.text,/No staff members to display/);assert.ok(h.button('Retry staff directory'));},{handler:async()=>({error:'directory offline'})});
 await withPage(async h=>{await h.click('Remove staff staff@example.com');await h.reason('Assignment ended');await h.click('Confirm removal');assert.match(h.text,/record changed/);assert.ok(h.button('Keep staff member'));},{handler:async body=>body?{error:'Staff record changed. Refresh and review.'}:undefined});
});


test('Restoring a removed person requires the separate owner confirmation and sends the exact reviewed identity/version',()=>withPage(async h=>{
 await h.click('Invite staff');await h.field('Full name','Staff Again');await h.field('Work email','staff@example.com');await h.assignment('Entry payments');await h.submit();
 assert.ok(h.button('Confirm restore and send login email'));assert.equal(h.button('Authorize and send invitation').props.disabled,true);
 assert.equal(h.calls.filter(c=>c.body?.restoreRemoved).length,0);
 await h.click('Confirm restore and send login email');
 const body=h.calls.find(c=>c.body?.restoreRemoved).body;assert.equal(body.restoreId,target);assert.equal(body.expectedUpdatedAt,version);assert.deepEqual(body.permissions,['games.entries']);
},{handler:async body=>body?body.restoreRemoved?{success:true,message:'Admin access restored.'}:{error:'Previously removed. Review restoration.',code:'STAFF_REMOVED',restore:{id:target,email:'staff@example.com',updated_at:version}}:undefined}));
