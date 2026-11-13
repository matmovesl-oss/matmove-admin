import {requireAdmin,failure} from './admin-auth.js';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ACCOUNT=/^fac-[A-Za-z0-9_-]{1,116}$/;
const TRANSFER=/^trn-[A-Za-z0-9_-]{1,116}$/;
export function moneyMinor(v){if(typeof v!=='string'||v.length>16||!/^\d{1,10}(\.\d{1,2})?$/.test(v))throw failure(400,'Enter a positive SLE amount with up to two decimal places.');const [a,b='']=v.split('.');const n=BigInt(a)*100n+BigInt(b.padEnd(2,'0'));if(n<1n||n>1000000000000n)throw failure(400,'Amount is outside the permitted range.');return Number(n);}
function source(kind,env){const id=kind==='payroll'?env.MONIME_STAFF_PAYROLL_ACCOUNT_ID||env.MONIME_STAFF_PAYROLE_ACCOUNT_ID:env.MONIME_REFUND_ACCOUNT_ID;if(!ACCOUNT.test(id||''))throw failure(503,'Configure the dedicated business account on the Admin server.');const other=kind==='payroll'?env.MONIME_REFUND_ACCOUNT_ID:env.MONIME_STAFF_PAYROLL_ACCOUNT_ID||env.MONIME_STAFF_PAYROLE_ACCOUNT_ID;if([other,env.MONIME_ESCROW_ACCOUNT_ID,env.MONIME_PLATFORM_FEE_ACCOUNT_ID,env.MONIME_SPIN_ACCOUNT_ID,env.MONIME_REFERRAL_ACCOUNT_ID].filter(Boolean).includes(id))throw failure(503,'Use a separate dedicated payroll or refund account.');return id;}
async function rpc(db,name,args){const r=await db.rpc(name,args);if(r.error){const m=r.error.message||'';if(m.startsWith('FORBIDDEN:'))throw failure(403,m.slice(11).trim());if(/^(INVALID|CONFLICT):/.test(m))throw failure(409,m.replace(/^[A-Z]+: /,''));throw failure(503,'Admin money storage is not ready. Install the current ledger and claim migrations.');}return r.data;}
function rowResult(kind,row){if(!row||!UUID.test(row.id||'')||!UUID.test(row.request_key||''))throw failure(503,'Original payment record was not confirmed.');const confirmed=row.verified_receipt&&row.verified_receipt.id===row.provider_transfer_id&&TRANSFER.test(row.provider_transfer_id||'');const status=['completed','failed'].includes(row.state)&&!confirmed?'review_required':row.state;return {success:status==='completed'&&!!confirmed,status,pending:!['completed','failed'].includes(status),[kind==='payroll'?'payrollId':'refundId']:row.id,providerTransferId:TRANSFER.test(row.provider_transfer_id||'')?row.provider_transfer_id:null,requestKey:row.request_key,recipientUserId:row.staff_user_id||row.recipient_user_id,amount:{currency:'SLE',value:Number(row.amount_minor)},message:status==='review_required'?'Original payment needs review. Do not create a replacement payment.':undefined};}
export function createMoneyHandler(kind,{authorize=requireAdmin,env=process.env,fetcher=fetch}={}){
 if(!['payroll','refund'].includes(kind))throw Error('Unknown money module');
 const table=kind==='payroll'?'matmove_admin_payroll':'matmove_admin_refunds';
 async function provider(path,method='GET',body,key){
  if(!/^financial-accounts\/fac-[A-Za-z0-9_-]+\?withBalance=true$/.test(path)&&!/^internal-transfers(?:\/trn-[A-Za-z0-9_-]+)?$/.test(path))throw failure(400,'Invalid provider path.');
  const mode=env.MONIME_ENVIRONMENT,token=env.MONIME_API_KEY||'',tokenMode=token.startsWith('mon_test_')?'test':token.startsWith('mon_')?'live':'unknown';if(!['live','test'].includes(mode)||mode!==tokenMode||!/^spc-[A-Za-z0-9_-]+$/.test(env.MONIME_SPACE_ID||'')||env.VERCEL_ENV==='production'&&mode!=='live')throw failure(503,'Check the explicit Monime Live/Test mode, server token and Space configuration.');
  let r,b;try{r=await fetcher('https://api.monime.io/v1/'+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.MONIME_API_KEY,'Monime-Space-Id':env.MONIME_SPACE_ID,'Monime-Version':'caph.2025-08-23','Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});b=await r.json();}catch{throw failure(503,'Provider response was not confirmed. Keep the original payment request.');}
  if(!r.ok||!b?.result)throw failure(503,'Provider request was not confirmed. Check the original payment.');return b.result;
 }
 async function account(id){const a=await provider(`financial-accounts/${id}?withBalance=true`);const v=a?.balance?.available;if(a.id!==id||a.currency!=='SLE'||v?.currency!=='SLE'||!Number.isSafeInteger(v.value)||v.value<0)throw failure(503,'Live SLE account balance was not confirmed.');return a;}
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed.'});}
  let db,actor,key,row,claimed=false;
  try{
   const admin=await authorize(req,kind==='payroll'?['special']:['financials','special'],{env});db=admin.client;actor=admin.user.id;
   const url=new URL(req.url||'/','https://admin.invalid');
   for(const k of url.searchParams.keys())if(!['view','q'].includes(k)||url.searchParams.getAll(k).length!==1)throw failure(400,'Invalid query.');
   const view=url.searchParams.get('view')||'balance';
   if(req.method==='GET'){
    if(!['balance','recipients','history'].includes(view))throw failure(400,'Unknown view.');
    if(view==='balance'){const id=source(kind,env),a=await account(id);return res.status(200).json({actor,accountId:id,accountName:a.name||`${kind} account`,currency:'SLE',balance:a.balance.available,newPaymentsEnabled:env.MATMOVE_ADMIN_MONEY_ENABLED==='true'});}
    if(view==='history'){const r=await db.from(table).select('id,request_key,recipient_account_id,amount_minor,currency,reason,state,provider_transfer_id,verified_receipt,created_at').eq('initiated_by',actor).order('created_at',{ascending:false}).limit(50);if(r.error||!Array.isArray(r.data))throw failure(503,'Payment history could not be loaded.');return res.status(200).json({actor,rows:r.data.map(v=>{const {verified_receipt,...safe}=v;return {...safe,state:rowResult(kind,v).status};})});}
    const q=url.searchParams.get('q')||'';if(q&&!/^[\p{L}\p{N}@.+ _'-]{2,80}$/u.test(q))throw failure(400,'Enter 2 to 80 characters using a name, email or phone number.');
    let query=db.from('profiles').select('id,full_name,email,phone,role,is_payroll_staff,wallets(id,currency,monime_account_id,metadata,is_frozen)');
    query=kind==='payroll'?query.eq('is_payroll_staff',true).in('role',['rider','driver','merchant']):query.in('role',['rider','driver','merchant']).or('is_payroll_staff.is.null,is_payroll_staff.eq.false');
    if(kind==='refund'){
     const staff=await db.from('matmove_staff_access').select('id').eq('is_active',true).is('removed_at',null).limit(1001);
     if(staff.error||!Array.isArray(staff.data)||staff.data.length>1000||staff.data.some((row:any)=>!UUID.test(row.id||'')))throw failure(503,'Customer directory could not be confirmed. Reload before retrying.');
     const staffIds=staff.data.map((row:any)=>row.id);
     if(staffIds.length)query=query.not('id','in',`(${staffIds.join(',')})`);
    }
    if(q)query=query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
    const r=await query.order('full_name').limit(500);if(r.error||!Array.isArray(r.data))throw failure(503,'Recipient directory could not be loaded.');return res.status(200).json({actor,rows:r.data});
   }
   if(url.searchParams.size)throw failure(400,'Payment confirmations do not accept query parameters.');
   let b;try{b=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{throw failure(400,'Invalid request body.');}
   const allowed=kind==='payroll'?['staffUserId','requestKey','amount','reason']:['recipientUserId','recipientAccountId','requestKey','amount','reason'];
   if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!allowed.includes(k)))throw failure(400,'Invalid payment fields.');
   const user=kind==='payroll'?b.staffUserId:b.recipientUserId;key=b.requestKey;
   if(!UUID.test(user||'')||!UUID.test(key||'')||typeof b.reason!=='string'||b.reason!==b.reason.trim()||b.reason.length<3||b.reason.length>(kind==='payroll'?140:300))throw failure(400,'Review the recipient, original request key and payment reason.');
   const amount=moneyMinor(b.amount);
   // Check durable identity-bound original requests before inspecting current wallet links.
   const previous=await db.from(table).select('*').eq('request_key',key).maybeSingle();if(previous.error)throw failure(503,'Install the Admin money ledgers before processing payments.');
   let destination,sourceId;
   if(previous.data){row=previous.data;destination=row.recipient_account_id;sourceId=row.source_account_id;if(row.initiated_by!==actor||(row.staff_user_id||row.recipient_user_id)!==user||Number(row.amount_minor)!==amount||row.reason!==b.reason||(kind==='refund'&&b.recipientAccountId!==destination))throw failure(409,'This key belongs to different original payment details.');}
   else{
    if(env.MATMOVE_ADMIN_MONEY_ENABLED!=='true')throw failure(503,'New payroll and refund payments are paused pending the production release checks.');
    sourceId=source(kind,env);
    if(kind==='refund'){
     const [profile,staff]=await Promise.all([
      db.from('profiles').select('role,is_payroll_staff').eq('id',user).maybeSingle(),
      db.from('matmove_staff_access').select('id').eq('id',user).eq('is_active',true).is('removed_at',null).maybeSingle()
     ]);
     if(profile.error||staff.error)throw failure(503,'Customer eligibility could not be confirmed. No refund was submitted.');
     if(!profile.data||!['rider','driver','merchant'].includes(profile.data.role)||profile.data.is_payroll_staff===true||staff.data)throw failure(409,'Refunds are only available to Rider, Driver and Merchant customer accounts. Staff accounts cannot receive customer refunds.');
    }
    const wallets=await db.from('wallets').select('id,user_id,currency,monime_account_id,metadata').eq('user_id',user).eq('currency','SLE');
    if(wallets.error||!Array.isArray(wallets.data)||wallets.data.length!==1)throw failure(409,'Recipient must have exactly one SLE wallet.');
    destination=wallets.data[0].monime_account_id||wallets.data[0].metadata?.monime_account_id;
    if(!ACCOUNT.test(destination||'')||(kind==='refund'&&b.recipientAccountId!==destination))throw failure(409,'Recipient wallet was not confirmed.');
   }
   row=await rpc(db,'matmove_admin_money_prepare',{p_kind:kind,p_actor:actor,p_key:key,p_user:user,p_account:destination,p_source:sourceId,p_amount:amount,p_reason:b.reason});
   if(row.provider_transfer_id){
    if(!TRANSFER.test(row.provider_transfer_id))throw failure(409,'Original provider reference needs manual review.');
    if(row.verified_receipt&&['completed','failed'].includes(row.state))return res.status(200).json(rowResult(kind,row));
    const receipt=await provider('internal-transfers/'+row.provider_transfer_id);
    row=await rpc(db,'matmove_admin_money_record',{p_kind:kind,p_actor:actor,p_key:key,p_receipt:receipt});
   }else if(row.attempted_at||!row.claimable){
    row=await rpc(db,'matmove_admin_money_review',{p_kind:kind,p_actor:actor,p_key:key});
   }else{
    if(env.MATMOVE_ADMIN_MONEY_ENABLED!=='true')throw failure(503,'New payments are paused. Original receipt checks remain available.');
    if(source(kind,env)!==sourceId)throw failure(409,'Payment source configuration changed. Review this original request.');
    const src=await account(sourceId);await account(destination);
    if(src.balance.available.value<amount)throw failure(409,'Insufficient confirmed source funds. No transfer submitted.');
    row=await rpc(db,'matmove_admin_money_claim',{p_kind:kind,p_actor:actor,p_key:key});
    if(row.can_create){
     claimed=true;
     const metadata=kind==='payroll'?{matmovePayrollRequestKey:key,staffUserId:user,initiatedBy:actor}:{matmoveRefundRequestKey:key,recipientUserId:user,initiatedBy:actor};
     const receipt=await provider('internal-transfers','POST',{amount:{currency:'SLE',value:amount},sourceFinancialAccount:{id:sourceId},destinationFinancialAccount:{id:destination},description:`MatMove ${kind}: ${b.reason}`.slice(0,150),metadata},key);
     row=await rpc(db,'matmove_admin_money_record',{p_kind:kind,p_actor:actor,p_key:key,p_receipt:receipt});
    }else if(!row.provider_transfer_id)row=await rpc(db,'matmove_admin_money_review',{p_kind:kind,p_actor:actor,p_key:key});
   }
   const result=rowResult(kind,row);return res.status(result.pending?202:200).json(result);
  }catch(e){
   if(db&&actor&&key&&(claimed||row?.attempted_at)){try{row=await rpc(db,'matmove_admin_money_review',{p_kind:kind,p_actor:actor,p_key:key});}catch{/* No new attempt is authorized by an unavailable audit write. */}}
   return res.status(e.status||503).json({error:e.status?e.message:'Payment could not be confirmed. Keep the original request.',...(row?{status:rowResult(kind,row).status,requestKey:key}:{} )});
  }
 };
}
