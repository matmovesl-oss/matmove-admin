
import {requireAdmin,failure} from './admin-auth.js';
import {signCursor,readCursor} from './admin-reports.js';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const digits=v=>typeof v==='string'&&/^\d{1,19}$/.test(v);
const states=['all','pending','processing','completed','review_required','failed'];
export const referralColumns=['id','new_user_email','inviter_email','beneficiary_email','code','kind','amount_minor','currency','state','provider_id','created_at','updated_at'];
function sourceFor(env){const id=env.MONIME_REFERRAL_ACCOUNT_ID;if(!/^fac-[A-Za-z0-9_-]+$/.test(id||'')||[env.MONIME_SPIN_ACCOUNT_ID,env.MONIME_ESCROW_ACCOUNT_ID,env.MONIME_PLATFORM_FEE_ACCOUNT_ID,env.MONIME_MAIN_ACCOUNT_ID].filter(Boolean).includes(id))throw failure(503,'Configure a separate referral financial account.');return id;}
function query(req){const url=new URL(req.url||'/api/admin-staff','https://admin.invalid');for(const k of url.searchParams.keys())if(url.searchParams.getAll(k).length!==1)throw failure(400,'Duplicate referral query.');const q={...Object.fromEntries(url.searchParams),...(req.query||{})};if(Object.entries(q).some(([k,v])=>!['view','actor','state','cursor','reward','transfer'].includes(k)||typeof v!=='string'))throw failure(400,'Invalid referral query.');return q;}
async function rpc(client,name,args){const r=await client.rpc(name,args);if(r.error){const m=String(r.error.message||'');for(const[p,s]of [['FORBIDDEN:',403],['CONFLICT:',409],['INVALID:',400]])if(m.startsWith(p))throw failure(s,m.slice(p.length).trim());throw failure(503,'Referral administration unavailable. Run the current Referral Admin and Recovery setup SQL, then retry.');}return r.data;}
async function providerRead(path,env,fetcher){
 const mode=env.MONIME_ENVIRONMENT||(env.VERCEL_ENV==='production'?'live':null),token=env.MONIME_API_KEY||'';
 if(!token||!env.MONIME_SPACE_ID||mode&&(!['live','test'].includes(mode)||(token.startsWith('mon_test_')?'test':token.startsWith('mon_')?'live':'unknown')!==mode))throw failure(503,'Check the referral provider environment settings.');
 if(!/^financial-accounts\/fac-[A-Za-z0-9_-]+\?withBalance=true$/.test(path)&&!/^internal-transfers\/trn-[A-Za-z0-9_-]+$/.test(path))throw failure(400,'Invalid provider receipt path.');
 const r=await fetcher(`https://api.monime.io/v1/${path}`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:`Bearer ${token}`,'Monime-Space-Id':env.MONIME_SPACE_ID,'Monime-Version':'caph.2025-08-23'}});
 let b;try{b=await r.json();}catch{throw failure(503,'The original provider receipt could not be read.');}if(!r.ok||!b?.result)throw failure(503,'The original provider receipt could not be confirmed.');return b.result;
}
async function balance(env,fetcher){
 const id=sourceFor(env),a=await providerRead(`financial-accounts/${id}?withBalance=true`,env,fetcher),v=a?.balance?.available;
 if(a?.id!==id||a.currency!=='SLE'||v?.currency!=='SLE'||!Number.isSafeInteger(v.value)||v.value<0)throw failure(503,'Referral account balance was not confirmed.');return {accountId:id,availableMinor:String(v.value),currency:'SLE',observedAt:new Date().toISOString()};
}
// The release switch alone cannot authorize an activation. Read shared SQL health,
// including its exact authenticated deployment challenge and treasury match.
async function activationReady(client,env,now){
 if(env.MATMOVE_REFERRALS_ENABLED!=='true'||env.MONIME_ENVIRONMENT!=='live')return false;
 try{
  const source=sourceFor(env),r=await client.rpc('matmove_referral_scheduler_status');
  const v=r.data,age=now()-Date.parse(v?.probeQueuedAt);
  return !r.error&&v?.schemaReady===true&&v.enabled===true&&v.jobActive===true&&v.secretPresent===true
   &&v.schedule==='* * * * *'&&v.probeVerified===true&&v.probeSource===source
   &&v.probeStatus===200&&v.probeTimedOut===false&&Number.isFinite(age)&&age>=-2000&&age<1800000;
 }catch{return false;}
}
const providerId=v=>typeof v==='string'&&/^trn-[A-Za-z0-9_-]+$/.test(v)&&v.length<=120;
function recoveryReceipt(v,actor,b){if(v?.actor!==actor||v.requestId!==b.requestId||v.rewardId!==b.rewardId||v.providerId!==b.providerId||v.recorded!==true||!['processing','completed','failed'].includes(v.state))throw failure(503,'Receipt attachment was not confirmed. Retry the original saved request.');return v;}
function recoveryPreview(v,actor,reward,provider){if(v?.actor!==actor||v.rewardId!==reward||v.providerId!==provider||v.amountMinor!=='100'||v.currency!=='SLE'||!Number.isFinite(Date.parse(v.updatedAt))||!['pending','processing','completed','failed'].includes(v.providerState)||!['pending','processing','completed','review_required','failed'].includes(v.rewardState)||!['inviter','new_user'].includes(v.kind)||![v.sourceAccount,v.destinationAccount].every(id=>typeof id==='string'&&/^fac-[A-Za-z0-9_-]+$/.test(id)))throw failure(503,'The original reward receipt was not confirmed.');return v;}
export function createReferralAdminHandler({authorize=requireAdmin,env=process.env,fetcher=fetch,now=()=>Date.now()}={}){
 return async(req,res)=>{res.setHeader('Cache-Control','no-store');try{
  const q=query(req);if(!['referral-overview','referral-page','referral-settings','referral-recovery','referral-recovery-save'].includes(q.view))throw failure(400,'Invalid referral view.');
  if(req.method!==(['referral-settings','referral-recovery-save'].includes(q.view)?'POST':'GET'))throw failure(405,'Method not allowed.');
  const {client,user,access}=await authorize(req,['financials'],{env});if(q.actor!==user.id)throw failure(409,'Your signed-in account changed. Reopen Financial & Wallets.');
  if(q.view==='referral-recovery'||q.view==='referral-recovery-save'){
   if(access.is_owner!==true)throw failure(403,'Only the owner may recover referral receipts.');
   if(q.cursor||q.state)throw failure(400,'Invalid receipt recovery query.');
   if(q.view==='referral-recovery'){
    if(!uuid(q.reward)||!providerId(q.transfer))throw failure(400,'Enter the reward UUID and original Monime transfer ID.');
    const receipt=await providerRead(`internal-transfers/${q.transfer}`,env,fetcher);
    const preview=await rpc(client,'matmove_referral_admin_recovery_preview',{p_actor:user.id,p_reward:q.reward,p_receipt:receipt});
    return res.status(200).json(recoveryPreview(preview,user.id,q.reward,q.transfer));
   }
   if(q.reward||q.transfer)throw failure(400,'Invalid receipt save query.');
   let b;try{b=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{throw failure(400,'Invalid receipt attachment request.');}
   if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['requestId','rewardId','providerId','expectedUpdatedAt','reason','confirmed'].includes(k))||!uuid(b.requestId)||!uuid(b.rewardId)||!providerId(b.providerId)||typeof b.expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(b.expectedUpdatedAt))||typeof b.reason!=='string'||b.reason.trim().length<3||b.reason.trim().length>500||b.confirmed!==true)throw failure(400,'Review and confirm the original transfer receipt.');
   const args={p_actor:user.id,p_request:b.requestId,p_reward:b.rewardId,p_provider:b.providerId,p_expected:b.expectedUpdatedAt,p_reason:b.reason.trim(),p_receipt:null};
   const original=await rpc(client,'matmove_referral_admin_recover',args);
   if(original?.recorded===true)return res.status(200).json(recoveryReceipt(original,user.id,b));
   if(original?.found!==false||original.actor!==user.id||original.requestId!==b.requestId)throw failure(503,'The original receipt attachment request could not be checked.');
   const receipt=await providerRead(`internal-transfers/${b.providerId}`,env,fetcher);
   const saved=await rpc(client,'matmove_referral_admin_recover',{...args,p_receipt:receipt});
   return res.status(200).json(recoveryReceipt(saved,user.id,b));
  }
  if(q.view==='referral-settings'){
   if(q.cursor||q.state||q.reward||q.transfer)throw failure(400,'Invalid settings query.');if(access.is_owner!==true)throw failure(403,'Only the owner may change referral settings.');
   let b;try{b=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{throw failure(400,'Invalid settings request.');}
   if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['requestId','expectedRevision','accepting','payments','budgetMinor','reason','confirmed'].includes(k))||!uuid(b.requestId)||!digits(b.expectedRevision)||!digits(b.budgetMinor)||BigInt(b.budgetMinor)>9000000000000000n||typeof b.accepting!=='boolean'||typeof b.payments!=='boolean'||typeof b.reason!=='string'||b.reason.trim().length<3||b.reason.trim().length>500||b.confirmed!==true)throw failure(400,'Review and confirm the exact campaign settings.');
   const ready=(b.accepting||b.payments)?await activationReady(client,env,now):false;
   const source=b.accepting||b.payments?sourceFor(env):null;
   if(ready&&(b.accepting||b.payments))await balance(env,fetcher);
   const saved=await rpc(client,'matmove_referral_admin_save',{p_actor:user.id,p_request:b.requestId,p_expected:b.expectedRevision,p_accepting:b.accepting,p_payments:b.payments,p_budget:b.budgetMinor,p_source:source,p_ready:ready,p_reason:b.reason.trim()});
   if(saved?.actor!==user.id||saved.requestId!==b.requestId||saved.saved!==true||saved.revision!==(BigInt(b.expectedRevision)+1n).toString())throw failure(503,'The settings receipt was not confirmed. Retry the same saved request.');return res.status(200).json(saved);
  }
  if(q.view==='referral-overview'){
   if(q.cursor||q.state||q.reward||q.transfer)throw failure(400,'Invalid overview query.');const overview=await rpc(client,'matmove_referral_admin_overview',{p_actor:user.id});
   if(overview?.actor!==user.id||!digits(overview.campaign?.revision)||!digits(overview.campaign?.budgetMinor)||typeof overview.campaign.accepting!=='boolean'||typeof overview.campaign.payments!=='boolean'||!['referrals','pendingMinor','creditedMinor','reviewMinor','budgetUsedMinor','reservedMinor'].every(k=>digits(overview.totals?.[k])))throw failure(503,'Referral overview was not confirmed.');
   let treasury=null,treasuryError=null;try{treasury=await balance(env,fetcher);}catch{treasuryError='The live referral account balance is unavailable. Retry; it is not a zero balance.';}
   return res.status(200).json({...overview,owner:access.is_owner===true,activationReady:await activationReady(client,env,now),treasury,treasuryError});
  }
  if(q.reward||q.transfer)throw failure(400,'Invalid report query.');
  const state=q.state||'all';if(!states.includes(state))throw failure(400,'Invalid referral state.');const report='referrals_'+state,continuation=q.cursor?readCursor(q.cursor,{actor:user.id,report,env,now:now()}):null,cutoff=continuation?.cutoff||new Date(now()).toISOString();
  const page=await rpc(client,'matmove_referral_admin_page',{p_actor:user.id,p_state:state,p_after:continuation?.after||null,p_cutoff:cutoff});
  if(page?.actor!==user.id||!Array.isArray(page.rows)||page.rows.length>50||page.nextAfter!==null&&!uuid(page.nextAfter))throw failure(503,'Referral report page was not confirmed.');
  const seen=new Set();for(const row of page.rows){if(!uuid(row?.id)||seen.has(row.id)||Object.keys(row).some(k=>!referralColumns.includes(k))||row.amount_minor!=='100'||row.currency!=='SLE'||!states.slice(1).includes(row.state)||state!=='all'&&row.state!==state||row.state==='completed'&&!/^trn-[A-Za-z0-9_-]+$/.test(row.provider_id||''))throw failure(503,'Referral report records were not confirmed.');seen.add(row.id);}
  if(page.nextAfter&&(page.rows.length!==50||page.rows.at(-1)?.id!==page.nextAfter||continuation?.after===page.nextAfter))throw failure(503,'Referral continuation was not confirmed.');
  const next=page.nextAfter?signCursor({actor:user.id,report,after:page.nextAfter,cutoff,expires:continuation?.expires||now()+1800000},env):null;
  return res.status(200).json({actor:user.id,rows:page.rows,columns:referralColumns,cutoff,nextCursor:next,complete:!next});
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Referral administration is temporarily unavailable.'});}};
}
