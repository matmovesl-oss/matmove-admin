

import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const uid='2b08533c-30d5-4714-9f8d-a62f2de22a3e';
const access={id:uid,is_active:true,is_owner:true,permissions:[]};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function nodes(n){if(!n||typeof n!=='object')return[];if(Array.isArray(n))return n.flatMap(nodes);return[n,...nodes(n.props?.children)];}
function text(n){if(n==null||typeof n==='boolean')return'';if(typeof n!=='object')return String(n);if(Array.isArray(n))return n.map(text).join('');return text(n.props?.children);}
const apiEmpty=()=>({ok:true,body:{accounts:[],businessAccountIds:[],payouts:[],transactions:[]}});
const dbEmpty=()=>({data:[],count:0,error:null});
async function withPage(name,fn,{api=apiEmpty,db=dbEmpty,grants=access}={}){
 const dir=await mkdtemp(join(process.cwd(),'.admin-loading-')),out=join(dir,'ui.mjs');
 const slots=[],effects=[],calls=[];let i=0,dirty=true,tree,unmounted=false,writes=0;
 const changed=(a,b)=>!a||a.length!==b?.length||a.some((v,j)=>!Object.is(v,b[j]));
 globalThis.__loadingHooks={
  useState(initial){const n=i++;if(!(n in slots))slots[n]={value:typeof initial==='function'?initial():initial};return[slots[n].value,v=>{writes++;slots[n].value=typeof v==='function'?v(slots[n].value):v;dirty=true;}];},
  useRef(initial){const n=i++;if(!(n in slots))slots[n]={current:initial};return slots[n];},
  useCallback(fn,deps){const n=i++;if(!(n in slots)||changed(slots[n].deps,deps))slots[n]={fn,deps};return slots[n].fn;},
  useMemo(fn,deps){const n=i++;if(!(n in slots)||changed(slots[n].deps,deps))slots[n]={value:fn(),deps};return slots[n].value;},
  useEffect(fn,deps){const n=i++,old=slots[n];if(!old||changed(old.deps,deps)){const r={deps,cleanup:old?.cleanup};slots[n]=r;effects.push(()=>{r.cleanup?.();r.cleanup=fn();});}}
 };
 globalThis.__loadingAccess=grants;
 globalThis.__loadingFetch=async(url,options)=>{calls.push({kind:'api',url,options});const result=await api(url,options);return{ok:result.ok,json:async()=>result.body};};
 const originalFetch=globalThis.fetch;globalThis.fetch=globalThis.__loadingFetch;
 globalThis.__loadingDb={auth:{getSession:async()=>({data:{session:{user:{id:uid},access_token:'test-token'}},error:null})},rpc:async(name,args)=>{calls.push({kind:'rpc',name,args});return await db(name,args);},from(table){const chain={select:()=>chain,in:()=>chain,eq:()=>chain,order:()=>chain,limit:()=>chain,then:(yes,no)=>{calls.push({kind:'db',table});return Promise.resolve(db(table)).then(yes,no);}};return chain;}};
 try{
  await build({entryPoints:[`src/pages/${name}.tsx`],tsconfig:'tsconfig.app.json',outfile:out,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react/*','lucide-react'],plugins:[{name:'loading-mocks',setup(b){
   b.onResolve({filter:/^react$/},()=>({path:'hooks',namespace:'mock'}));
   b.onResolve({filter:/^react-router-dom$/},()=>({path:'router',namespace:'mock'}));
   b.onResolve({filter:/^(?:@|\.\.)\/lib\/supabase$/},()=>({path:'db',namespace:'mock'}));
   b.onResolve({filter:/^@\/lib\/(adminAccess|adminFetch)$/},a=>({path:a.path.split('/').at(-1),namespace:'mock'}));
   b.onResolve({filter:/^@\/components\//},a=>({path:a.path,namespace:'leaf'}));
   b.onLoad({filter:/.*/,namespace:'leaf'},()=>({contents:'export default function Leaf(){return null;}'}));
   b.onLoad({filter:/.*/,namespace:'mock'},a=>({resolveDir:process.cwd(),contents:({
    hooks:'export const {useState,useEffect,useRef,useCallback,useMemo}=globalThis.__loadingHooks;',
    router:'export function Link(){return null;}',db:'export const supabase=globalThis.__loadingDb;',
    adminFetch:'export const adminFetch=(...args)=>globalThis.__loadingFetch(...args);',
    adminAccess:`export {canAdminAccess as canAccess} from ${JSON.stringify(join(process.cwd(),'shared/admin-permissions.js'))};export const useAdminAccess=()=>globalThis.__loadingAccess;`
   })[a.path]}));
  }}]});
  const module=await import(pathToFileURL(out));const Component=module[name]||module.default;
  function render(){i=0;dirty=false;tree=Component({adminProfile:{id:uid}});while(effects.length)effects.shift()();}
  async function settle(){for(let n=0;n<12;n++){if(dirty&&!unmounted)render();await new Promise(r=>setImmediate(r));if(n>5&&!dirty)break;}if(dirty&&!unmounted)render();}
  const button=label=>{const node=nodes(tree).find(n=>n.type==='button'&&text(n).trim()===label);assert.ok(node,`Missing ${label}: ${text(tree)}`);return node;};
  const h={calls,button,settle,get text(){return text(tree);},get nodes(){return nodes(tree);},get writes(){return writes;},get cards(){return nodes(tree).filter(n=>n.props.label&&Object.hasOwn(n.props,'value')).map(n=>({label:n.props.label,value:n.props.value}));},setAccess(value){globalThis.__loadingAccess=value;dirty=true;},setApi:fn=>api=fn,setDb:fn=>db=fn,unmount(){unmounted=true;for(const s of slots)s?.cleanup?.();},async click(label){const node=button(label);assert.ok(!node.props.disabled);node.props.onClick();await settle();}};
  await settle();await fn(h);
 }finally{globalThis.fetch=originalFetch;if(!unmounted)for(const s of slots)s?.cleanup?.();await rm(dir,{recursive:true,force:true});for(const k of ['__loadingHooks','__loadingAccess','__loadingFetch','__loadingDb'])delete globalThis[k];}
}

