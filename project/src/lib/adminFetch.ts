
import {supabase} from './supabase';
export async function adminFetch(input:RequestInfo|URL,init:RequestInit={}){
 const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Sign in to the Admin portal.');
 const headers=new Headers(init.headers);headers.set('Authorization',`Bearer ${session.access_token}`);
 const response=await fetch(input,{...init,headers});
 if(response.status===401||response.status===403){const body=await response.clone().json().catch(()=>null);throw new Error(body?.error||'Access denied.');}
 return response;
}
