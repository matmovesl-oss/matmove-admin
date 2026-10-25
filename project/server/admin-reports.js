
import {GATEWAY_REPORTS,gatewayConfigured,gatewayScope,fetchGatewayPage} from './monime-reports.js';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {requireAdmin,failure} from './admin-auth.js';
import {PERMISSION_KEYS,canAdminAccess} from '../shared/admin-permissions.js';
const TTL=30*60*1000;
const fields=/^[a-z][a-z0-9_]*$/;
function key(env){if(!env.SUPABASE_SERVICE_ROLE_KEY)throw failure(503,'Reporting server configuration is missing.');return env.SUPABASE_SERVICE_ROLE_KEY;}
function signature(value,env){return createHmac('sha256',key(env)).update('matmove-admin-report-v1\n'+value).digest();}
export function signCursor(payload,env){const body=Buffer.from(JSON.stringify(payload)).toString('base64url');return body+'.'+signature(body,env).toString('base64url');}
export function readCursor(value,{actor,report,env,now}){
 try{
  if(typeof value!=='string'||value.length>20000)throw new Error();
  const [body,sig,...extra]=value.split('.');const supplied=Buffer.from(sig||'','base64url');const expected=signature(body,env);
  if(extra.length||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw new Error();
  const p=JSON.parse(Buffer.from(body,'base64url').toString());
  if(p.actor!==actor||p.report!==report||typeof p.after!=='string'||!p.after||p.after.length>(GATEWAY_REPORTS.some(r=>r.id===report)?2000:200)||
   !Number.isFinite(Date.parse(p.cutoff))||!Number.isFinite(p.expires)||p.expires<=now||p.expires>now+TTL+1000)throw new Error();
  return p;
 }catch{throw failure(400,'Report continuation expired or changed. Start this export again.');}
}
function rpcError(error){
 const message=String(error?.message||'');
 if(message.startsWith('FORBIDDEN:'))throw failure(403,'Access denied. Your current assignment does not allow this report.');
 if(message.startsWith('INVALID:'))throw failure(400,'Invalid report request.');
 throw failure(503,'Report source unavailable. Run ADMIN_REPORTS_SETUP.sql successfully and retry.');
}
function query(req){
 const url=new URL(req.url||'/api/admin-staff','https://admin.invalid');
 for(const name of url.searchParams.keys())if(url.searchParams.getAll(name).length!==1)throw failure(400,'Duplicate report query parameters are not allowed.');
 const result={...Object.fromEntries(url.searchParams),...(req.query||{})};
 for(const [name,value] of Object.entries(result))if(!['view','report','cursor','actor'].includes(name)||typeof value!=='string')throw failure(400,'Invalid report query.');
 return result;
}
function catalogRows(value){
 if(!Array.isArray(value)||value.some(r=>!r||typeof r.id!=='string'||!fields.test(r.id)||typeof r.title!=='string'||typeof r.permission!=='string'||
 !Array.isArray(r.columns)||!r.columns.length||r.columns.some(c=>typeof c!=='string'||!fields.test(c))||typeof r.available!=='boolean'))throw failure(503,'Report catalog was not confirmed.');
 return value;
}
export function createReportHandler({authorize=requireAdmin,env=process.env,now=()=>Date.now(),fetcher=fetch}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
   if(req.method!=='GET')throw failure(405,'Use GET for reports.');
   const q=query(req);
   if(!['report-catalog','report-page','report-overview'].includes(q.view))throw failure(400,'Unknown report view.');
   const {client,user,access}=await authorize(req,PERMISSION_KEYS,{env});
   if(q.actor&&q.actor!==user.id)throw failure(409,'Your signed-in account changed. Reopen Reports.');
   const catalog=await client.rpc('matmove_admin_report_catalog',{p_actor:user.id});if(catalog.error)rpcError(catalog.error);
   // Check authoritative assignments again; never use a requested permission as a grant.
   const reports=catalogRows(catalog.data).filter(r=>canAdminAccess(access,r.permission));
   const gatewayReports=GATEWAY_REPORTS.filter(r=>gatewayConfigured(env)&&canAdminAccess(access,r.permission)&&reports.some(d=>d.permission===r.permission)).map(r=>({...r,available:gatewayConfigured(env)}));
   if(q.view==='report-overview'){
    if(q.report||q.cursor)throw failure(400,'Invalid monitoring request.');
    const result=await client.rpc('matmove_admin_report_overview',{p_actor:user.id});
    if(result.error){
     if(String(result.error.message||'').startsWith('FORBIDDEN:'))rpcError(result.error);
     throw failure(503,'Monitoring unavailable. Run ADMIN_MONITORING_SETUP.sql successfully and retry.');
    }
    const overview=result.data;
    const count=value=>typeof value==='string'&&/^[0-9]+$/.test(value);
    if(!overview||overview.actor!==user.id||!Number.isFinite(Date.parse(overview.generatedAt))||!Array.isArray(overview.modules)||!Array.isArray(overview.recentBookings))throw failure(503,'Monitoring response was not confirmed.');
    const seen=new Set();
    for(const module of overview.modules){
     const definition=reports.find(r=>r.id===module?.id);
     if(!definition||seen.has(module.id)||module.permission!==definition.permission||!['ok','unavailable','error'].includes(module.status))throw failure(503,'Monitoring assignments were not confirmed.');
     seen.add(module.id);
     if(module.status==='ok'&&(!count(module.count)||!Array.isArray(module.groups)||module.groups.some(g=>typeof g?.value!=='string'||!count(g.count))||
      (module.completedMoney!==null&&(!['spin_entries','spin_winnings','arcade_entries','arcade_winnings'].includes(module.id)||module.completedMoney?.currency!=='SLE'||!count(module.completedMoney.minor)||!count(module.unverifiedCompleted)))))throw failure(503,'Monitoring amounts were not confirmed.');
     if(module.status!=='ok'&&(module.count!==null||module.completedMoney!==null))throw failure(503,'An unavailable module cannot return a successful count.');
    }
    if(seen.size!==reports.length)throw failure(503,'Monitoring modules were incomplete. Retry monitoring.');
    // A dashboard assignment alone never reveals another section's records.
    if(!canAdminAccess(access,'dispatch'))overview.recentBookings=[];
    if(overview.recentBookings.length>5||overview.recentBookings.some(b=>!b||typeof b.id!=='string'||Object.keys(b).some(k=>!['id','service_type','status','fare_amount','created_at','pickup_location','destination_location'].includes(k))))throw failure(503,'Recent booking data was not confirmed.');
    return res.status(200).json(overview);
   }
   if(q.view==='report-catalog'){
    if(q.report||q.cursor)throw failure(400,'Invalid catalog request.');
    return res.status(200).json({actor:user.id,reports:[...reports,...gatewayReports],generatedAt:new Date(now()).toISOString()});
   }
   if(!q.report||![...reports,...gatewayReports].some(r=>r.id===q.report))throw failure(403,'Access denied. This report has not been assigned.');
   const definition=[...reports,...gatewayReports].find(r=>r.id===q.report);if(!definition.available)throw failure(503,'This report source is not installed.');
   key(env);
   const continuation=q.cursor?readCursor(q.cursor,{actor:user.id,report:q.report,env,now:now()}):null;
   const cutoff=continuation?.cutoff||new Date(now()).toISOString();
   if(definition.source==='gateway'){
    const scope=gatewayScope(env);
    if(continuation&&continuation.scope!==scope)throw failure(400,'Gateway configuration changed. Start the export again.');
    const page=await fetchGatewayPage({report:q.report,after:continuation?.after||null,env,fetcher});
    const cursor=page.complete?null:signCursor({actor:user.id,report:q.report,after:page.nextAfter,cutoff,scope,expires:continuation?.expires||now()+TTL},env);
    return res.status(200).json({actor:user.id,report:q.report,source:'gateway',columns:definition.columns,rows:page.rows,cursor,complete:page.complete,cutoff,note:definition.note,
     consistency:'Gateway records reflect the time each page was read; the export start time is not a creation cutoff.'});
   }
   const result=await client.rpc('matmove_admin_report_page',{p_actor:user.id,p_report:q.report,p_after:continuation?.after||null,p_cutoff:cutoff,p_limit:250});
   if(result.error)rpcError(result.error);
   const page=result.data;
   if(!page||page.report!==q.report||!Array.isArray(page.rows)||page.rows.length>250||
    JSON.stringify(page.columns)!==JSON.stringify(definition.columns)||typeof page.complete!=='boolean'||
    !Number.isFinite(Date.parse(page.cutoff))||Date.parse(page.cutoff)!==Date.parse(cutoff)||
    (page.complete?page.nextAfter!==null:typeof page.nextAfter!=='string'||!page.nextAfter||page.nextAfter===continuation?.after)||
    page.rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(c=>!definition.columns.includes(c))||
     Object.values(row).some(v=>v!==null&&typeof v==='object')))throw failure(503,'Report page was not confirmed. No complete export is available.');
   const cursor=page.complete?null:signCursor({actor:user.id,report:q.report,after:page.nextAfter,cutoff,expires:continuation?.expires||now()+TTL},env);
   return res.status(200).json({actor:user.id,report:q.report,columns:page.columns,rows:page.rows,cursor,complete:page.complete,cutoff,
    consistency:page.consistency,note:definition.note});
  }catch(error){return res.status(error.status||500).json({error:error.status?error.message:'Report request failed.'});}
 };
}
