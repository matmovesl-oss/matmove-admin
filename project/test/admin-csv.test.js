
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const user='2b08533c-30d5-4714-9f8d-a62f2de22a3e';
const owner={id:user,is_active:true,is_owner:true,permissions:[]};
function nodes(n){if(!n||typeof n!=='object')return[];if(Array.isArray(n))return n.flatMap(nodes);return[n,...nodes(n.props?.children)];}
function text(n){if(n==null||typeof n==='boolean')return'';if(typeof n!=='object')return String(n);if(Array.isArray(n))return n.map(text).join('');return text(n.props?.children);}

async function bundle(file,controlled=false){
 const dir=await mkdtemp(join(process.cwd(),'.admin-csv-')),out=join(dir,'ui.mjs');
 try{
  await build({entryPoints:[file],tsconfig:'tsconfig.app.json',outfile:out,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react/*','lucide-react'],plugins:[{name:'csv-mocks',setup(b){
   if(controlled)b.onResolve({filter:/^react$/},()=>({path:'hooks',namespace:'mock'}));
   b.onResolve({filter:/^@\/lib\/(adminFetch|adminAccess|supabase)$/},a=>({path:a.path.split('/').at(-1),namespace:'mock'}));
   b.onResolve({filter:/^@\/components\//},a=>({path:a.path,namespace:'leaf'}));
   b.onResolve({filter:/^\.\/KycPage$/},()=>({path:'kyc',namespace:'leaf'}));
   b.onLoad({filter:/.*/,namespace:'leaf'},()=>({contents:'export default function Leaf(){return null;}export function DocumentCard(){return null;}'}));
   b.onLoad({filter:/.*/,namespace:'mock'},a=>({resolveDir:process.cwd(),contents:({
    hooks:'export const {useState,useEffect,useRef,useCallback,useMemo}=globalThis.__csvHooks;',
    adminFetch:'export const adminFetch=(...args)=>globalThis.__csvFetch(...args);',
    adminAccess:`export {canAdminAccess as canAccess} from ${JSON.stringify(join(process.cwd(),'shared/admin-permissions.js'))};export const useAdminAccess=()=>globalThis.__csvAccess;`,
    supabase:'export const supabase=globalThis.__csvDb;'
   })[a.path]}));
  }}]});return{module:await import(pathToFileURL(out)),close:()=>rm(dir,{recursive:true,force:true})};
 }catch(e){await rm(dir,{recursive:true,force:true});throw e;}
}

