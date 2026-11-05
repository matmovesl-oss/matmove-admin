import {requireAdmin,failure} from './admin-auth.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
export function createConciergeHandler({authorize=requireAdmin,env=process.env}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
   const url=new URL(req.url||'/','https://admin.invalid');
   const view=req.query?.view??url.searchParams.get('view');
   if(typeof view!=='string'||url.searchParams.getAll('view').length>1)throw failure(400,'Select one Concierge action.');
   const action=view.replace(/^concierge-/,'');
   if(!['services','enquiries','save','archive','status'].includes(action))throw failure(400,'Invalid Concierge action.');
   if(req.method!==(['services','enquiries'].includes(action)?'GET':'POST'))throw failure(405,'Method not allowed.');
   const {client,user}=await authorize(req,['concierge'],{env});
   let body={};if(req.method==='POST'){try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{throw failure(400,'Invalid request.');}
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['id','requestKey','expectedVersion','data'].includes(k))||!uuid(body.id)||!uuid(body.requestKey)||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0||!body.data||Array.isArray(body.data)||typeof body.data!=='object')throw failure(400,'Invalid Concierge change.');
   }
   const raw=req.query?.page??url.searchParams.get('page')??'0';
   if(typeof raw!=='string'||!/^\d{1,5}$/.test(raw)||url.searchParams.getAll('page').length>1)throw failure(400,'Invalid enquiry page.');
   const result=await client.rpc('matmove_admin_concierge',{p_actor:user.id,p_action:action,p_key:body.requestKey||null,p_id:body.id||null,p_expected:body.expectedVersion??null,p_data:body.data||{},p_page:Number(raw)});
   if(result.error){const msg=String(result.error.message||'');const prefix=msg.split(':')[0];throw failure(({FORBIDDEN:403,CONFLICT:409,INVALID:400})[prefix]||503,['FORBIDDEN','CONFLICT','INVALID'].includes(prefix)?msg:'Concierge change was not confirmed. Reload before retrying.');}
   if(!result.data||typeof result.data!=='object')throw failure(503,'Concierge response was not confirmed.');
   return res.status(200).json(result.data);
  }catch(error){return res.status(error.status||503).json({error:error.status?error.message:'Concierge is unavailable. Retry later.'});}
 };
}
