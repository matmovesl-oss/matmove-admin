

import {requireAdmin,failure} from '../server/admin-auth.js';
import {validPermissions,SECTION_GROUPS,PERMISSION_KEYS} from '../shared/admin-permissions.js';
export function createHandler({authorize=requireAdmin,env=process.env}={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed.'});
 try{
  const view=req.query?.view??new URL(req.url||'/api/admin-staff','https://admin.invalid').searchParams.get('view');
  if(view!=null&&view!=='me')throw failure(400,'Invalid staff view.');
  if(view==='me'&&req.method!=='GET')throw failure(405,'Use GET for your staff session.');
  const self=view==='me';
  const {client,user,access}=await authorize(req,self?PERMISSION_KEYS:['staff'],{env});
  if(self)return res.status(200).json({access:{id:user.id,email:access.email,full_name:access.full_name,department:access.department,is_owner:access.is_owner===true,is_active:access.is_active===true,permissions:Array.isArray(access.permissions)?access.permissions:[],requires_password_setup:access.requires_password_setup===true}});
  if(req.method==='GET'){const r=await client.from('matmove_staff_access').select('*').order('created_at',{ascending:false});if(r.error)throw failure(503,'Staff directory unavailable.');return res.status(200).json({staff:(r.data||[]).map(({id,email,full_name,department,permissions,is_active,is_owner,requires_password_setup,invite_state})=>({id,email,full_name,department,permissions,is_active,is_owner,requires_password_setup,invite_state}))});}
  if(access.is_owner!==true)throw failure(403,'Access denied. Only the owner can authorize or change staff.');
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};const action=body.action;
  if(!['invite','update','resend'].includes(action))throw failure(400,'Invalid staff action.');
  let targetId=body.id;
  let permissions,fullName,email;
  if(action!=='resend'){
   try{permissions=validPermissions(body.permissions);}catch(e){throw failure(400,e.message);}
   if(!permissions.length)throw failure(400,'Select at least one assignment.');
   fullName=String(body.fullName||'').trim();if(fullName.length<2||fullName.length>120)throw failure(400,'Enter the staff full name.');
  }
  let redirect;
  if(action==='invite'||action==='resend'){
   try{const base=new URL(env.ADMIN_APP_URL);if(base.protocol!=='https:'&&base.hostname!=='localhost')throw new Error();redirect=new URL('/accept-invite',base).href;}catch{throw failure(503,'Configure ADMIN_APP_URL with your Admin portal URL.');}
  }
  let invitationSent=false;
  if(action==='invite'){
   email=String(body.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw failure(400,'Enter a valid staff email.');
   const found=await client.rpc('matmove_staff_find_user',{p_email:email});if(found.error)throw failure(503,'Staff lookup unavailable. Run STAFF_ACCESS_SETUP.sql.');
   if(found.data){targetId=found.data;const old=await client.from('matmove_staff_access').select('id').eq('id',targetId).maybeSingle();if(old.error)throw failure(503,'Staff lookup unavailable.');if(old.data)throw failure(409,'This staff account already exists. Use Edit assignments or Send login email.');}
   else {const r=await client.auth.admin.inviteUserByEmail(email,{redirectTo:redirect,data:{full_name:fullName}});if(r.error)throw failure(502,`Invitation failed: ${r.error.message}`);targetId=r.data.user?.id;if(!targetId)throw failure(502,'Invitation returned no user account.');invitationSent=true;}
  }
  if(typeof targetId!=='string'||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(targetId))throw failure(400,'Valid staff ID required.');
  if(action==='update'||action==='resend'){
   const target=await client.from('matmove_staff_access').select('*').eq('id',targetId).maybeSingle();if(target.error||!target.data)throw failure(404,'Staff account not found.');
   if(target.data.is_owner||targetId===user.id)throw failure(403,'Owner access cannot be changed here.');email=target.data.email;
   if(action==='resend'&&target.data.is_active!==true)throw failure(409,'Reactivate this staff member before sending a login email.');
  }
  if(action!=='resend'){
   const department=SECTION_GROUPS.filter(g=>g.items.some(([k])=>permissions.includes(k))).map(g=>g.label).join(', ');
   const r=await client.rpc('matmove_staff_save',{p_actor:user.id,p_id:targetId,p_email:email,p_name:fullName,p_permissions:permissions,p_department:department,p_active:action==='invite'?true:body.isActive===true,p_setup:action==='invite'});
   if(r.error)throw failure(503,'Staff authorization failed. The invite may have been sent, but access was not granted. Retry authorization for the same email; do not create a different account.');
  }
  if(action==='resend'||(action==='invite'&&!invitationSent)){
   const r=await client.auth.resetPasswordForEmail(email,{redirectTo:redirect});if(r.error)throw failure(502,'Assignments saved, but the login email could not be sent. Use Send login email to retry.');invitationSent=true;
  }
  return res.status(200).json({success:true,emailSent:invitationSent,message:action==='update'?'Staff assignments updated.':'Email accepted by Supabase for sending. The staff member can set their own password using the link.'});
 }catch(e){return res.status(e.status||500).json({error:e.status?e.message:'Staff request failed.'});}
};}
export default createHandler();