test('CSV quotes commas, double quotes and newlines, keeps Unicode/zero/negative numeric values and excludes raw nested records',async()=>{
 const b=await bundle('src/lib/csvExport.ts');try{
  const csv=b.module.buildCsv([{name:'Kadiatu, "Shop"\nFreetown',zero:0,negative:-3.5,secret:{pin:'1234'},emoji:'🍍'}],[{label:'Name',value:r=>r.name},{label:'Zero',value:r=>r.zero},{label:'Number',value:r=>r.negative},{label:'Nested',value:r=>r.secret},{label:'Unicode',value:r=>r.emoji}]);
  assert.ok(csv.startsWith('\ufeff'));assert.match(csv,/"Kadiatu, ""Shop""\nFreetown"/);assert.match(csv,/"0","-3.5","","🍍"/);assert.doesNotMatch(csv,/1234/);assert.ok(csv.endsWith('\r\n'));
  for(const value of ['=HYPERLINK("bad")','+23270000000','-1+2','@SUM(1,2)',' \t=1+1','\u0000=2']){
   assert.match(b.module.buildCsv([value],[{label:'Text',value:r=>r}]),/\r\n"'/);
  }
 }finally{await b.close();}
});

async function browser(fn,{access=owner,sessionUser=user}={}){
 const original={document:globalThis.document,window:globalThis.window,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
 const blobs=[],anchors=[],revoked=[],timers=[];let requests=0;
 globalThis.__csvAccess=access;
 globalThis.__csvDb={auth:{getSession:async()=>({data:{session:{user:{id:sessionUser}}},error:null})}};
 globalThis.__csvFetch=async url=>{assert.equal(url,'/api/admin-staff?view=me');requests++;return{ok:true,json:async()=>({access})};};
 globalThis.document={createElement:()=>{const a={href:'',download:'',click(){a.clicked=true;},remove(){a.removed=true;}};anchors.push(a);return a;},body:{appendChild(){}}};
 globalThis.window={setTimeout:(cb)=>{timers.push(cb);return timers.length;}};
 URL.createObjectURL=blob=>{blobs.push(blob);return'blob:csv-test';};URL.revokeObjectURL=url=>revoked.push(url);
 try{await fn({blobs,anchors,revoked,timers,get requests(){return requests;}});}finally{URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;for(const key of ['document','window']){if(original[key]===undefined)delete globalThis[key];else globalThis[key]=original[key];}for(const key of ['__csvAccess','__csvDb','__csvFetch'])delete globalThis[key];}
}

test('Download verifies current assignment and identity, uses a safe CSV filename, and releases browser resources',()=>browser(async h=>{
 const b=await bundle('src/lib/csvExport.ts');try{
  const count=await b.module.exportCsv({userId:user,section:'customers',filename:'../../customer report',rows:[{name:'A'}],columns:[{label:'Name',value:r=>r.name}]});
  assert.equal(count,1);assert.equal(h.requests,1);assert.equal(h.anchors[0].clicked,true);assert.equal(h.anchors[0].removed,true);assert.match(h.anchors[0].download,/_displayed_.*\.csv$/);assert.doesNotMatch(h.anchors[0].download,/[\/\\]/);
  assert.match(await h.blobs[0].text(),/"Name"\r\n"A"/);h.timers.forEach(cb=>cb());assert.deepEqual(h.revoked,['blob:csv-test']);
 }finally{await b.close();}
}));

for(const[title,options]of[
 ['revoked staff',{access:{...owner,is_active:false}}],
 ['an unassigned section',{access:{...owner,is_owner:false,permissions:['games.entries']}}],
 ['a different session identity',{sessionUser:'different-user'}],
])test(`CSV export denies ${title} before creating any file`,()=>browser(async h=>{
 const b=await bundle('src/lib/csvExport.ts');try{await assert.rejects(()=>b.module.exportCsv({userId:user,section:'customers',filename:'test',rows:[1],columns:[{label:'Value',value:r=>r}]}));assert.equal(h.blobs.length,0);assert.equal(h.anchors.length,0);}finally{await b.close();}
},options));

async function withPage(name,fn,{grants=owner,apiError=false,dbError=false}={}){
 return browser(async h=>{
  const slots=[],effects=[],calls=[];let i=0,dirty=true,tree;
  const changed=(a,b)=>!a||a.length!==b?.length||a.some((v,j)=>!Object.is(v,b[j]));
  globalThis.__csvHooks={useState(initial){const n=i++;if(!(n in slots))slots[n]={value:typeof initial==='function'?initial():initial};return[slots[n].value,v=>{slots[n].value=typeof v==='function'?v(slots[n].value):v;dirty=true;}];},useRef(initial){const n=i++;if(!(n in slots))slots[n]={current:initial};return slots[n];},useCallback(fn,deps){const n=i++;if(!(n in slots)||changed(slots[n].deps,deps))slots[n]={fn,deps};return slots[n].fn;},useMemo(fn,deps){const n=i++;if(!(n in slots)||changed(slots[n].deps,deps))slots[n]={value:fn(),deps};return slots[n].value;},useEffect(fn,deps){const n=i++,old=slots[n];if(!old||changed(old.deps,deps)){const r={deps,cleanup:old?.cleanup};slots[n]=r;effects.push(()=>{r.cleanup?.();r.cleanup=fn();});}}};
  const customers=[{id:'customer-a',full_name:'Alice Shop',email:'alice@example.com',phone:'+23270000000',role:'merchant',kyc_status:'approved',pin:'SECRET_PIN',id_front_url:'PRIVATE_DOCUMENT'},{id:'customer-b',full_name:'Bintu Rider',email:'bintu@example.com',role:'rider'}];
  globalThis.__csvDb.from=()=>{const chain={select:()=>chain,in:()=>chain,order:()=>chain,then:(yes,no)=>Promise.resolve(dbError?{data:null,error:{message:'Database offline'}}:{data:customers,error:null}).then(yes,no)};return chain;};
  globalThis.__csvFetch=async(url,options)=>{
   calls.push({url,options});
   if(url==='/api/admin-staff?view=me')return{ok:true,json:async()=>({access:grants})};
   const body=apiError?{error:'Gateway offline'}:url==='/api/get-payouts'?{payouts:[{id:'payout-a',status:'completed',amount:{currency:'USD',value:1234}},{id:'payout-b',status:'pending',amount:{currency:'SLE',value:500}}]}:{transactions:[{id:'txn-a',type:'credit',amount:{currency:'USD',value:1234}},{id:'txn-b',type:'debit',amount:{currency:'SLE',value:500}}]};
   return{ok:!apiError,json:async()=>body};
  };
  const b=await bundle(`src/pages/${name}.tsx`,true);
  function render(){i=0;dirty=false;tree=(b.module[name]||b.module.default)();while(effects.length)effects.shift()();}
  async function settle(){for(let n=0;n<12;n++){if(dirty)render();await new Promise(r=>setImmediate(r));if(n>5&&!dirty)break;}if(dirty)render();}
  const button=label=>{const node=nodes(tree).find(n=>n.type==='button'&&text(n).trim()===label);assert.ok(node,`Missing ${label}: ${text(tree)}`);return node;};
  const page={...h,calls,settle,button,get text(){return text(tree);},async search(value){const input=nodes(tree).find(n=>n.type==='input');input.props.onChange({target:{value}});await settle();},async filter(value){const select=nodes(tree).find(n=>n.type==='select');select.props.onChange({target:{value}});await settle();},async click(label){const node=button(label);assert.ok(!node.props.disabled);node.props.onClick();await settle();},async exportTwice(){const node=button('Export displayed CSV');assert.ok(!node.props.disabled);node.props.onClick();node.props.onClick();await settle();}};
  try{await settle();await fn(page);}finally{for(const s of slots)s?.cleanup?.();delete globalThis.__csvHooks;await b.close();}
 },{access:grants});
}

test('Customer CSV matches the selected filter, omits private identity/PIN fields, and duplicate export clicks create one file',()=>withPage('UsersPage',async h=>{
 await h.search('Alice');await h.exportTwice();assert.equal(h.blobs.length,1);const csv=await h.blobs[0].text();assert.match(csv,/Alice Shop/);assert.doesNotMatch(csv,/Bintu|SECRET_PIN|PRIVATE_DOCUMENT/);assert.equal(h.calls.filter(c=>c.url==='/api/admin-staff?view=me').length,1);
}));

test('Payout and ledger CSV exports preserve filtered statuses, currencies and exact minor-unit amounts',async()=>{
 await withPage('PayoutsPage',async h=>{await h.click('completed');await h.click('Export displayed CSV');const csv=await h.blobs[0].text();assert.match(csv,/payout-a/);assert.doesNotMatch(csv,/payout-b/);assert.match(csv,/"USD","12.34","completed"/);});
 await withPage('TransactionsPage',async h=>{await h.filter('credit');await h.click('Export displayed CSV');const csv=await h.blobs[0].text();assert.match(csv,/txn-a/);assert.doesNotMatch(csv,/txn-b/);assert.match(csv,/"USD","12.34"/);assert.match(h.text,/limited batch/);});
});

test('Failed or unassigned list pages cannot export cached or unverified records',async()=>{
 await withPage('UsersPage',async h=>{assert.equal(h.button('Export displayed CSV').props.disabled,true);assert.match(h.text,/Retry customers/);assert.equal(h.blobs.length,0);},{dbError:true});
 await withPage('PayoutsPage',async h=>{assert.equal(h.button('Export displayed CSV').props.disabled,true);assert.equal(h.blobs.length,0);},{apiError:true});
 await withPage('TransactionsPage',async h=>{assert.equal(h.button('Export displayed CSV').props.disabled,true);assert.equal(h.blobs.length,0);},{grants:{...owner,is_owner:false,permissions:['customers']}});
});
