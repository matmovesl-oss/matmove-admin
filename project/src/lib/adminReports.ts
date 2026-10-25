
import {adminFetch} from './adminFetch';
import {supabase} from './supabase';
export type ReportDefinition={id:string;title:string;permission:string;columns:string[];available:boolean;note:string;source?:'database'|'gateway'};
export type ReportRow=Record<string,string|number|boolean|null>;
export type CompleteReport={actor:string;report:string;columns:string[];rows:ReportRow[];cutoff:string;note:string;source?:'database'|'gateway';complete:true};
async function identity(expected:string){
 const {data,error}=await supabase.auth.getSession();
 if(error||data.session?.user.id!==expected)throw new Error('Your signed-in account changed. Reopen Reports.');
}
async function get(parameters:Record<string,string>,userId:string,signal?:AbortSignal){
 await identity(userId);
 const response=await adminFetch('/api/admin-staff?'+new URLSearchParams({...parameters,actor:userId}),{signal});
 const result=await response.json();
 if(!response.ok)throw new Error(result.error||'Report request failed.');
 await identity(userId);
 if(result.actor!==userId)throw new Error('Report identity was not confirmed.');
 return result;
}
export async function loadReportCatalog(userId:string,signal?:AbortSignal):Promise<ReportDefinition[]>{
 const body=await get({view:'report-catalog'},userId,signal);
 if(!Array.isArray(body.reports))throw new Error('Report catalog unavailable.');
 return body.reports;
}
// Returns ONLY after the server confirms the final page. A failed, cancelled or
// revoked request never returns partial rows as a complete report.
export async function loadCompleteReport({userId,report,signal,onProgress}: {
 userId:string;report:ReportDefinition;signal?:AbortSignal;onProgress?:(count:number)=>void;
}):Promise<CompleteReport>{
 const rows:ReportRow[]=[];const cursors=new Set<string>();const ids=new Set<string>();
 const source=report.source||'database';let cursor='';let cutoff='';let note='';
 for(;;){
  if(signal?.aborted)throw new DOMException('Export cancelled.','AbortError');
  const page=await get({view:'report-page',report:report.id,...(cursor?{cursor}:{})},userId,signal);
  if((page.source||'database')!==source||page.report!==report.id||JSON.stringify(page.columns)!==JSON.stringify(report.columns)||!Array.isArray(page.rows)||
   typeof page.complete!=='boolean'||!Number.isFinite(Date.parse(page.cutoff))||
   (cutoff&&page.cutoff!==cutoff)||page.rows.some((r:unknown)=>!r||typeof r!=='object'||Array.isArray(r)))throw new Error('Report page changed. Start this export again.');
  if(page.complete?page.cursor!==null:typeof page.cursor!=='string'||!page.cursor||cursors.has(page.cursor)||!page.rows.length)throw new Error('Report continuation was not confirmed.');
  if(source==='gateway'){
   for(const row of page.rows){if(typeof row.id!=='string'||!row.id||ids.has(row.id))throw new Error('Gateway returned duplicate or invalid record IDs. Restart the export; no complete CSV was generated.');ids.add(row.id);}
  }
  cutoff=page.cutoff;note=page.note||'';rows.push(...page.rows);onProgress?.(rows.length);
  if(signal?.aborted)throw new DOMException('Export cancelled.','AbortError');
  // A practical browser memory limit is explicit, never silent truncation.
  if(rows.length>1000000)throw new Error('This report exceeds the browser export limit. No partial CSV was generated.');
  if(page.complete){await identity(userId);return {actor:userId,report:report.id,columns:report.columns,rows,cutoff,note,source,complete:true};}
  cursor=page.cursor;cursors.add(cursor);
  if(source==='gateway')await pause(250,signal);
 }
}

function pause(ms:number,signal?:AbortSignal):Promise<void>{
 if(signal?.aborted)return Promise.reject(new DOMException('Export cancelled.','AbortError'));
 return new Promise((resolve,reject)=>{
  const aborted=()=>{clearTimeout(timer);signal?.removeEventListener('abort',aborted);reject(new DOMException('Export cancelled.','AbortError'));};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',aborted);resolve();},ms);
  signal?.addEventListener('abort',aborted,{once:true});
 });
}
