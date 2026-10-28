

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

const pages=[
 ['TransactionsPage','Retry transactions','No transactions found matching your search criteria.'],
 ['PayoutsPage','Retry payouts','No payouts found.'],
 ['PricingPage','Retry pricing','No pricing models have been configured.'],
 ['LogsPage','Retry audit logs','No audit events recorded yet.'],
];
for(const[name,retry,empty]of pages){
 test(`${name} keeps pending data in Loading and never shows a premature empty message or zero statistic`,async()=>{
  const waiting=deferred();await withPage(name,async h=>{
   assert.match(h.text,/Loading|Fetching/);assert.ok(!h.text.includes(empty));assert.ok(h.cards.every(c=>c.value!=='0'));
   waiting.resolve(name==='PricingPage'||name==='LogsPage'?dbEmpty():apiEmpty());await h.settle();assert.ok(h.text.includes(empty));
  },name==='PricingPage'||name==='LogsPage'?{db:()=>waiting.promise}:{api:()=>waiting.promise});
 });
 test(`${name} shows a recoverable error instead of empty or successful zero data`,()=>withPage(name,async h=>{
  assert.match(h.text,/offline/);assert.ok(!h.text.includes(empty));assert.ok(h.cards.every(c=>c.value!=='0'));
  h.setApi(apiEmpty);h.setDb(dbEmpty);await h.click(retry);assert.ok(h.text.includes(empty));
 },name==='PricingPage'||name==='LogsPage'?{db:()=>({data:null,error:{message:'offline'}})}:{api:()=>({ok:false,body:{error:'offline'}})}));
}

test('A delayed old ledger response cannot replace a newer result, and an unmounted request cannot publish data',async()=>{
 const old=deferred();let count=0;await withPage('TransactionsPage',async h=>{
  h.button('Refresh Ledger').props.onClick();await h.settle();assert.match(h.text,/new-transaction/);
  old.resolve({ok:true,body:{transactions:[{id:'old-transaction',type:'debit',amount:{currency:'SLE',value:100}}]}});await h.settle();assert.doesNotMatch(h.text,/old-transaction/);
  const leaving=deferred();h.setApi(()=>leaving.promise);h.button('Refresh Ledger').props.onClick();await h.settle();h.unmount();const writes=h.writes;
  leaving.resolve(apiEmpty());await h.settle();assert.equal(h.writes,writes);
 },{api:()=>++count===1?old.promise:{ok:true,body:{transactions:[{id:'new-transaction',type:'credit',amount:{currency:'USD',value:100}}]}}});
});

test('Ledger rows retain supplied currencies and unknown direction/amount/time instead of fabricating a debit',()=>withPage('TransactionsPage',async h=>{
 assert.match(h.text,/\+ USD 1.00/);assert.match(h.text,/Direction not supplied/);assert.match(h.text,/Amount not supplied/);assert.match(h.text,/Time not supplied/);
 assert.ok(h.calls.some(c=>c.url==='/api/get-all-transactions'));
},{api:()=>({ok:true,body:{transactions:[{id:'usd-credit',type:'CREDIT',amount:{currency:'USD',value:100}},{id:'missing-fields'}]}})}));

test('Payout amounts preserve currencies and missing SLE amounts prevent a guessed SLE total',()=>withPage('PayoutsPage',async h=>{
 assert.match(h.text,/USD 100.00/);assert.match(h.text,/Amount not supplied/);assert.equal(h.cards.find(c=>c.label==='Pending SLE').value,'Check payout amounts');
},{api:()=>({ok:true,body:{payouts:[{id:'usd',status:'pending',amount:{currency:'USD',value:10000}},{id:'unknown',status:'pending',amount:{currency:'SLE'}}]}})}));

test('Audit details supplied as JSON render as text rather than an invalid React child',()=>withPage('LogsPage',async h=>{
 assert.match(h.text,/"reason":"Staff removed"/);
},{db:()=>({data:[{id:'audit-one',action:'REMOVE_STAFF',details:{reason:'Staff removed'},created_at:'2026-10-24T10:00:00Z'}],error:null})}));

