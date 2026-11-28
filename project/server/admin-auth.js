import {createClient} from '@supabase/supabase-js';
import {canAdminAccess} from '../shared/admin-permissions.js';

export const failure=(status,message)=>Object.assign(new Error(message),{status});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function serverClient(env=process.env,factory=createClient){
 const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL;
 if(!url||!env.SUPABASE_SERVICE_ROLE_KEY)throw failure(503,'Admin server configuration missing.');
 return factory(url,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}

function verifiedClaims(token){
 try{
  const parts=token.split('.');
  if(parts.length!==3)return null;
  return JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
 }catch{return null;}
}

export async function requireAdmin(req,keys,{client,env=process.env}={}){
 const token=/^Bearer\s+(\S+)$/i.exec(req.headers.authorization||'')?.[1];
 if(!token)throw failure(401,'Sign in to the Admin portal.');
 client=client||serverClient(env);

 // Supabase verifies the JWT signature and user status before its claims are trusted.
 const auth=await client.auth.getUser(token);
 if(auth.error||!auth.data?.user)throw failure(401,'Session expired. Sign in again.');
 const claims=verifiedClaims(token);
 if(!claims||claims.sub!==auth.data.user.id||claims.aal!=='aal2'){
  throw failure(403,'Complete password and authenticator verification before accessing MatMove Admin.');
 }
 const sessionId=claims.session_id;
 if(typeof sessionId!=='string'||!uuid.test(sessionId)){
  throw failure(401,'Your Admin session could not be identified. Sign in again.');
 }

 // A valid access JWT is not sufficient after a staff removal, explicit
 // device revocation, the 15-minute idle limit, or the 24-hour hard limit.
 const registered=await client.from('matmove_admin_sessions')
  .select('session_id,user_id,started_at,last_activity_at,revoked_at')
  .eq('session_id',sessionId).maybeSingle();
 if(registered.error)throw failure(503,'Unable to verify the Admin device session. Please retry.');
 const row=registered.data;
 if(!row||row.user_id!==auth.data.user.id||row.revoked_at){
  throw failure(401,'This Admin device session has been revoked. Sign in again.');
 }
 const now=Date.now();
 const started=Date.parse(row.started_at);
 const lastActivity=Date.parse(row.last_activity_at);
 if(!Number.isFinite(started)||now-started>=24*60*60*1000){
  throw failure(401,'The 24-hour maximum Admin session has ended. Sign in again.');
 }
 if(!Number.isFinite(lastActivity)||now-lastActivity>=15*60*1000){
  throw failure(401,'Admin access expired after 15 minutes of inactivity. Sign in again.');
 }

 const result=await client.rpc('matmove_admin_access',{p_id:auth.data.user.id});
 if(result.error)throw failure(503,`Unable to verify Admin permissions (${result.error.code||'RPC_ERROR'}). Run STAFF_ACCESS_REPAIR.sql in the Admin Supabase project and refresh.`);
 const access=result.data;
 if(!access||access.id!==auth.data.user.id||access.is_active!==true||access.removed_at||!keys.some(key=>canAdminAccess(access,key))){
  throw failure(403,'Access denied. This assignment has not been granted or has been removed.');
 }
 return {client,user:auth.data.user,access,sessionId};
}
