
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { spinOdds, spinEconomics, validateSpinSectors, type SpinSector } from '../../shared/spin-rules.js';

const money=(n:number)=>`SLE ${(n/100).toFixed(2)}`;
type Snapshot={config:{id:number;enabled:boolean;sectors:SpinSector[]};reservedMinor:number;entryReceivedMinor:number;winsPaidMinor:number;winsOwedMinor:number;rounds:any[];receipts:any[];access:any[]};
function GameSettings({selectedPlayer}: {selectedPlayer: string}){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [sectors,setSectors]=useState<SpinSector[]>([]);
  const [enabled,setEnabled]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [account,setAccount]=useState<{id:string;balance:number|null}|null>(null);
  const [accountError,setAccountError]=useState('');
  const [userId,setUserId]=useState(selectedPlayer);
  const [verified,setVerified]=useState(false);
  const [approved,setApproved]=useState(false);
  const [limit,setLimit]=useState('10');
  const [receiptRound,setReceiptRound]=useState('');
  const [receiptIndex,setReceiptIndex]=useState('0');
  const [providerId,setProviderId]=useState('');
  const refresh=useCallback(async()=>{
    const {data,error}=await supabase.rpc('matmove_spin_admin_snapshot');
    if(error)throw new Error(error.message);
    setSnapshot(data);setEnabled(data.config.enabled);setSectors(data.config.sectors);
    try{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session)throw new Error('Sign in again.');
      const response=await fetch('/api/admin-wallet-balances',{headers:{Authorization:`Bearer ${session.access_token}`}});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'Live Spin balance unavailable.');
      const id=body.platform?.spinAccountId;
      const found=body.accounts?.find((a:any)=>a.id===id);
      const amount=found?.balance?.available;
      if(!id||!found||found.currency!=='SLE'||amount?.currency!=='SLE'||!Number.isSafeInteger(amount.value))throw new Error('Set MONIME_SPIN_ACCOUNT_ID in the Admin Vercel project and verify its SLE account.');
      setAccount({id,balance:amount.value});setAccountError('');
    }catch(e){setAccount(null);setAccountError(e instanceof Error?e.message:'Balance unavailable.');}
  },[]);
  useEffect(()=>{void refresh().catch(e=>setError(e.message));},[refresh]);
  async function execute(action:()=>Promise<void>){
    if(busy)return;setBusy(true);setError('');setNotice('');
    try{await action();await refresh();setNotice('Saved. Existing purchased-round rules were retained.');}
    catch(e){setError(e instanceof Error?e.message:'Unable to save game settings.');}
    finally{setBusy(false);}
  }
  let economics:ReturnType<typeof spinEconomics>|null=null;
  let odds:ReturnType<typeof spinOdds>=[];
  let validation='';
  try{if(sectors.length){economics=spinEconomics(sectors);odds=spinOdds(sectors);}}
  catch(e){validation=e instanceof Error?e.message:'Invalid wheel.';}
  function change(i:number,patch:Partial<SpinSector>){setSectors(old=>old.map((s,j)=>i===j?{...s,...patch}:s));}
  return <AdminLayout title="Games — Spin & Win" subtitle="Configure future rounds, player eligibility, treasury and verified receipts">
    <GameTabs active="settings" />
    {error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    {notice&&<p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-700">{notice}</p>}
    <button disabled={busy} onClick={()=>void execute(refresh)} className="mb-5 rounded-xl border bg-white px-5 py-3 font-bold">Refresh saved settings and receipts</button>
    {!snapshot?<p>Loading game setup…</p>:<div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[['Entry fees received',snapshot.entryReceivedMinor],['Prizes credited',snapshot.winsPaidMinor],['Prizes still owed',snapshot.winsOwedMinor],['Reserved prize capacity',snapshot.reservedMinor]].map(([label,value])=><div key={String(label)} className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{money(Number(value))}</p></div>)}
      </div>
      <div className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Dedicated Spin Account</h2>{account?<><p className="mt-2 break-all font-mono text-sm">{account.id}</p><p className="mt-2">Live available balance: <b>{money(account.balance!)}</b></p></>:<p className="mt-2 text-red-700">{accountError||'Balance unavailable.'}</p>}<p className="mt-3 border-t pt-3 text-sm text-slate-500">SLE 60 is reserved for each open paid round before accepting its SLE 5 entry. Fund this separate account; escrow funds are not used. Entries minus credited prizes: {money(snapshot.entryReceivedMinor-snapshot.winsPaidMinor)} before provider fees and unpaid liabilities.</p></div>
      <div className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Wheel configuration</h2><p className="mt-2 text-sm text-slate-600">Every number has equal probability. All five prizes must appear. Publishing creates a new version; existing rounds keep their stored rules.</p>
        <label className="my-4 flex items-center gap-3"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Allow new entries (customer server MATMOVE_SPIN_ENABLED must also be true)</label>
        {economics&&<div className="mb-4 rounded-xl bg-slate-50 p-4"><p>Average prize per three-spin round: <b>{money(economics.expectedRoundPrizeMinor)}</b></p><p>Expected margin per SLE 5 entry, before provider fees: <b>{money(economics.expectedMarginMinor)}</b></p>{economics.expectedMarginMinor<=0&&<p className="mt-2 text-red-700">This configuration pays as much as or more than the entry fee on average.</p>}</div>}
        {validation&&<p role="alert" className="mb-3 text-red-700">{validation}</p>}
        <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Wheel number</th><th>Prize</th><th>Action</th></tr></thead><tbody>{sectors.map((s,i)=><tr key={i} className="border-t"><td className="py-2"><input aria-label={`Wheel number ${i+1}`} value={s.digit} onChange={e=>change(i,{digit:e.target.value})} className="w-24 rounded-lg border p-2"/></td><td><select aria-label={`Prize ${i+1}`} value={s.prizeMinor} onChange={e=>change(i,{prizeMinor:Number(e.target.value)})} className="rounded-lg border p-2">{[100,500,1000,1500,2000].map(p=><option key={p} value={p}>{money(p)}</option>)}</select></td><td><button onClick={()=>setSectors(old=>old.filter((_,j)=>i!==j))} className="text-red-700">Remove</button></td></tr>)}</tbody></table></div>
        <div className="mt-4 flex flex-wrap gap-3 border-t pt-4"><button disabled={sectors.length>=120} onClick={()=>{const used=new Set(sectors.map(s=>s.digit));let n=0;while(used.has(String(n)))n++;setSectors(old=>[...old,{digit:String(n),prizeMinor:100}]);}} className="rounded-xl border px-4 py-3">Add number</button><button disabled={busy||!!validation||!economics} onClick={()=>void execute(async()=>{const clean=validateSpinSectors(sectors);const {error}=await supabase.rpc('matmove_spin_admin_save',{p_expected:snapshot.config.id,p_enabled:enabled,p_sectors:clean});if(error)throw error;})} className="rounded-xl bg-purple-700 px-5 py-3 font-bold text-white disabled:opacity-50">Publish future-round settings</button></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-5">{odds.map(o=><p key={o.prizeMinor} className="rounded-lg bg-slate-50 p-3 text-sm">{money(o.prizeMinor)}<br/>{(o.probability*100).toFixed(4)}%</p>)}</div>
      </div>
      <div className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Player access</h2><p className="mt-2 text-sm text-slate-600">Approve only after verifying adult identity and completing customer KYC. This controls entry eligibility and daily spend; it never changes prize chances.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><input value={userId} onChange={e=>setUserId(e.target.value)} placeholder="Customer profile UUID" className="rounded-xl border p-3"/><label>Daily entry limit (SLE)<input type="number" min="5" max="100" step="5" value={limit} onChange={e=>setLimit(e.target.value)} className="ml-3 w-24 rounded-xl border p-3"/></label></div><label className="mt-3 flex gap-3"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/>Adult identity verified (18+)</label><label className="mt-3 flex gap-3"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>Allow new game entries</label><button disabled={busy} onClick={()=>void execute(async()=>{const {error}=await supabase.rpc('matmove_spin_admin_access',{p_user:userId.trim(),p_verified_adult:verified,p_approved:approved,p_daily_limit:Math.round(Number(limit)*100)});if(error)throw error;})} className="mt-4 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white">Save player access</button>
        <div className="mt-4 max-h-60 overflow-auto border-t pt-3 text-sm">{snapshot.access.map(a=><button key={a.user_id} className="block w-full border-b py-3 text-left" onClick={()=>{setUserId(a.user_id);setVerified(a.verified_adult);setApproved(a.approved);setLimit(String(Number(a.daily_limit_minor)/100));}}>{a.user_id} · {a.approved?'approved':'paused'} · daily {money(Number(a.daily_limit_minor))}</button>)}</div>
      </div>
      <div className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Receipt recovery</h2><p className="mt-2 text-sm text-slate-600">For uncertain transfers, locate the existing Monime receipt using the stored request key and attach its ID. This does not create or resend a transfer. Status reconciliation checks amount and both accounts before accepting the receipt.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><input value={receiptRound} onChange={e=>setReceiptRound(e.target.value)} placeholder="Game UUID" className="rounded-xl border p-3"/><select value={receiptIndex} onChange={e=>setReceiptIndex(e.target.value)} className="rounded-xl border p-3"><option value="0">Entry</option>{[1,2,3].map(i=><option key={i} value={i}>Spin {i}</option>)}</select><input value={providerId} onChange={e=>setProviderId(e.target.value)} placeholder="Actual Monime trn-... ID" className="rounded-xl border p-3"/></div><button disabled={busy} onClick={()=>void execute(async()=>{const {error}=await supabase.rpc('matmove_spin_admin_receipt',{p_id:receiptRound.trim(),p_index:Number(receiptIndex),p_provider:providerId.trim()});if(error)throw error;})} className="mt-4 rounded-xl border px-5 py-3 font-bold">Attach existing receipt for verification</button></div>
      <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">Use Players, Entry payments and Winnings in the Games menu for the complete paginated history.</p>
    </div>}
  </AdminLayout>;
}

