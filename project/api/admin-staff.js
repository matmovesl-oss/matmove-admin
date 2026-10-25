
import {createReportHandler} from '../server/admin-reports.js';
import {requireAdmin, failure} from '../server/admin-auth.js';
import {validPermissions, SECTION_GROUPS, PERMISSION_KEYS} from '../shared/admin-permissions.js';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function rpcFailure(error) {
 const message=String(error?.message||'Staff change was not confirmed.');
 for(const [prefix,status] of [['CONFLICT:',409],['REMOVED:',409],['FORBIDDEN:',403],['INVALID:',400],['NOT_FOUND:',404]])if(message.startsWith(prefix))return failure(status,message.slice(prefix.length).trim());
 return failure(503,'Staff change was not confirmed. Check that STAFF_REMOVAL_SETUP.sql succeeded, then refresh the directory before retrying.');
}
function expectedVersion(body){
 if(typeof body.expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(body.expectedUpdatedAt)))throw failure(400,'Refresh the staff record before changing removal or restoration access.');
 return body.expectedUpdatedAt;
}
export function createHandler({authorize=requireAdmin,env=process.env}={}){
 const reports=createReportHandler({authorize,env});
 return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed.'});
 try{
  const view=req.query?.view??new URL(req.url||'/api/admin-staff','https://admin.invalid').searchParams.get('view');
  if(['report-catalog','report-page','report-overview'].includes(view))return reports(req,res);
  if(view!=null&&view!=='me')throw failure(400,'Invalid staff view.');
  if(view==='me'&&req.method!=='GET')throw failure(405,'Use GET for your staff session.');
  const self=view==='me';
  const {client,user,access}=await authorize(req,self?PERMISSION_KEYS:['staff'],{env});
  if(self)return res.status(200).json({access:{id:user.id,email:access.email,full_name:access.full_name,department:access.department,is_owner:access.is_owner===true,is_active:access.is_active===true,permissions:Array.isArray(access.permissions)?access.permissions:[],requires_password_setup:access.requires_password_setup===true}});
  if(req.method==='GET'){
   const result=await client.from('matmove_staff_access').select('*').order('created_at',{ascending:false});
   if(result.error||!Array.isArray(result.data))throw failure(503,'Staff directory unavailable. Retry the directory.');
   return res.status(200).json({removalReady:result.data.length>0&&result.data.every(row=>Object.prototype.hasOwnProperty.call(row,'removed_at')),staff:result.data.filter(row=>!row.removed_at).map(({id,email,full_name,department,permissions,is_active,is_owner,requires_password_setup,invite_state,updated_at})=>({id,email,full_name,department,permissions,is_active,is_owner,requires_password_setup,invite_state,updated_at}))});
  }
  if(access.is_owner!==true)throw failure(403,'Access denied. Only the owner can authorize, remove or change staff.');
  let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};}catch{throw failure(400,'Invalid staff request.');}
  const action=body.action;
  if(!['invite','update','resend','remove'].includes(action))throw failure(400,'Invalid staff action.');
  let targetId=body.id;
  if(action==='remove'){
   if(!uuid(targetId)||targetId===user.id)throw failure(400,'Select another staff member to remove.');
   const expected=expectedVersion(body);
   if(typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.trim().length>500)throw failure(400,'Enter a removal reason from 3 to 500 characters.');
   // The actor is resolved from the bearer token, never the submitted body.
   const result=await client.rpc('matmove_staff_remove',{p_actor:user.id,p_id:targetId,p_expected:expected,p_reason:body.reason.trim()});
   if(result.error)throw rpcFailure(result.error);
   if(result.data?.removed!==true||result.data.id!==targetId)throw failure(503,'Removal was not confirmed. Refresh the directory before retrying.');
   return res.status(200).json({success:true,emailSent:false,message:'Staff removed from Admin. Their login, Customer account and financial history were preserved.'});
  }
  let permissions,fullName,email;
  if(action!=='resend'){
   try{permissions=validPermissions(body.permissions);}catch(error){throw failure(400,error.message);}
   if(!permissions.length)throw failure(400,'Select at least one assignment.');
   fullName=String(body.fullName||'').trim();if(fullName.length<2||fullName.length>120)throw failure(400,'Enter the staff full name.');
  }
  let redirect;
  if(action==='invite'||action==='resend'){
   try{const base=new URL(env.ADMIN_APP_URL);if(base.protocol!=='https:'&&base.hostname!=='localhost')throw new Error();redirect=new URL('/accept-invite',base).href;}catch{throw failure(503,'Configure ADMIN_APP_URL with your Admin portal URL.');}
  }
  let invitationSent=false,restore=false;
  if(action==='invite'){
   email=String(body.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw failure(400,'Enter a valid staff email.');
   const found=await client.rpc('matmove_staff_find_user',{p_email:email});if(found.error)throw failure(503,'Staff lookup unavailable. Check the existing staff setup.');
   if(found.data){
    targetId=found.data;const old=await client.from('matmove_staff_access').select('*').eq('id',targetId).maybeSingle();if(old.error)throw failure(503,'Staff lookup unavailable.');
    if(old.data?.removed_at){
     if(body.restoreRemoved!==true)return res.status(409).json({error:'This person was previously removed. Review the assignments and explicitly confirm restoring Admin access.',code:'STAFF_REMOVED',restore:{id:targetId,email:old.data.email,updated_at:old.data.updated_at}});
     if(body.restoreId!==targetId)throw failure(409,'Staff identity changed. Review the restoration again.');
     expectedVersion(body);restore=true;
    }else if(old.data)throw failure(409,'This staff account already exists. Use Edit assignments or Send login email.');
    else if(body.restoreRemoved)throw failure(409,'Staff record changed. Refresh before restoring.');
   }else{
    if(body.restoreRemoved)throw failure(409,'Staff identity changed. Review the restoration again.');
    const result=await client.auth.admin.inviteUserByEmail(email,{redirectTo:redirect,data:{full_name:fullName}});
    if(result.error)throw failure(502,`Invitation failed: ${result.error.message}`);targetId=result.data.user?.id;if(!targetId)throw failure(502,'Invitation returned no user account.');invitationSent=true;
   }
  }
  if(!uuid(targetId))throw failure(400,'Valid staff ID required.');
  if(action==='update'||action==='resend'){
   const target=await client.from('matmove_staff_access').select('*').eq('id',targetId).maybeSingle();if(target.error||!target.data||target.data.removed_at)throw failure(404,'Staff account not found in the active directory.');
   if(target.data.is_owner||targetId===user.id)throw failure(403,'Owner access cannot be changed here.');email=target.data.email;
   if(action==='resend'&&target.data.is_active!==true)throw failure(409,'Reactivate this staff member before sending a login email.');
  }
  if(action!=='resend'){
   const department=SECTION_GROUPS.filter(group=>group.items.some(([key])=>permissions.includes(key))).map(group=>group.label).join(', ');
   const result=restore
    ?await client.rpc('matmove_staff_restore',{p_actor:user.id,p_id:targetId,p_expected:body.expectedUpdatedAt,p_name:fullName,p_permissions:permissions,p_department:department})
    :await client.rpc('matmove_staff_save',{p_actor:user.id,p_id:targetId,p_email:email,p_name:fullName,p_permissions:permissions,p_department:department,p_active:action==='invite'?true:body.isActive===true,p_setup:action==='invite'});
   if(result.error)throw rpcFailure(result.error);
  }
  if(action==='resend'||(action==='invite'&&!invitationSent)){
   const result=await client.auth.resetPasswordForEmail(email,{redirectTo:redirect});if(result.error)throw failure(502,'Assignments saved, but the login email could not be sent. Refresh the directory and use Send login email to retry.');invitationSent=true;
  }
  return res.status(200).json({success:true,emailSent:invitationSent,message:action==='update'?'Staff assignments updated.':'Admin access saved. Email accepted by Supabase for sending; the staff member can set their own password using the link.'});
 }catch(error){return res.status(error.status||500).json({error:error.status?error.message:'Staff request failed.'});}
};}
export default createHandler();
