
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../api/admin-staff.js';
import {PERMISSION_KEYS,validPermissions,canAdminAccess,homeFor,SECTION_GROUPS} from '../shared/admin-permissions.js';
const owner='2b08533c-30d5-4714-9f8d-a62f2de22a3e',target='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444';
async function database(){
 const pg=new PGlite({postgresqlconf:['shared_buffers=16MB','max_connections=10','work_mem=1MB','maintenance_work_mem=8MB']});
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

test('Notifications is an explicit independent staff assignment and a valid restricted landing page',()=>{
 assert.equal(PERMISSION_KEYS.length,17);assert.deepEqual(validPermissions(['notifications','notifications']),['notifications']);assert.throws(()=>validPermissions(['notifications','owner']));
 const a={id:target,is_active:true,is_owner:false,permissions:['notifications']};assert.equal(canAdminAccess(a,'notifications'),true);for(const p of ['customers','kyc','financials','transactions','payouts','staff','dispatch'])assert.equal(canAdminAccess(a,p),false);assert.equal(homeFor(a),'/notifications');assert.equal(canAdminAccess({...a,is_active:false},'notifications'),false);assert.equal(canAdminAccess({...a,permissions:['customers']},'notifications'),false);assert.ok(SECTION_GROUPS.some(g=>g.items.some(i=>i[0]==='notifications')));
});
test('additive SQL accepts notification grants without reviving removed staff or expanding existing access',async t=>{
 const f=await database();try{
  // Preflight presence stub only; sender authentication is covered by notifications.test.js.
  await f.pg.exec('create function public.matmove_notification_sender() returns uuid language sql as $$select auth.uid()$$;');
  const sql=await readFile('docs/NOTIFICATION_PERMISSIONS_SETUP.sql','utf8');
  const state=async()=>{await f.pg.exec('reset role');return(await f.pg.query('select id,permissions,is_active,is_owner,removed_at from matmove_staff_access order by id')).rows;};
  const before=await state();await f.pg.exec(sql);await f.pg.exec(sql);assert.deepEqual(await state(),before);
  const save=async(permissions,actor=owner)=>{await f.session(actor);return f.rpc('matmove_staff_save',[actor,target,'staff@example.com','Notification Staff',permissions,'Communications',true,false]);};
  await t.test('owner grants only notifications and the database denies unrelated sections',async()=>{
   await save(['notifications']);await f.session(target,'authenticated');assert.equal((await f.pg.query("select matmove_admin_can('notifications') yes,matmove_admin_can('customers') no")).rows[0].yes,true);assert.equal((await f.pg.query("select matmove_admin_can('customers') no")).rows[0].no,false);
  });
  await t.test('browser cannot forge the owner actor and non-owner service requests cannot assign privileges',async()=>{
   await f.session(target,'authenticated');await assert.rejects(()=>f.rpc('matmove_staff_save',[owner,target,'staff@example.com','Forged',['notifications'],'Communications',true,false]),/permission denied/);
   await assert.rejects(()=>save(['staff'],other),/Only the active owner/);await assert.rejects(()=>save(['notifications','super_admin']),/Invalid assignments/);await assert.rejects(()=>save(['notifications','notifications']),/Invalid assignments/);
  });
  await t.test('all seventeen checked assignments are accepted, while malformed values fail atomically',async()=>{
   await save(PERMISSION_KEYS);await f.pg.exec('reset role');assert.equal((await f.pg.query('select jsonb_array_length(permissions) n from matmove_staff_access where id=$1',[target])).rows[0].n,17);
   await assert.rejects(()=>save({permissions:['notifications']}),/Invalid assignments/);await assert.rejects(()=>save(null),/Invalid assignments/);await assert.rejects(()=>save([]),/Invalid assignments/);
  });
  await t.test('removal immediately revokes notifications; legacy save and stale restore stay blocked',async()=>{
   await save(['notifications']);await f.remove();const v=await f.expected();await assert.rejects(()=>save(['notifications']),/explicit owner restore/);
   await f.session(target,'authenticated');assert.equal((await f.pg.query("select matmove_admin_can('notifications') yes")).rows[0].yes,false);
   await f.session(owner);await assert.rejects(()=>f.rpc('matmove_staff_restore',[owner,target,'2000-01-01','Restored',['notifications'],'Communications']),/record changed/);
   await f.rpc('matmove_staff_restore',[owner,target,v,'Restored',['notifications'],'Communications']);
   await f.session(target,'authenticated');assert.equal((await f.pg.query("select matmove_admin_can('notifications') yes,matmove_admin_can('financials') no")).rows[0].yes,true);assert.equal((await f.pg.query("select matmove_admin_can('financials') no")).rows[0].no,false);
  });
  await t.test('rerunning the grant migration preserves explicit revocation and customer balances',async()=>{
   await save(['kyc']);await f.pg.exec('reset role');await f.pg.exec(sql);await f.session(target,'authenticated');assert.equal((await f.pg.query("select matmove_admin_can('notifications') yes")).rows[0].yes,false);
   await f.pg.exec('reset role');assert.equal((await f.pg.query('select balance::text amount from wallets where user_id=$1',[target])).rows[0].amount,'123.45');assert.equal((await f.pg.query('select count(*)::int n from payment_transactions')).rows[0].n,1);
  });
 }finally{await f.pg.close();}
});
test('existing staff API saves the narrow notification grant and never trusts body-supplied actor privileges',async()=>{
 const calls=[];const client={from(){return{select(){return{eq(){return{maybeSingle:async()=>({data:{id:target,email:'staff@example.com',is_owner:false,is_active:true},error:null})};}};}};},rpc:async(name,args)=>{calls.push({name,args});return{data:null,error:null};}};
 const handle=createHandler({authorize:async()=>({client,user:{id:owner},access:{is_owner:true}})});
 const res={setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
 await handle({method:'POST',headers:{},url:'/api/admin-staff',query:{},body:{action:'update',id:target,actor:other,isOwner:false,fullName:'Notification Staff',permissions:['notifications'],isActive:true}},res);
 assert.equal(res.code,200);assert.equal(calls[0].name,'matmove_staff_save');assert.equal(calls[0].args.p_actor,owner);assert.deepEqual(calls[0].args.p_permissions,['notifications']);assert.equal(calls[0].args.p_department,'Communications');
});
test('Staff checkbox groups, verified self-session and navigation all use the same assignment registry',async()=>{
 const ui=await readFile('src/pages/StaffGovernancePage.tsx','utf8'),api=await readFile('api/admin-staff.js','utf8'),app=await readFile('src/App.tsx','utf8'),layout=await readFile('src/components/AdminLayout.tsx','utf8');
 assert.match(ui,/SECTION_GROUPS.map/);assert.match(ui,/toggle\(\[key\],e.target.checked\)/);assert.match(api,/self\?PERMISSION_KEYS:\['staff'\]/);assert.match(app,/path="\/notifications" element=\{<Gate access=\{access\} section="notifications"/);assert.match(layout,/key:'notifications',name:'Customer Messages',path:'\/notifications'/);
});