for(const[name,retry,empty] of [
 ['FinancialsPage','Retry financials','No customer wallets found.'],
 ['KycPage','Retry KYC submissions','No KYC submissions found.'],
]){
 test(`${name} shows Loading until its read completes, then permits a genuine empty result`,async()=>{
  const pending=deferred();await withPage(name,async h=>{
   assert.match(h.text,/Loading|Refreshing/);assert.ok(!h.text.includes(empty));
   pending.resolve(dbEmpty());await h.settle();assert.ok(h.text.includes(empty));
  },{db:()=>pending.promise});
 });
 test(`${name} distinguishes read failure from no records and recovers through Retry`,()=>withPage(name,async h=>{
  assert.match(h.text,/offline/);assert.ok(!h.text.includes(empty));
  h.setDb(dbEmpty);await h.click(retry);assert.ok(h.text.includes(empty));
 },{db:()=>({data:null,error:{message:'offline'}})}));
}
test('Audit rejects Supabase error responses, never claims zero or empty, and retries both sources',()=>withPage('AuditPage',async h=>{
 assert.match(h.text,/offline/);assert.ok(h.cards.every(c=>c.value==='Unavailable'));
 assert.ok(!h.nodes.some(n=>n.props?.title==='No audit events'||n.props?.title==='No fraud alerts'));
 h.setDb(dbEmpty);await h.click('Retry audit records');
 assert.ok(h.cards.every(c=>c.value==='0'));
 assert.ok(h.nodes.some(n=>n.props?.title==='No audit events'));
},{db:()=>({data:null,error:{message:'offline'}})}));
test('Financial loading never fabricates active or frozen counts, or customer gateway zero',async()=>{
 const pending=deferred();await withPage('FinancialsPage',async h=>{
  assert.match(h.text,/Loading customer wallets/);assert.doesNotMatch(h.text,/SLE 0.00|USD 0.00/);
  pending.resolve(dbEmpty());await h.settle();assert.match(h.text,/Unavailable/);
 },{db:()=>pending.promise});
});
for(const name of ['FinancialsPage','KycPage','AuditPage','UsersPage']){
 test(`${name} denies unassigned staff before reading protected data`,()=>withPage(name,async h=>{
  assert.match(h.text,/Access denied/);assert.equal(h.calls.length,0);
 },{grants:{id:uid,is_active:true,is_owner:false,permissions:['dashboard']}}));
}
test('Customer list identifies an incomplete registered account by email without inventing a name or review submission',()=>withPage('UsersPage',async h=>{
 assert.match(h.text,/registered@example.com/);assert.match(h.text,/KYC not submitted/);
 assert.doesNotMatch(h.text,/No Name|Unknown customer/);
},{db:()=>({data:[{id:uid,role:'rider',email:'registered@example.com',full_name:null,kyc_status:'not_started'}],error:null})}));
test('KYC queue uses email as display label but keeps missing legal full name explicit in review',()=>withPage('KycPage',async h=>{
 assert.match(h.text,/registered@example.com/);assert.doesNotMatch(h.text,/Unknown customer|Unnamed customer/);
 await h.click('Review');
 assert.ok(h.nodes.some(n=>n.props?.label==='Full name'&&n.props.value==='Not supplied'));
},{db:()=>({data:[{id:'queue',submission_id:'submission',profile_id:uid,target_role:'driver',status:'pending',profile:{id:uid,email:'registered@example.com',kyc_review_version:1}}],error:null})}));
test('Leaving KYC, Financials or Audit prevents a late read from writing to the unmounted page',async()=>{
 for(const name of ['KycPage','FinancialsPage','AuditPage']){
  const pending=deferred();await withPage(name,async h=>{
   h.unmount();const before=h.writes;pending.resolve(dbEmpty());await h.settle();assert.equal(h.writes,before);
  },{db:()=>pending.promise});
 }
});

test('Revoking an assignment hides retained records and rejects a late response for each protected page',async()=>{
 for(const name of ['KycPage','FinancialsPage','AuditPage','UsersPage']){
  const pending=deferred();await withPage(name,async h=>{
   h.setAccess({id:uid,is_active:false,is_owner:false,permissions:[]});await h.settle();
   assert.match(h.text,/Access denied/);const before=h.writes;
   pending.resolve(dbEmpty());await h.settle();assert.equal(h.writes,before);
   assert.match(h.text,/Access denied/);
  },{db:()=>pending.promise});
 }
});
test('Financial customer total excludes a Spin treasury even when it is accidentally linked as a customer wallet',()=>withPage('FinancialsPage',async h=>{
 assert.match(h.text,/SLE 2.00/);assert.doesNotMatch(h.text,/SLE 102.00/);
},{db:()=>({data:[{id:'w1',user_id:uid,currency:'SLE',balance:0,is_frozen:false,monime_account_id:'customer'},{id:'w2',user_id:uid,currency:'SLE',balance:0,is_frozen:false,monime_account_id:'spin'}],error:null}),api:()=>({ok:true,body:{businessAccountIds:[],platform:{spinAccountId:'spin'},accounts:[{id:'customer',currency:'SLE',balance:{available:{currency:'SLE',value:200}}},{id:'spin',currency:'SLE',balance:{available:{currency:'SLE',value:10000}}}]}})}));

test('Wallet freeze retains the exact wallet and reason, requires its matching receipt, and prevents duplicate clicks',()=>withPage('FinancialsPage',async h=>{
 await h.click('Freeze Wallet');
 const reason=h.nodes.find(n=>n.type==='input'&&n.props.placeholder?.startsWith('Reason for the audit'));
 reason.props.onChange({target:{value:'Customer requested freeze'}});await h.settle();
 const confirm=h.button('Confirm');confirm.props.onClick();confirm.props.onClick();await h.settle();
 const writes=h.calls.filter(c=>c.name==='matmove_admin_set_wallet_frozen');assert.equal(writes.length,1);
 assert.deepEqual(writes[0].args,{p_wallet_id:'wallet-owned',p_is_frozen:true,p_reason:'Customer requested freeze'});
 assert.match(h.text,/Wallet frozen/);
},{db:name=>name==='matmove_admin_set_wallet_frozen'?{data:{success:true,wallet_id:'wallet-owned',is_frozen:true},error:null}:{data:[{id:'wallet-owned',user_id:uid,currency:'SLE',balance:0,is_frozen:false}],error:null}}));
test('KYC review still sends the exact submission and review version once, with approval left to the secured RPC',()=>withPage('KycPage',async h=>{
 await h.click('Review');const submit=h.button('Submit Decision');submit.props.onClick();submit.props.onClick();await h.settle();
 const writes=h.calls.filter(c=>c.name==='matmove_review_customer_kyc');assert.equal(writes.length,1);
 assert.deepEqual(writes[0].args,{p_profile:uid,p_submission:'submission-owned',p_expected_version:7,p_decision:'approved',p_reason:''});
},{db:name=>name==='matmove_review_customer_kyc'?{data:{success:true},error:null}:{data:[{id:'queue',submission_id:'submission-owned',profile_id:uid,target_role:'driver',status:'pending',profile:{id:uid,full_name:'Customer',email:'customer@example.com',kyc_review_version:7}}],error:null}}));