const gameTabs = [['overview','Overview'],['players','Players'],['entries','Entry payments'],['winnings','Winnings'],['settings','Settings & access']] as const;
type GameTab = typeof gameTabs[number][0];
function GameTabs({active}:{active:GameTab}){
  return <nav aria-label="Games sections" className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-purple-200 bg-white p-3">
    {gameTabs.map(([tab,label])=><Link key={tab} to={`/games?tab=${tab}`} aria-current={active===tab?'page':undefined} className={`rounded-xl px-4 py-2 text-sm font-bold ${active===tab?'bg-purple-700 text-white':'bg-slate-50 text-slate-600 hover:bg-purple-50'}`}>{label}</Link>)}
  </nav>;
}
export function GamesPage(){
  const [params]=useSearchParams();
  const requested=params.get('tab')||'overview';
  const tab:GameTab=gameTabs.some(([key])=>key===requested)?requested as GameTab:'overview';
  const player=params.get('player')||'';
  if(tab==='settings')return <GameSettings key={player} selectedPlayer={player}/>;
  return <AdminLayout title={`Games — ${gameTabs.find(([key])=>key===tab)?.[1]}`} subtitle="Individual players, entry payments, winnings and recorded game activity">
    <GameTabs active={tab}/>
    <GameReports key={`${tab}:${player}`} tab={tab} player={player}/>
  </AdminLayout>;
}

