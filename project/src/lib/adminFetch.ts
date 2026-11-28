import { requestAdminStepUp } from './adminStepUp';
import {supabase} from './supabase';

async function requireAllowed(response: Response) {
 if(response.status===401||response.status===403){
  const body=await response.clone().json().catch(()=>null);
  const message=String(body?.error||'Access denied.');
  throw new Error(message.startsWith('STEP_UP_REQUIRED: ')
   ? message.slice('STEP_UP_REQUIRED: '.length)
   : message);
 }
}

export async function adminFetch(input:RequestInfo|URL,init:RequestInit={}){
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)throw new Error('Sign in to the Admin portal.');
 const headers=new Headers(init.headers);
 headers.set('Authorization',`Bearer ${session.access_token}`);
 const response=await fetch(input,{...init,headers});
 const body=response.status===401?await response.clone().json().catch(()=>null):null;
 const message=String(body?.error||'');
 if(message.startsWith('STEP_UP_REQUIRED: ')){
  await requestAdminStepUp();
  const {data:{session:verifiedSession}}=await supabase.auth.getSession();
  if(!verifiedSession)throw new Error('Your Admin session ended during authenticator verification. Sign in again.');
  const retryHeaders=new Headers(init.headers);
  retryHeaders.set('Authorization',`Bearer ${verifiedSession.access_token}`);
  const retry=await fetch(input,{...init,headers:retryHeaders});
  await requireAllowed(retry);
  return retry;
 }
 await requireAllowed(response);
 return response;
}