import {createHandler as createBalances} from '../api/admin-wallet-balances.js';
const settings={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',MONIME_API_KEY:'fixture-provider',MONIME_SPACE_ID:'fixture-space',MONIME_ESCROW_ACCOUNT_ID:'fac-escrow',MONIME_PLATFORM_FEE_ACCOUNT_ID:'fac-escrow',MONIME_SPIN_ACCOUNT_ID:'fac-spin',MONIME_MAIN_ACCOUNT_ID:'fac-main',MONIME_REFERRAL_ACCOUNT_ID:'fac-referral'};
const providerAccount=(id,value=100,currency='SLE')=>({id,currency,balance:{available:{currency,value}}});
function res(){return{headers:{},code:200,setHeader(k,v){this.headers[k]=v;},status(v){this.code=v;return this;},json(v){this.body=v;return this;}};}
function fixture({grants=access,campaign={treasury_account:'fac-pinned'},campaignError=null,pages=[{success:true,result:[providerAccount('fac-customer',200),providerAccount('fac-referral',3960),providerAccount('fac-pinned',500)],pagination:{}}],providerError=false}={}){
 const calls=[];let page=0;
 const client={auth:{getUser:async()=>({data:{user:{id:uid}},error:null})},rpc:async(name,args)=>{calls.push({kind:'rpc',name,args});assert.equal(name,'matmove_admin_access');return{data:grants,error:null};},from(table){calls.push({kind:'db',table});assert.equal(table,'matmove_referral_campaign');const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:campaign,error:campaignError})};return q;}};
 const fetcher=async(url,options)=>{calls.push({kind:'provider',url:String(url),options});return{ok:!providerError,json:async()=>pages[page++]};};
 const handler=createBalances(()=>client,fetcher,settings);
 return{calls,async run(req={method:'GET',headers:{authorization:'Bearer fixture-token'}}){const r=res();await handler(req,r);return r;}};
}
test('financial balance response classifies current and pinned referral funds independently of any UI panel',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.code,200);assert.deepEqual(r.body.businessAccountIds,['fac-escrow','fac-spin','fac-main','fac-referral','fac-pinned']);assert.deepEqual(r.body.platform.referralAccountIds,['fac-referral','fac-pinned']);assert.equal(r.body.platform.referralAccountId,'fac-referral');assert.equal(r.body.platform.mainAccountId,'fac-main');assert.equal(r.headers['Cache-Control'],'no-store');assert.equal(r.headers.Vary,'Authorization');assert.ok(f.calls.filter(c=>c.kind==='rpc').every(c=>c.name==='matmove_admin_access'));assert.equal(f.calls.filter(c=>c.kind==='provider').length,1);const p=f.calls.find(c=>c.kind==='provider');assert.equal(p.options.method,undefined);assert.equal(p.options.headers.Authorization,'Bearer fixture-provider');assert.ok(p.url.startsWith('https://api.monime.io/v1/financial-accounts?'));
});
test('game-settings staff receive only Spin and cannot inspect referral source or other accounts',async()=>{
 const f=fixture({grants:{...access,is_owner:false,permissions:['games.settings']},pages:[{success:true,result:[providerAccount('fac-spin'),providerAccount('fac-referral')]}]}),r=await f.run();assert.equal(r.code,200);assert.deepEqual(r.body.accounts.map(a=>a.id),['fac-spin']);assert.deepEqual(r.body.businessAccountIds,[]);assert.deepEqual(r.body.platform.referralAccountIds,[]);assert.equal(r.body.platform.referralAccountId,null);assert.equal(r.body.platform.mainAccountId,null);assert.equal(f.calls.filter(c=>c.kind==='db').length,0);
});
test('unassigned or inactive staff cannot list accounts or read treasury configuration',async()=>{
 for(const grants of [{...access,is_owner:false,permissions:['dashboard']},{...access,is_active:false}]){const f=fixture({grants}),r=await f.run();assert.equal(r.code,403);assert.equal(f.calls.filter(c=>c.kind==='provider'||c.kind==='db').length,0);}
});
test('missing or malformed campaign classification fails before provider listing and cannot return totals',async()=>{
 for(const patch of [{campaign:null},{campaignError:{message:'private failure'}},{campaign:{treasury_account:'not-an-account'}}]){const f=fixture(patch),r=await f.run();assert.equal(r.code,503);assert.ok(!r.body.accounts);assert.ok(!JSON.stringify(r.body).includes('private failure'));assert.equal(f.calls.filter(c=>c.kind==='provider').length,0);}
});
test('an initially paused campaign with no saved source still excludes the configured referral account',async()=>{
 const f=fixture({campaign:{treasury_account:null}}),r=await f.run();assert.equal(r.code,200);assert.ok(r.body.businessAccountIds.includes('fac-referral'));assert.deepEqual(r.body.platform.referralAccountIds,['fac-referral']);
});
test('pagination preserves all confirmed accounts but duplicate accounts and repeated cursors reject the whole result',async()=>{
 const f=fixture({pages:[{success:true,result:[providerAccount('fac-customer')],pagination:{next:'page-two'}},{success:true,result:[providerAccount('fac-referral')]}]}),r=await f.run();assert.equal(r.code,200);assert.equal(r.body.accounts.length,2);assert.match(f.calls.filter(c=>c.kind==='provider')[1].url,/after=page-two/);
 for(const pages of [[{success:true,result:[providerAccount('fac-customer')],pagination:{next:'again'}},{success:true,result:[providerAccount('fac-customer')]}],[{success:true,result:[],pagination:{next:'again'}},{success:true,result:[],pagination:{next:'again'}}]]){const bad=await fixture({pages}).run();assert.equal(bad.code,502);assert.ok(!bad.body.accounts);}
});
test('provider failure and wrong HTTP methods never return partial customer totals or mutate funds',async()=>{
 const f=fixture({providerError:true}),r=await f.run();assert.equal(r.code,502);assert.ok(!r.body.accounts);const method=fixture();assert.equal((await method.run({method:'POST',headers:{}})).code,405);assert.equal(method.calls.length,0);assert.equal((await method.run({method:'GET',headers:{}})).code,401);
});
const customerRows=[{id:'customer-wallet',user_id:uid,currency:'SLE',balance:0,is_frozen:false,monime_account_id:'fac-customer'},{id:'referral-wallet',user_id:uid,currency:'SLE',balance:0,is_frozen:false,monime_account_id:'fac-referral'},{id:'pinned-wallet',user_id:uid,currency:'SLE',balance:0,is_frozen:false,monime_account_id:'fac-pinned'},{id:'main-wallet',user_id:uid,currency:'SLE',balance:0,is_frozen:false,monime_account_id:'fac-main'}];
const balanceBody=()=>({platform:{referralAccountId:'fac-referral',mainAccountId:'fac-main'},businessAccountIds:['fac-referral','fac-pinned','fac-main'],accounts:[providerAccount('fac-customer',200),providerAccount('fac-referral',10000),providerAccount('fac-pinned',5000),providerAccount('fac-main',9000)]});
test('customer gateway totals exclude referral, pinned and main treasury links without loading the referral panel',()=>withPage('FinancialsPage',async h=>{
 assert.match(h.text,/SLE 2.00/);for(const amount of ['SLE 242.00','SLE 100.00','SLE 50.00','SLE 90.00'])assert.ok(!h.text.includes(amount));
},{db:()=>({data:customerRows,error:null}),api:()=>({ok:true,body:balanceBody()})}));
test('missing or corrupt classification leaves customer balances unavailable rather than adding treasury funds',async()=>{
 for(const businessAccountIds of [undefined,'fac-referral',[42]]){await withPage('FinancialsPage',async h=>{
 assert.match(h.text,/classification was not confirmed/);assert.ok(!h.text.includes('SLE 242.00'));assert.ok(!h.text.includes('SLE 2.00'));
 },{db:()=>({data:customerRows,error:null}),api:()=>({ok:true,body:{...balanceBody(),businessAccountIds}})});}
});

