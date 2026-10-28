
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const access={id:user,is_active:true,is_owner:true,permissions:[],requires_password_setup:false};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const text=n=>n==null||typeof n==='boolean'?'':typeof n!=='object'?String(n):Array.isArray(n)?n.map(text).join(''):text(n.props?.children);
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
async function harness(file,fn,options={}){
 const original={window:globalThis.window,sessionStorage:globalThis.sessionStorage},store=new Map(),calls={reset:[],login:[],update:[],rpc:[],complete:0,assign:[]};let index=0,dirty=true,tree;const slots=[],effects=[];
 const location={origin:'https://matmove-admin.vercel.app',pathname:options.path||'/',search:options.search||'',hash:options.hash||'',assign:p=>calls.assign.push(p)};
 globalThis.window={location,history:{replaceState(){}}};globalThis.sessionStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 if(options.marker)store.set('matmove_admin_recovery',JSON.stringify(options.marker));
 let session=options.session===null?null:{user:{id:user},access_token:'test-token'},listener;
 const state={access,db:{auth:{
  getSession:async()=>options.getSession?options.getSession():({data:{session},error:null}),
  getUser:async()=>({data:{user:session?.user},error:null}),
  resetPasswordForEmail:async(...a)=>{calls.reset.push(a);return options.reset?options.reset(...a):{error:null};},
  signInWithPassword:async(...a)=>{calls.login.push(a);return {error:null};},
  updateUser:async(...a)=>{calls.update.push(a);return options.update?options.update(...a):{error:null};},
  signOut:async()=>{session=null;listener?.('SIGNED_OUT',null);return {error:null};},
  onAuthStateChange(cb){listener=cb;return {data:{subscription:{unsubscribe(){listener=null;}}}};}
 },rpc:async(...a)=>{calls.rpc.push(a);return options.rpc?options.rpc(...a):{error:null};}},
 load:async()=>options.load?options.load():state.access,
 hooks:{useState(initial){const i=index++;if(!(i in slots))slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;dirty=true;}];},useRef(initial){const i=index++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(fn,deps){const i=index++,old=slots[i];if(!old||old.deps?.length!==deps?.length||old.deps?.some((v,j)=>!Object.is(v,deps[j]))){slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}}};
 globalThis.__passwordTest=state;
 const dir=await mkdtemp(join(process.cwd(),'.reset-ui-')),out=join(dir,'module.mjs');
 try{
  await build({entryPoints:[file],tsconfig:'tsconfig.app.json',outfile:out,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react/*','lucide-react'],plugins:[{name:'password-mocks',setup(b){
   b.onResolve({filter:/^react$/},()=>({path:'hooks',namespace:'mock'}));
   b.onResolve({filter:/^react-router-dom$/},()=>({path:'router',namespace:'mock'}));
   b.onResolve({filter:/(?:^@\/lib\/|\/lib\/)(supabase|adminSession|adminAccess)$/},a=>({path:a.path.split('/').at(-1),namespace:'mock'}));
   b.onResolve({filter:/\/(?:pages|components)\//},a=>{if(!a.importer)return;return {path:a.path.split('/').at(-1),namespace:'component'};});
   b.onLoad({filter:/.*/,namespace:'component'},a=>{const name=a.path.replace(/\.tsx$/,'');return {contents:`export function ${name}(){return null;} export default ${name};`};});
   b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:({hooks:'export const {useState,useEffect,useRef}=globalThis.__passwordTest.hooks;',router:'export const BrowserRouter="router",Routes="routes",Route="route",Navigate="navigate";export const useLocation=()=>window.location;',supabase:'export const supabase=globalThis.__passwordTest.db;',adminSession:'export const loadAdminSession=(...a)=>globalThis.__passwordTest.load(...a);',adminAccess:'export const AdminAccessContext={Provider:"provider"};export const canAccess=()=>true,homeFor=()=>"/dashboard",sections=[];'})[a.path]}));
  }}]});const mod=await import(pathToFileURL(out));
  const props={onComplete:()=>{calls.complete++;if(options.complete)return options.complete();},userId:user,mode:'recovery',...options.props};
  const render=()=>{index=0;dirty=false;tree=mod.default(props);while(effects.length)effects.shift()();};
  const settle=async()=>{for(let n=0;n<12;n++){if(dirty)render();await new Promise(r=>setImmediate(r));}if(dirty)render();};
  const h={mod,calls,store,state,settle,get tree(){return tree;},get text(){return text(tree);},input(type,value){const n=nodes(tree).filter(n=>n.type==='input'&&n.props.type===type);assert.ok(n.length);n[0].props.onChange({target:{value}});},passwords(a,b=a){const n=nodes(tree).filter(n=>n.type==='input'&&n.props.type==='password');assert.equal(n.length,2);n[0].props.onChange({target:{value:a}});n[1].props.onChange({target:{value:b}});},submit(){return nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});},click(label){const n=nodes(tree).find(n=>n.type==='button'&&text(n)===label);assert.ok(n,`Missing ${label}: ${text(tree)}`);return n.props.onClick();},event(event,next){session=next;listener?.(event,next);},unmount(){slots.forEach(s=>s?.cleanup?.());},setSession(v){session=v;}};
  try{await settle();await fn(h);}finally{h.unmount();}
 }finally{await rm(dir,{recursive:true,force:true});delete globalThis.__passwordTest;for(const [k,v] of Object.entries(original))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
}
test('Forgot password requests one same-origin reset link with a generic response, never a staff lookup',()=>harness('src/pages/LoginPage.tsx',async h=>{
 await h.click('Forgot password?');await h.settle();h.input('email',' OWNER@EXAMPLE.COM ');await h.settle();const first=h.submit();h.submit();await first;await h.settle();assert.equal(h.calls.reset.length,1);assert.deepEqual(h.calls.reset[0],['owner@example.com',{redirectTo:'https://matmove-admin.vercel.app/reset-password'}]);assert.match(h.text,/If this email has an account/);assert.equal(h.calls.rpc.length,0);assert.equal(h.calls.update.length,0);assert.equal(h.calls.login.length,0);
}));
test('Reset request failures remain retryable and login mode keeps email/password sign-in',()=>harness('src/pages/LoginPage.tsx',async h=>{
 await h.click('Forgot password?');await h.settle();h.input('email','staff@example.com');await h.settle();await h.submit();await h.settle();assert.match(h.text,/could not be confirmed/);await h.click('Back to sign in');await h.settle();h.input('password','old-password');await h.settle();await h.submit();assert.equal(h.calls.login.length,1);assert.equal(h.calls.login[0][0].password,'old-password');
},{reset:async()=>({error:{message:'Sensitive provider details'}})}));
test('Mismatch and short passwords stop before Auth writes; valid recovery updates once without changing staff grants',()=>harness('src/pages/StaffPasswordPage.tsx',async h=>{
 h.passwords('short');await h.settle();await h.submit();await h.settle();assert.equal(h.calls.update.length,0);h.passwords('a-long-new-password','different-password');await h.settle();await h.submit();assert.equal(h.calls.update.length,0);
 h.passwords('a-long-new-password');await h.settle();const work=h.submit();h.submit();await work;await h.settle();assert.equal(h.calls.update.length,1);assert.equal(h.calls.complete,1);assert.equal(h.calls.rpc.length,0);assert.doesNotMatch(h.text,/a-long-new-password/);
}));
test('Removed staff and changed sessions cannot submit a new password',async()=>{
 for(const kind of ['removed','identity'])await harness('src/pages/StaffPasswordPage.tsx',async h=>{
  if(kind==='removed')h.state.access={...access,is_active:false};else h.setSession({user:{id:other},access_token:'other-token'});h.passwords('a-long-new-password');await h.settle();await h.submit();await h.settle();assert.equal(h.calls.update.length,0);assert.equal(h.calls.complete,0);assert.match(h.text,/required|changed/);
 });
});
test('A failed post-save permission check preserves saved state and Continue never changes the password twice',async()=>{
 let reads=0;await harness('src/pages/StaffPasswordPage.tsx',async h=>{
  h.passwords('a-long-new-password');await h.settle();await h.submit();await h.settle();assert.equal(h.calls.update.length,1);assert.equal(h.calls.complete,0);assert.match(h.text,/password was saved/i);await h.submit();await h.settle();assert.equal(h.calls.update.length,1);assert.equal(h.calls.complete,1);
 },{load:async()=>{if(++reads===2)throw Error('Permissions unavailable.');return access;}});
});
test('Invitation setup still finishes only the current active staff record',()=>harness('src/pages/StaffPasswordPage.tsx',async h=>{
 h.state.access={...access,requires_password_setup:true};h.passwords('a-long-new-password');await h.settle();await h.submit();await h.settle();assert.deepEqual(h.calls.rpc,[['matmove_staff_finish_setup']]);assert.equal(h.calls.complete,1);
},{props:{mode:'invite'}}));
test('A late verification result after leaving the page cannot update any password',async()=>{
 const wait=deferred();await harness('src/pages/StaffPasswordPage.tsx',async h=>{
  h.passwords('a-long-new-password');await h.settle();const work=h.submit();h.unmount();wait.resolve({data:{session:{user:{id:user},access_token:'token'}},error:null});await work;assert.equal(h.calls.update.length,0);assert.equal(h.calls.complete,0);
 },{getSession:()=>wait.promise});
});
test('Expired links stay outside Console even with an old signed-in session; markers bind identity and expiry',()=>harness('src/App.tsx',async h=>{
 const login=nodes(h.tree).find(n=>n.type?.name==='LoginPage');assert.ok(login);assert.match(login.props.recoveryError,/expired/);assert.equal(nodes(h.tree).some(n=>n.type?.name==='Console'),false);
 assert.equal(h.mod.validRecoveryMarker(JSON.stringify({id:user,until:2000}),user,1000),true);assert.equal(h.mod.validRecoveryMarker(JSON.stringify({id:other,until:2000}),user,1000),false);assert.equal(h.mod.validRecoveryMarker(JSON.stringify({id:user,until:999}),user,1000),false);assert.equal(h.mod.validRecoveryMarker('{invalid',user),false);
},{path:'/reset-password',hash:'#error=access_denied&error_code=otp_expired'}));
test('PASSWORD_RECOVERY reaches the gated Console, remembers only identity/expiry, and sign-out clears it',()=>harness('src/App.tsx',async h=>{
 assert.ok(nodes(h.tree).some(n=>n.type?.name==='LoginPage'));h.event('PASSWORD_RECOVERY',{user:{id:user},access_token:'secret-not-to-store'});await h.settle();const console=nodes(h.tree).find(n=>n.type?.name==='Console');assert.equal(console.props.recovery,true);assert.equal(console.props.session.user.id,user);const marker=h.store.get('matmove_admin_recovery');assert.doesNotMatch(marker,/secret-not-to-store/);h.event('SIGNED_OUT',null);await h.settle();assert.equal(h.store.has('matmove_admin_recovery'),false);
},{path:'/reset-password',session:null}));
test('Recovery reload resumes only a matching unexpired marker; a bare route never authorizes a reset form',async()=>{
 await harness('src/App.tsx',async h=>{assert.equal(nodes(h.tree).find(n=>n.type?.name==='Console').props.recovery,true);},{path:'/reset-password',marker:{id:user,until:Date.now()+1800000}});
 await harness('src/App.tsx',async h=>{assert.ok(nodes(h.tree).some(n=>n.type?.name==='LoginPage'));},{path:'/reset-password'});
});
test('Auth event cannot be overwritten by an older getSession read',async()=>{
 const wait=deferred();await harness('src/App.tsx',async h=>{h.event('PASSWORD_RECOVERY',{user:{id:user},access_token:'current'});wait.resolve({data:{session:null},error:null});await h.settle();assert.equal(nodes(h.tree).find(n=>n.type?.name==='Console').props.recovery,true);},{path:'/reset-password',getSession:()=>wait.promise});
});
test('Logo is present on entrance, reset and sidebar; existing notification navigation and permission gates remain',async()=>{
 for(const file of ['src/pages/LoginPage.tsx','src/pages/StaffPasswordPage.tsx','src/components/AdminLayout.tsx'])assert.match(await readFile(file,'utf8'),/src="\/logo.png"/);
 const layout=await readFile('src/components/AdminLayout.tsx','utf8');assert.match(layout,/Customer Messages/);assert.match(layout,/canAccess\(access/);const app=await readFile('src/App.tsx','utf8');assert.match(app,/<Gate access=\{access\} section="notifications"/);assert.match(app,/if\(!row\?\.is_active\)throw/);
});
