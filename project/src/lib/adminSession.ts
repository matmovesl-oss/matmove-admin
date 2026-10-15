
import type { AdminAccess } from './adminAccess';

type RpcClient = {rpc: (name: string) => PromiseLike<{data: unknown; error: {code?: string; message: string} | null}>};
function verifiedRow(value: unknown, userId: string): AdminAccess | null {
  if(value===null)return null;
  if(!value||typeof value!=='object')throw new Error('Invalid staff permission response.');
  const row=value as AdminAccess;
  if(row.id!==userId||typeof row.is_active!=='boolean'||typeof row.is_owner!=='boolean'||!Array.isArray(row.permissions))throw new Error('Staff permissions did not match the signed-in account.');
  return row;
}
export async function loadAdminSession(client: RpcClient, session: {user: {id: string}; access_token: string}, fetcher: typeof fetch = fetch): Promise<AdminAccess | null> {
  let code='NETWORK_ERROR';
  try {
    const result=await client.rpc('matmove_admin_me');
    if(!result.error)return verifiedRow(result.data,session.user.id);
    code=result.error.code||'RPC_ERROR';
  } catch { /* Recheck through the authenticated server, never through a local role fallback. */ }
  const response=await fetcher('/api/admin-staff?view=me',{
    method:'GET',cache:'no-store',headers:{Authorization:`Bearer ${session.access_token}`},
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok||!body)throw new Error(body?.error||`Staff permissions unavailable (${code}). Run STAFF_ACCESS_REPAIR.sql in the same Supabase project used by Admin. Check that the browser and server Supabase URLs match.`);
  return verifiedRow(body.access,session.user.id);
}
