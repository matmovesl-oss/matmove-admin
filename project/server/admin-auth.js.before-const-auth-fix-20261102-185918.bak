

import {createClient} from '@supabase/supabase-js';
import {canAdminAccess} from '../shared/admin-permissions.js';
export const failure=(status,message)=>Object.assign(new Error(message),{status});
export function serverClient(env=process.env,factory=createClient){const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL;if(!url||!env.SUPABASE_SERVICE_ROLE_KEY)throw failure(503,'Admin server configuration missing.');return factory(url,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});}
export async function requireAdmin(req,keys,{client,env=process.env}={}){
 const token=/^Bearer\s+(\S+)$/i.exec(req.headers.authorization||'')?.[1];if(!token)throw failure(401,'Sign in to the Admin portal.');
 client=client||serverClient(env);const auth=await client.auth.getUser(token);if(auth.error||!auth.data?.user)throw failure(401,'Session expired. Sign in again.');
 const result=await client.rpc('matmove_admin_access',{p_id:auth.data.user.id});if(result.error)throw failure(503,`Unable to verify Admin permissions (${result.error.code||'RPC_ERROR'}). Run STAFF_ACCESS_REPAIR.sql in the Admin Supabase project and refresh.`);
 const row=result.data;if(!row||row.id!==auth.data.user.id||!keys.some(key=>canAdminAccess(row,key)))throw failure(403,'Access denied. This assignment has not been granted.');
 return {client,user:auth.data.user,access:row};
}
