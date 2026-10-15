

import test from 'node:test';
import assert from 'node:assert/strict';
import {canAdminAccess,homeFor,validPermissions} from '../shared/admin-permissions.js';
import {requireAdmin} from '../server/admin-auth.js';
import {createHandler} from '../api/admin-staff.js';
const id='33333333-3333-4333-8333-333333333333',ownerId='44444444-4444-4444-8444-444444444444';
const row={id,is_active:true,is_owner:false,permissions:['games.entries']};
const response=()=>({code:null,body:null,setHeader(){},status(c){this.code=c;return this;},json(b){this.body=b;return this;}});
test('individual game permissions deny other tabs and choose assigned landing page',()=>{assert.equal(canAdminAccess(row,'games'),true);assert.equal(canAdminAccess(row,'games.entries'),true);assert.equal(canAdminAccess(row,'games.settings'),false);assert.equal(canAdminAccess(row,'games.winnings'),false);assert.equal(homeFor(row),'/games?tab=entries');assert.equal(canAdminAccess(null,'games'),false);assert.equal(canAdminAccess({...row,is_active:false,is_owner:true},'staff'),false);});
test('owner can access every section; browser cannot invent assignments',()=>{assert.equal(canAdminAccess({...row,is_owner:true},'games.settings'),true);assert.throws(()=>validPermissions(['super_admin']));assert.throws(()=>validPermissions(['games.secret']));assert.deepEqual(validPermissions(['games.entries','games.entries']),['games.entries']);});
test('API verifies token and reads authoritative permissions, ignoring client claims',async()=>{let read=0;const client={auth:{getUser:async()=>({data:{user:{id}},error:null})},rpc:async(name,args)=>{read++;assert.equal(name,'matmove_admin_access');assert.equal(args.p_id,id);return {data:row,error:null};}};await assert.rejects(requireAdmin({headers:{authorization:'Bearer token'},body:{is_owner:true}},['games.settings'],{client}),e=>e.status===403);assert.equal((await requireAdmin({headers:{authorization:'Bearer token'}},['games.entries'],{client})).user.id,id);assert.equal(read,2);await assert.rejects(requireAdmin({headers:{}},['games.entries'],{client}),e=>e.status===401);});
test('expired sessions and deactivated staff cannot reach APIs',async()=>{const client={auth:{getUser:async()=>({data:{user:null},error:new Error()})}};await assert.rejects(requireAdmin({headers:{authorization:'Bearer expired'}},['staff'],{client}),e=>e.status===401);const inactive={auth:{getUser:async()=>({data:{user:{id}}})},rpc:async()=>({data:{...row,is_active:false}})};await assert.rejects(requireAdmin({headers:{authorization:'Bearer token'}},['games.entries'],{client:inactive}),e=>e.status===403);});
test('directory-only staff cannot send invitation or grant privileges',async()=>{let sent=0;const handler=createHandler({authorize:async()=>({client:{auth:{admin:{inviteUserByEmail:async()=>{sent++;}}}},user:{id},access:{...row,permissions:['staff']}})});const res=response();await handler({method:'POST',headers:{},body:{action:'invite',email:'new@example.com',fullName:'New Staff',permissions:['games.settings']}},res);assert.equal(res.code,403);assert.equal(sent,0);});
function fixture(existing=false){let sent=0,saved=0,resets=0;const client={auth:{admin:{inviteUserByEmail:async(email,options)=>{assert.equal(options.redirectTo,'https://admin.example.com/accept-invite');assert.equal(options.data.role,undefined);sent++;return {data:{user:{id,email}}};}},resetPasswordForEmail:async()=>{resets++;return {error:null};}},rpc:async(name,args)=>{if(name==='matmove_staff_find_user')return {data:existing?id:null};if(name==='matmove_staff_save'){saved++;assert.equal(args.p_actor,ownerId);assert.deepEqual(args.p_permissions,['games.entries']);return {error:null};}throw new Error(name);},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null})})};return {client,get sent(){return sent;},get saved(){return saved;},get resets(){return resets;}};}
test('owner invitation sends email with configured callback and narrow assignments',async()=>{const f=fixture();const handler=createHandler({authorize:async()=>({client:f.client,user:{id:ownerId},access:{is_owner:true}}),env:{ADMIN_APP_URL:'https://admin.example.com'}});const res=response();await handler({method:'POST',headers:{},body:{action:'invite',email:'staff@example.com',fullName:'Staff Member',permissions:['games.entries']}},res);assert.equal(res.code,200);assert.equal(f.sent,1);assert.equal(f.saved,1);assert.equal(f.resets,0);});
test('existing identity gets login email without duplicate auth account',async()=>{const f=fixture(true);const handler=createHandler({authorize:async()=>({client:f.client,user:{id:ownerId},access:{is_owner:true}}),env:{ADMIN_APP_URL:'https://admin.example.com'}});const res=response();await handler({method:'POST',headers:{},body:{action:'invite',email:'staff@example.com',fullName:'Staff Member',permissions:['games.entries']}},res);assert.equal(res.code,200);assert.equal(f.sent,0);assert.equal(f.saved,1);assert.equal(f.resets,1);});
test('invalid assignments or missing callback fail before sending email',async()=>{for(const body of [{action:'invite',email:'staff@example.com',fullName:'Staff',permissions:['unknown']},{action:'invite',email:'staff@example.com',fullName:'Staff',permissions:['games.entries']}]){const f=fixture();const handler=createHandler({authorize:async()=>({client:f.client,user:{id:ownerId},access:{is_owner:true}}),env:{}});const res=response();await handler({method:'POST',headers:{},body},res);assert.ok([400,503].includes(res.code));assert.equal(f.sent,0);assert.equal(f.saved,0);}});
test('self-session endpoint accepts a narrow game assignment and never lists other staff',async()=>{
 let keys;const handler=createHandler({authorize:async(req,requested)=>{keys=requested;return {client:{from(){throw new Error('Must not read the staff directory');}},user:{id},access:row};}});
 const r=response();await handler({method:'GET',url:'/api/admin-staff?view=me',headers:{}},r);assert.equal(r.code,200);assert.equal(r.body.access.id,id);assert.deepEqual(r.body.access.permissions,['games.entries']);assert.equal(r.body.staff,undefined);assert.ok(keys.includes('games.entries'));
});
test('self-session endpoint preserves authentication failures and cannot be used for a POST',async()=>{
 const handler=createHandler({authorize:async()=>{throw Object.assign(new Error('Session expired'),{status:401});}});
 const r=response();await handler({method:'GET',query:{view:'me'},headers:{}},r);assert.equal(r.code,401);
 const post=response();await handler({method:'POST',query:{view:'me'},headers:{},body:{is_owner:true}},post);assert.equal(post.code,405);
});
test('browser RPC permission failure recovers only through verified server access; inactive and wrong identities stay denied',async()=>{
 const {build}=await import('esbuild');const {mkdtemp,rm}=await import('node:fs/promises');const {join}=await import('node:path');const {pathToFileURL}=await import('node:url');const dir=await mkdtemp(join(process.cwd(),'.staff-session-test-'));
 try{
 const file=join(dir,'session.mjs');await build({entryPoints:['src/lib/adminSession.ts'],bundle:true,platform:'node',format:'esm',outfile:file});const {loadAdminSession}=await import(pathToFileURL(file));
 const session={user:{id},access_token:'verified-token'};const failed={rpc:async()=>({data:null,error:{code:'42501',message:'permission denied'}})};
 const recovered=await loadAdminSession(failed,session,async(url,options)=>{assert.equal(url,'/api/admin-staff?view=me');assert.equal(options.headers.Authorization,'Bearer verified-token');return {ok:true,json:async()=>({access:row})};});assert.deepEqual(recovered,row);
 assert.equal(await loadAdminSession({rpc:async()=>({data:null,error:null})},session,async()=>{throw new Error('An unassigned user must not use a fallback role');}),null);
 await assert.rejects(()=>loadAdminSession(failed,session,async()=>({ok:true,json:async()=>({access:{...row,id:ownerId,is_owner:true}})})),/signed-in/);
 await assert.rejects(()=>loadAdminSession(failed,session,async()=>({ok:false,json:async()=>({error:'Access denied'})})),/Access denied/);
 const inactive=await loadAdminSession({rpc:async()=>({data:{...row,is_active:false},error:null})},session);assert.equal(canAdminAccess(inactive,'games.entries'),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});


test('full operational administrator can open every section but cannot invite, update, or resend staff access',async()=>{
 const {PERMISSION_KEYS}=await import('../shared/admin-permissions.js');
 const administrator={...row,permissions:[...PERMISSION_KEYS]};
 for(const key of PERMISSION_KEYS)assert.equal(canAdminAccess(administrator,key),true);
 for(const action of ['invite','update','resend']){
  let touched=false;
  const handler=createHandler({authorize:async()=>({client:new Proxy({},{get(){touched=true;throw new Error('Must reject before touching staff data');}}),user:{id},access:administrator})});
  const res=response();await handler({method:'POST',headers:{},body:{action,is_owner:true,role:'super_admin'}},res);
  assert.equal(res.code,403);assert.equal(touched,false);
 }
});
test('legacy role label cannot create owner privileges without the verified owner flag',()=>{
 assert.equal(canAdminAccess({...row,role:'super_admin'},'staff'),false);
 assert.equal(canAdminAccess({...row,role:'super_admin'},'games.settings'),false);
});
