import {createClient} from '@supabase/supabase-js';
import {canAdminAccess} from '../shared/admin-permissions.js';

export const failure=(status,message)=>Object.assign(new Error(message),{status});

export function serverClient(env=process.env,factory=createClient){
 const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL;
 if(!url||!env.SUPABASE_SERVICE_ROLE_KEY)throw failure(503,'Admin server configuration missing.');
 return factory(url,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}

export async function requireAdmin(req,keys,{client,env=process.env,allowMfaSetup=false}={}){
 const token=/^Bearer\s+(\S+)$/i.exec(req.headers.authorization||'')?.[1];
 if(!token)throw failure(401,'Sign in to the Admin portal.');

 client=client||serverClient(env);
 const auth=await client.auth.getUser(token);
 if(auth.error||!auth.data?.user)throw failure(401,'Session expired. Sign in again.');

 // The self-session bootstrap is read-only and returns only the caller's own
 // staff record. It is needed to let a verified staff member enroll MFA.
 // Every other Admin API requires both a verified TOTP factor and an AAL2 JWT.
 if(!allowMfaSetup){
  if(typeof client.auth.getClaims!=='function')throw failure(503,'Admin MFA verification is unavailable. Update the Supabase client before continuing.');
  const claimsResult=await client.auth.getClaims(token);
  const claims=claimsResult.data?.claims;
  if(claimsResult.error||!claims||claims.sub!==auth.data.user.id)throw failure(401,'The Admin session could not be securely verified.');

  const factorsResult=await client.auth.admin.mfa.listFactors({userId:auth.data.user.id});
  if(factorsResult.error)throw failure(503,'Admin authenticator status could not be verified. Try again.');
  const factors=Array.isArray(factorsResult.data?.factors)?factorsResult.data.factors:[];
  const hasVerifiedTotp=factors.some(factor=>factor.factor_type==='totp'&&factor.status==='verified');
  if(!hasVerifiedTotp)throw failure(428,'MFA_SETUP_REQUIRED: Set up an authenticator app before using Admin.');
  // Supabase orders AMR entries with the most recent authentication method first.
  // Require the current AAL2 session to have been completed using TOTP, not phone MFA.
  const latestMethod=Array.isArray(claims.amr)?claims.amr[0]?.method:null;
  if(claims.aal!=='aal2'||latestMethod!=='totp')throw failure(428,'MFA_REQUIRED: Verify your authenticator app code before using Admin.');
 }

 const result=await client.rpc('matmove_admin_access',{p_id:auth.data.user.id});
 if(result.error)throw failure(503,`Unable to verify Admin permissions (${result.error.code||'RPC_ERROR'}). Run STAFF_ACCESS_REPAIR.sql in the Admin Supabase project and refresh.`);
 const row=result.data;
 if(!row||row.id!==auth.data.user.id||!keys.some(key=>canAdminAccess(row,key)))throw failure(403,'Access denied. This assignment has not been granted.');
 return {client,user:auth.data.user,access:row};
}