const globalOwner=access;
const overviewBody=()=>({actor:uid,generatedAt:'2026-10-28T06:00:00Z',modules:[],recentBookings:[]});
async function page(fn,{access=globalOwner,fetcher}={}){
 const dir=await mkdtemp(join(process.cwd(),'.monitor-ui-')),out=join(dir,'ui.mjs');const slots=[],effects=[],calls=[],timers=[];
 let i=0,dirty=true,tree,unmounted=false;const oldWindow=globalThis.window;
 const changed=(a,b)=>!a||a.length!==b?.length||a.some((v,j)=>!Object.is(v,b[j]));
 globalThis.__monitor={access,fetch:async(url,options)=>{calls.push({url,options});const result=await (fetcher?fetcher(url,options):{ok:true,body:url.includes('view=report-overview')?overviewBody():{accounts:[],platform:{}}});return {ok:result.ok,json:async()=>result.body};},db:{auth:{getSession:async()=>({data:{session:{user:{id:uid}}}})}},hooks:{useState(initial){const n=i++;if(!(n in slots))slots[n]={value:typeof initial==='function'?initial():initial};return[slots[n].value,v=>{slots[n].value=typeof v==='function'?v(slots[n].value):v;dirty=true;}];},useRef(initial){const n=i++;if(!(n in slots))slots[n]={current:initial};return slots[n];},useEffect(fn,deps){const n=i++,old=slots[n];if(!old||changed(old.deps,deps)){const next={deps,cleanup:old?.cleanup};slots[n]=next;effects.push(()=>{next.cleanup?.();next.cleanup=fn();});}}}};
 globalThis.window={setInterval:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearInterval:id=>{if(timers[id-1])timers[id-1].cleared=true;}};
 try{
 await build({entryPoints:['src/pages/DashboardPage.tsx'],tsconfig:'tsconfig.app.json',outfile:out,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react/*','lucide-react'],plugins:[{name:'monitor-mocks',setup(b){
  b.onResolve({filter:/^react$/},()=>({path:'hooks',namespace:'mock'}));b.onResolve({filter:/^react-router-dom$/},()=>({path:'router',namespace:'mock'}));
  b.onResolve({filter:/^@\/lib\/(adminAccess|adminFetch|supabase)$/},a=>({path:a.path.split('/').at(-1),namespace:'mock'}));b.onResolve({filter:/^@\/components\/AdminLayout$/},()=>({path:'layout',namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},a=>({resolveDir:process.cwd(),contents:({hooks:'export const {useState,useEffect,useRef}=globalThis.__monitor.hooks;',router:'export const Link="a";',layout:'export default function Layout(){return null;}',adminAccess:`export {canAdminAccess as canAccess} from ${JSON.stringify(join(process.cwd(),'shared/admin-permissions.js'))};import {SECTION_GROUPS} from ${JSON.stringify(join(process.cwd(),'shared/admin-permissions.js'))};export const sections=SECTION_GROUPS.flatMap(g=>g.items);export const useAdminAccess=()=>globalThis.__monitor.access;`,adminFetch:'export const adminFetch=(...a)=>globalThis.__monitor.fetch(...a);',supabase:'export const supabase=globalThis.__monitor.db;'})[a.path]}));
 }}]});
 const component=(await import(pathToFileURL(out))).default;
 function render(){i=0;dirty=false;tree=component();while(effects.length)effects.shift()();}
 async function settle(){for(let n=0;n<12;n++){if(dirty&&!unmounted)render();await new Promise(r=>setImmediate(r));if(n>5&&!dirty)break;}if(dirty&&!unmounted)render();}
 const h={calls,timers,settle,get text(){return text(tree);},async click(label){const b=nodes(tree).find(n=>n.type==='button'&&text(n).trim()===label);assert.ok(b,`Missing ${label}: ${text(tree)}`);b.props.onClick();await settle();},async access(value){globalThis.__monitor.access=value;dirty=true;await settle();},unmount(){unmounted=true;for(const s of slots)s?.cleanup?.();}};
 await settle();await fn(h);h.unmount();
 }finally{if(!unmounted)for(const s of slots)s?.cleanup?.();if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;delete globalThis.__monitor;await rm(dir,{recursive:true,force:true});}
}

test('overview displays separate referral funds once and preserves currency',()=>page(async h=>{
 assert.match(h.text,/Referral rewards/);assert.match(h.text,/SLE 39.60/);assert.equal(h.text.match(/SLE 39\.60/g)?.length,1);assert.match(h.text,/USD 5.00/);
},{fetcher:async url=>({ok:true,body:url.includes('view=report-overview')?overviewBody():{platform:{referralAccountId:'fac-referral',referralAccountIds:['fac-referral'],mainAccountId:'fac-main'},accounts:[providerAccount('fac-referral',3960),providerAccount('fac-main',500,'USD')]}})}));
test('a configured referral missing from the provider response is unavailable, never a zero balance',()=>page(async h=>{
 assert.match(h.text,/Referral rewards/);assert.match(h.text,/Configured account was not returned/);assert.ok(!h.text.includes('SLE 0.00'));
},{fetcher:async url=>({ok:true,body:url.includes('view=report-overview')?overviewBody():{platform:{referralAccountId:'fac-referral'},accounts:[]}})}));
test('a pinned old referral account remains visible when deployment configuration differs',()=>page(async h=>{
 assert.match(h.text,/fac-referral/);assert.match(h.text,/fac-pinned/);assert.match(h.text,/SLE 39.60/);assert.match(h.text,/SLE 5.00/);
},{fetcher:async url=>({ok:true,body:url.includes('view=report-overview')?overviewBody():{platform:{referralAccountId:'fac-referral',referralAccountIds:['fac-referral','fac-pinned']},accounts:[providerAccount('fac-referral',3960),providerAccount('fac-pinned',500)]}})}));
test('dashboard rejects malformed referral source lists and does not fabricate a treasury',()=>page(async h=>{
 assert.match(h.text,/Referral account configuration was not confirmed/);assert.ok(!h.text.includes('SLE 39.60'));
},{fetcher:async url=>({ok:true,body:url.includes('view=report-overview')?overviewBody():{platform:{referralAccountId:'fac-referral',referralAccountIds:['bad']},accounts:[providerAccount('fac-referral',3960)]}})}));
