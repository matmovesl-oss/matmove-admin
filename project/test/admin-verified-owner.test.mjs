import test from 'node:test';import assert from 'node:assert/strict';import{build}from'esbuild';import{mkdtemp,readFile,rm}from'node:fs/promises';import{join}from'node:path';import{pathToFileURL}from'node:url';
const text=n=>n==null||typeof n==='boolean'?'':typeof n!=='object'?String(n):Array.isArray(n)?n.map(text).join(''):text(n.props?.children);
test('sidebar owner access comes from current verified grants, never the owner email address',async()=>{
 const dir=await mkdtemp(join(process.cwd(),'.owner-ui-'));globalThis.__ownerAccess=null;
 try{
  await build({entryPoints:['src/components/AdminLayout.tsx'],tsconfig:'tsconfig.app.json',outfile:join(dir,'ui.mjs'),bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react/*','lucide-react'],plugins:[{name:'owner-fixture',setup(b){b.onResolve({filter:/^react$/},()=>({path:'hooks',namespace:'mock'}));b.onResolve({filter:/^react-router-dom$/},()=>({path:'router',namespace:'mock'}));b.onResolve({filter:/^@\/lib\/adminAccess$/},()=>({path:'access',namespace:'mock'}));b.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'db',namespace:'mock'}));b.onResolve({filter:/AdminAssistance$/},()=>({path:'assistance',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({resolveDir:process.cwd(),contents:{hooks:'export const useState=v=>[v,()=>{}];export const useEffect=()=>{};',router:"export const useLocation=()=>({pathname:'/dashboard',search:''});export const Link=()=>null;",access:`import {canAdminAccess,SECTION_GROUPS} from ${JSON.stringify(join(process.cwd(),'shared/admin-permissions.js'))};export const useAdminAccess=()=>globalThis.__ownerAccess;export const canAccess=canAdminAccess;export const sections=SECTION_GROUPS.flatMap(g=>g.items);`,db:"export const supabase={auth:{getUser:()=>{throw Error('Email must not authorize ownership')},signOut:async()=>({})}};",assistance:'export default function Assistance(){return null;}'}[a.path]}));}}]});
  const module=await import(pathToFileURL(join(dir,'ui.mjs')));const render=access=>{globalThis.__ownerAccess=access;return text(module.default({children:null,title:'Test'}));};
  const base={id:'11111111-1111-4111-8111-111111111111',is_active:true,is_owner:false,permissions:[],email:'matmove.sl@gmail.com'};
  assert.doesNotMatch(render(base),/MAIN SUPER ADMIN|Administrative Payroll|Customer Refunds|Civitas Administrative/);
  assert.match(render({...base,email:'other@example.invalid',is_owner:true}),/MAIN SUPER ADMIN/);
  assert.doesNotMatch(render({...base,is_owner:true,is_active:false}),/MAIN SUPER ADMIN|Administrative Payroll/);
  assert.match(render({...base,permissions:['special']}),/Administrative Payroll/);
  assert.doesNotMatch(render({...base,permissions:['financials']}),/Administrative Payroll/);
  const source=await readFile('src/App.tsx','utf8');assert.doesNotMatch(source,/SUPER_ADMIN_EMAIL|isSuperAdmin|is_owner:\s*true/);
  for(const route of ['travel','events','civitas','payroll','special','notifications','reports'])assert.ok(source.includes(`path="/${route}"`));
 }finally{await rm(dir,{recursive:true,force:true});delete globalThis.__ownerAccess;}
});
