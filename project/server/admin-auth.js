import {createClient} from '@supabase/supabase-js';
import {canAdminAccess} from '../shared/admin-permissions.js';
export const failure=(status,message)=>Object.assign(new Error(message),{status});
export function serverClient(env=process.env,factory=createClient){
 const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL;
 if(!url||!env.SUPABASE_SERVICE_ROLE_KEY)throw failure(503,'Admin server configuration missing.');
 return factory(url,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
export function readVerifiedClaims(token){
 const parts=String(token||'').split('.');
 if(parts.length!==3)throw failure(401,'Admin sign-in token is invalid.');
 let claims;
 try{claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));}catch{throw failure(401,'Admin sign-in token is invalid.');}
 if(!claims||typeof claims!=='object'||typeof claims.sub!=='string')throw failure(401,'Admin sign-in token is invalid.');
 return claims;
}
export async function requireAdmin(req,keys,{client,env=process.env,maxTotpAgeSeconds}={}){
 const token=/^Bearer\s+(\S+)$/i.exec(req.headers.authorization||'')?.[1];
 if(!token)throw failure(401,'Sign in to the Admin portal.');
 client=client||serverClient(env);
 const auth=await client.auth.getUser(token);
 if(auth.error||!auth.data?.user)throw failure(401,'Session expired. Sign in again.');

 // getUser() asks Supabase Auth to validate the bearer token. Only then do we
 // inspect its signed claims for the required TOTP-authenticated AAL2 session.
 const claims=readVerifiedClaims(token);
 const totpMethod=Array.isArray(claims.amr)?claims.amr.find(method=>method?.method==='totp'):null;
 if(claims.sub!==auth.data.user.id||claims.aal!=='aal2'||!totpMethod){
  throw failure(401,'Complete password and authenticator verification to access MatMove Admin.');
 }
 if(maxTotpAgeSeconds!==undefined){
  const timestamp=Number(totpMethod.timestamp);
  const now=Math.floor(Date.now()/1000);
  if(!Number.isFinite(timestamp)||timestamp<=0||timestamp>now+60||now-timestamp>maxTotpAgeSeconds){
   throw failure(401,'For your security, verify your MatMove Admin authenticator again before this sensitive action.');
  }
 }
 const sessionId=claims.session_id;
 if(typeof sessionId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)){
  throw failure(401,'Your Admin sign-in has no valid session identifier. Sign in again.');
 }
 const liveSession=await client.rpc('matmove_admin_server_session_valid',{
  p_user_id:auth.data.user.id,
  p_session_id:sessionId,
 });
 if(liveSession.error)throw failure(503,'Admin session verification is temporarily unavailable. No Admin action was permitted.');
 if(liveSession.data!==true)throw failure(401,'Your Admin session has expired or been revoked. Sign in again.');

 const result=await client.rpc('matmove_admin_access',{p_id:auth.data.user.id});
 if(result.error)throw failure(503,`Unable to verify Admin permissions (${result.error.code||'RPC_ERROR'}). Run STAFF_ACCESS_REPAIR.sql in the Admin Supabase project and refresh.`);
 const row=result.data;
 if(!row||row.id!==auth.data.user.id||!keys.some(key=>canAdminAccess(row,key))){
  throw failure(403,'Access denied. This assignment has not been granted.');
 }
 return {client,user:auth.data.user,access:row,sessionId,claims};
}
