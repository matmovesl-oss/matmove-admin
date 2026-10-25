
import {createHmac} from 'node:crypto';
import {failure} from './admin-auth.js';
const VERSION='caph.2025-08-23';
export const GATEWAY_REPORTS=[
 {id:'monime_transactions',title:'Monime gateway transactions — full history',permission:'transactions',source:'gateway',
  columns:['id','type','currency','amount_value','amount_unit','timestamp','reference','financial_account_id','balance_after_currency','balance_after_value','reversal_transaction_id','reversal_reference','fee_code'],
  note:'All returned Monime transaction pages. Amount and balance values are integer minor units of their supplied currency; no conversion is applied. Records reflect the gateway when each page is read.'},
 {id:'monime_payouts',title:'Monime payouts — full history',permission:'payouts',source:'gateway',
  columns:['id','status','currency','amount_value','amount_unit','source_account_id','source_reference','destination_type','destination_provider_id','destination_reference','fee_details','failure_code','create_time','update_time'],
  note:'All returned Monime payout pages, including pending and failed payouts. Amount values and fee amounts are integer minor units in their supplied currency. A payout is successful only when its status is completed.'}
];
export function gatewayConfigured(env){return typeof env.MONIME_API_KEY==='string'&&!!env.MONIME_API_KEY.trim()&&typeof env.MONIME_SPACE_ID==='string'&&!!env.MONIME_SPACE_ID.trim();}
export function gatewayScope(env){
 if(!gatewayConfigured(env)||!env.SUPABASE_SERVICE_ROLE_KEY)throw failure(503,'Configure the existing server-only Monime and Supabase settings before exporting gateway history.');
 return createHmac('sha256',env.SUPABASE_SERVICE_ROLE_KEY).update([VERSION,env.MONIME_SPACE_ID,env.MONIME_API_KEY].join('\n')).digest('hex');
}
const invalid=()=>failure(502,'Monime returned an unexpected report page. No complete CSV is available.');
function text(value){if(value==null)return null;if(typeof value!=='string')throw invalid();return value;}
function amount(value,required=false){
 if(value==null&&!required)return {currency:null,value:null};
 if(!value||typeof value.currency!=='string'||!value.currency||!Number.isSafeInteger(value.value))throw invalid();
 return {currency:value.currency,value:String(value.value)};
}
function transaction(row){
 if(!['credit','debit'].includes(row.type))throw invalid();const a=amount(row.amount,true),balance=amount(row.financialAccount?.balance?.after);
 return {id:row.id,type:row.type,currency:a.currency,amount_value:a.value,amount_unit:'provider_minor_units',timestamp:text(row.timestamp),reference:text(row.reference),financial_account_id:text(row.financialAccount?.id),balance_after_currency:balance.currency,balance_after_value:balance.value,reversal_transaction_id:text(row.originatingReversal?.originTxnId),reversal_reference:text(row.originatingReversal?.originTxnRef),fee_code:text(row.originatingFee?.code)};
}
function payout(row){
 if(!['pending','processing','failed','completed'].includes(row.status))throw invalid();const a=amount(row.amount,true);
 if(row.fees!=null&&!Array.isArray(row.fees))throw invalid();
 const fees=(row.fees||[]).map(fee=>{const a=amount(fee?.amount,true);return {code:text(fee.code),currency:a.currency,amount_value:a.value};});
 return {id:row.id,status:row.status,currency:a.currency,amount_value:a.value,amount_unit:'provider_minor_units',source_account_id:text(row.source?.financialAccountId),source_reference:text(row.source?.transactionReference),destination_type:text(row.destination?.type),destination_provider_id:text(row.destination?.providerId),destination_reference:text(row.destination?.transactionReference),fee_details:row.fees==null?null:JSON.stringify(fees),failure_code:text(row.failureDetail?.code),create_time:text(row.createTime),update_time:text(row.updateTime)};
}
export async function fetchGatewayPage({report,after=null,env=process.env,fetcher=fetch}){
 if(!GATEWAY_REPORTS.some(r=>r.id===report))throw failure(400,'Unknown gateway report.');
 if(!gatewayConfigured(env))throw failure(503,'Monime reporting settings are missing.');
 if(after!==null&&(typeof after!=='string'||!after||after.length>2000))throw failure(400,'Invalid gateway continuation.');
 const endpoint=report==='monime_transactions'?'financial-transactions':'payouts';
 const url=new URL('https://api.monime.io/v1/'+endpoint);url.searchParams.set('limit','50');if(after!==null)url.searchParams.set('after',after);
 let response;
 try{response=await fetcher(url,{method:'GET',redirect:'error',headers:{Authorization:`Bearer ${env.MONIME_API_KEY}`,'Monime-Space-Id':env.MONIME_SPACE_ID,'Monime-Version':VERSION,Accept:'application/json'},signal:AbortSignal.timeout(15000)});}
 catch{throw failure(502,'Monime history could not be read. Retry the export; no complete CSV was generated.');}
 if(!response.ok)throw failure(response.status===429?503:502,response.status===429?'Monime rate limit reached. Wait briefly, then restart the export.':'Monime could not return this report page. Retry the export.');
 let body;try{body=await response.json();}catch{throw invalid();}
 if(body?.success!==true||!(Array.isArray(body.result)||body.result===null)||!body.pagination||typeof body.pagination!=='object'||Array.isArray(body.pagination))throw invalid();
 const records=body.result||[],next=body.pagination.next??null;
 if(records.length>50||(next!==null&&(typeof next!=='string'||!next||next.length>2000||next===after||records.length===0)))throw invalid();
 const ids=new Set();const rows=records.map(row=>{
  if(!row||typeof row.id!=='string'||!row.id||ids.has(row.id))throw invalid();ids.add(row.id);
  return report==='monime_transactions'?transaction(row):payout(row);
 });
 return {rows,nextAfter:next,complete:next===null};
}