type ReportData={view:string;page:number;pageSize:number;total:number;rows:any[];stats:Record<string,number>;asOf:string};
const stamp=(value:string|null|undefined)=>value?new Date(value).toLocaleString():'Not recorded';
function StatusTag({value}:{value:string}){
  const style=value==='completed'?'bg-emerald-100 text-emerald-800':value==='failed'||value==='review_required'?'bg-red-100 text-red-800':'bg-amber-100 text-amber-800';
  return <span className={`inline-block rounded-lg px-2 py-1 text-xs font-bold ${style}`}>{value.replace(/_/g,' ')}</span>;
}
function PlayerName({row}:{row:any}){
  return <div><Link to={`/games?tab=players&player=${row.user_id}`} className="font-bold text-purple-700 hover:underline">{row.customer_name}</Link><p className="mt-1 text-xs text-slate-500">{row.customer_email||row.customer_role||'Customer'}</p><p className="mt-1 break-all font-mono text-[10px] text-slate-400">{row.user_id}</p></div>;
}
function GameReports({tab,player}:{tab:Exclude<GameTab,'settings'>;player:string}){
  const view=tab==='overview'?'rounds':tab;
  const [page,setPage]=useState(1);
  const [searchDraft,setSearchDraft]=useState('');
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('all');
  const [envelope,setEnvelope]=useState<{key:string;data:ReportData}|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const sequence=useRef(0);
  const inFlight=useRef(false);
  const key=JSON.stringify([view,page,search,status,player]);
  const data=envelope?.key===key?envelope.data:null;
  const load=useCallback(async()=>{
    const current=++sequence.current;
    inFlight.current=true;setLoading(true);setError('');
    try{
      const {data,error}=await supabase.rpc('matmove_spin_admin_report',{p_view:view,p_page:page,p_search:search,p_status:status,p_player:player||null});
      if(error)throw new Error(error.message);
      if(current===sequence.current)setEnvelope({key,data});
    }catch(e){if(current===sequence.current)setError(e instanceof Error?e.message:'Game reports unavailable.');}
    finally{if(current===sequence.current){inFlight.current=false;setLoading(false);}}
  },[view,page,search,status,player,key]);
  useEffect(()=>{
    void load();
    const interval=setInterval(()=>{if(!document.hidden&&!inFlight.current)void load();},15000);
    return()=>{clearInterval(interval);sequence.current++;inFlight.current=false;};
  },[load]);
  const filters=tab==='players'?['all','paid','unpaid','eligible','paused','in_progress']:tab==='overview'?['all','entry_pending','active','win_pending','completed','failed','review_required']:['all','pending','processing','completed','failed','review_required'];
  const stats=data?.stats;
  const pages=data?Math.max(1,Math.ceil(data.total/data.pageSize)):1;
  const count=(field:string)=>stats?Number(stats[field]).toLocaleString():'—';
  const amount=(field:string)=>stats?money(Number(stats[field])):'—';
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Unique paying players',count('paidPlayers')],['Completed entries',count('paidEntries')],
        ['Entry fees received',amount('entryReceivedMinor')],['Winnings credited',amount('winsPaidMinor')],
        ['Unpaid prize liabilities',amount('winsOwedMinor')],['Players with open paid rounds',count('playersWithOpenPaidRounds')],
        ['Entry payments processing',count('pendingEntries')],['Rounds needing review',count('reviewRounds')],
      ].map(([label,value])=><div key={label} className="rounded-2xl border border-purple-100 bg-white p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p></div>)}
    </div>
    <p className="text-xs text-slate-500">Summary totals cover all recorded game activity. They do not change with table filters. Open paid rounds describe unfinished games, not whether a person is online. Monetary totals count completed receipts; pending prizes remain liabilities.</p>
    {tab==='overview'&&<div className="rounded-2xl border bg-purple-950 p-5 text-white"><h2 className="text-xl font-bold text-amber-300">Game cash flow</h2><div className="mt-4 grid gap-4 sm:grid-cols-3"><div><p className="text-sm text-purple-200">Customer → Spin Account</p><p className="mt-1 text-2xl font-bold">{amount('entryReceivedMinor')}</p></div><div><p className="text-sm text-purple-200">Spin Account → Customers</p><p className="mt-1 text-2xl font-bold">{amount('winsPaidMinor')}</p></div><div><p className="text-sm text-purple-200">Entries minus credited prizes</p><p className="mt-1 text-2xl font-bold">{stats?money(stats.entryReceivedMinor-stats.winsPaidMinor):'—'}</p></div></div><p className="mt-4 border-t border-white/20 pt-3 text-sm text-purple-200">This difference is before provider fees and unpaid prize liabilities. Reserved prize capacity: {amount('reservedMinor')}. View the live provider account balance in Settings & access.</p></div>}
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{tab==='overview'?'All game rounds':tab==='players'?'Game players':tab==='entries'?'Entry payments — customer to Spin':'Winnings — Spin to customer'}</h2><button disabled={loading} onClick={()=>void load()} className="rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-50">{loading?'Refreshing…':'Refresh'}</button></div>
      {player&&<div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-purple-50 p-3 text-sm"><span className="break-all">Selected customer: {player}</span><Link to={`/games?tab=${tab}`} className="font-bold text-purple-700">Show all customers</Link></div>}
      <form onSubmit={e=>{e.preventDefault();setSearch(searchDraft.trim());setPage(1);}} className="mt-4 flex flex-wrap gap-3 border-t pt-4"><input aria-label="Search game records" value={searchDraft} onChange={e=>setSearchDraft(e.target.value)} maxLength={100} placeholder="Search name, email, customer or receipt ID" className="min-w-0 flex-1 rounded-xl border px-3 py-2"/><button className="rounded-xl bg-purple-700 px-4 py-2 font-bold text-white">Search</button><select aria-label="Report status" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}} className="rounded-xl border px-3 py-2">{filters.map(f=><option key={f} value={f}>{f==='all'?'All statuses':f.replace(/_/g,' ')}</option>)}</select></form>
      {error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-red-700">{error} {data?'The displayed report is the last successful refresh.':''}</p>}
      {!data?<p role="status" className="py-8 text-slate-500">{loading?'Loading recorded game activity…':'Report unavailable.'}</p>:<>
        <p className="mt-3 text-xs text-slate-500">{data.total.toLocaleString()} matching records · Recorded data refreshed {stamp(data.asOf)} · Auto refresh every 15 seconds</p>
        {!data.rows.length?<p className="py-8 text-slate-500">No matching game records.</p>:<div className="mt-4 overflow-x-auto">
          {tab==='players'?<table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Player</th><th>Game access</th><th>Paid entries</th><th>Entry total</th><th>Winnings credited</th><th>Still owed</th><th>Paid rounds open</th><th>History</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.user_id} className="border-t align-top"><td className="p-3"><PlayerName row={row}/><p className="mt-2 text-xs text-slate-500">First paid entry: {stamp(row.first_paid_at)}</p></td><td className="py-3"><p>{row.approved&&row.verified_adult?'Eligible':'Paused / not approved'}</p><p className="mt-1 text-xs text-slate-500">{row.daily_limit_minor===null?'No access record':`${money(Number(row.daily_limit_minor))} daily limit`}</p></td><td className="py-3">{row.paid_entries}<p className="mt-1 text-xs text-slate-500">{row.completed_rounds} finished rounds</p></td><td className="py-3 font-bold text-emerald-700">{money(Number(row.entry_paid_minor))}</td><td className="py-3 font-bold text-purple-700">{money(Number(row.wins_paid_minor))}</td><td className="py-3 text-amber-700">{money(Number(row.wins_owed_minor))}</td><td className="py-3">{row.open_paid_rounds}</td><td className="space-y-2 py-3"><Link className="block font-bold text-emerald-700" to={`/games?tab=entries&player=${row.user_id}`}>Entry payments</Link><Link className="block font-bold text-purple-700" to={`/games?tab=winnings&player=${row.user_id}`}>Winnings</Link><Link className="block text-slate-600" to={`/games?tab=settings&player=${row.user_id}`}>Manage access</Link></td></tr>)}</tbody></table>
          :tab==='overview'?<table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Player / round</th><th>Entry payment</th><th>Round status</th><th>Spins</th><th>Prizes credited</th><th>Still owed</th><th>Details</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.id} className="border-t align-top"><td className="p-3"><PlayerName row={row}/><p className="mt-2 break-all font-mono text-[10px] text-slate-500">Game: {row.id}</p></td><td className="py-3"><StatusTag value={row.entry_status||'not recorded'}/><p className="mt-2">{money(Number(row.entry_minor))}</p></td><td className="py-3"><StatusTag value={row.state}/></td><td className="py-3">{row.spins_used||0}/3</td><td className="py-3 font-bold text-purple-700">{money(Number(row.wins_paid_minor||0))}</td><td className="py-3 text-amber-700">{money(Number(row.wins_owed_minor||0))}</td><td className="py-3"><details className="max-w-xs"><summary className="cursor-pointer font-bold text-purple-700">Show round</summary><div className="mt-2 space-y-2 break-all text-xs"><p>Created: {stamp(row.created_at)}</p><p>Updated: {stamp(row.updated_at)}</p><p>Rules version: {row.config_id}</p><p>Lucky marker: {row.lucky_digit}</p><p>Customer account: {row.source_account}</p><p>Spin account: {row.spin_account}</p><p>Entry receipt: {row.entry_provider_id||'not confirmed'}</p>{row.error&&<p className="text-red-700">{row.error}</p>}<Link className="block text-emerald-700" to={`/games?tab=entries&player=${row.user_id}`}>View entry history</Link><Link className="block text-purple-700" to={`/games?tab=winnings&player=${row.user_id}`}>View winnings history</Link></div></details></td></tr>)}</tbody></table>
          :<table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Player / game</th><th>{tab==='entries'?'Entry amount':'Prize amount'}</th><th>{tab==='entries'?'Direction':'Spin / number'}</th><th>Payment status</th><th>Provider receipt</th><th>Time / full details</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.id} className="border-t align-top"><td className="p-3"><PlayerName row={row}/><p className="mt-2 break-all font-mono text-[10px] text-slate-500">Game: {row.round_id}</p></td><td className={`py-3 font-bold ${tab==='entries'?'text-emerald-700':'text-purple-700'}`}>{money(Number(row.amount_minor))}</td><td className="py-3">{tab==='entries'?'Customer → Spin':`Spin ${row.spin_index} · Number ${row.digit}`}<p className="mt-1 text-xs text-slate-500">{tab==='winnings'?'Spin → Customer':'Three spins per paid entry'}</p></td><td className="py-3"><StatusTag value={row.status}/></td><td className="max-w-[180px] break-all py-3 font-mono text-xs">{row.provider_id||'Not confirmed'}</td><td className="py-3"><p className="text-xs">{stamp(row.created_at)}</p><details className="mt-2 max-w-xs"><summary className="cursor-pointer font-bold text-purple-700">Show payment</summary><div className="mt-2 space-y-2 break-all text-xs"><p>Recorded receipt ID: {row.id}</p><p>Source: {row.source_account}</p><p>Destination: {row.destination_account}</p><p>Request key: {row.request_key}</p><p>Updated: {stamp(row.updated_at)}</p><p>Round state: {row.round_state}</p><p>Rules version: {row.config_id}</p>{row.error&&<p className="text-red-700">{row.error}</p>}</div></details></td></tr>)}</tbody></table>}
        </div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm"><p>Page {page} of {pages} · Up to {data.pageSize} records per page</p><div className="flex gap-2"><button disabled={loading||page<=1} onClick={()=>setPage(p=>p-1)} className="rounded-xl border px-4 py-2 disabled:opacity-40">Previous</button><button disabled={loading||page>=pages} onClick={()=>setPage(p=>p+1)} className="rounded-xl border px-4 py-2 disabled:opacity-40">Next</button></div></div>
      </>}
    </div>
  </div>;
}
